/**
 * Finalize Upload
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
 *
 * Recording finalization after upload.
 */

import * as fs from "fs";
import * as path from "path";
import type { Recording, SessionMetrics } from "../../config/types";
import { secureAuthManager } from "../../config/store";
import { buildApiUrl, buildApiUrlWithParams } from "../../config/api";
import { createSignedHeaders, refreshAccessToken } from "./auth-helpers";
import { logger } from "../../utils/logger";

/**
 * Upload result interface
 */
export interface UploadResult {
  success: boolean;
  recordingId?: string;
  videoUrl?: string;
  error?: string;
  localOnly?: boolean;
  key?: string;
}

/**
 * Load metrics from disk if available
 */
async function loadMetricsFromDisk(recording: Recording): Promise<SessionMetrics | null> {
  // If metrics are already in the recording, use them
  if (recording.metrics) {
    return recording.metrics;
  }

  // Try to load from session folder (framesDir typically points to it)
  const sessionFolder = recording.framesDir;
  if (!sessionFolder) {
    // Try to infer from video path
    const videoDir = path.dirname(recording.videoPath);
    const metricsPath = path.join(videoDir, "metrics.json");
    if (fs.existsSync(metricsPath)) {
      try {
        const data = await fs.promises.readFile(metricsPath, "utf-8");
        return JSON.parse(data) as SessionMetrics;
      } catch (err: any) {
        logger.warn("Failed to load metrics from video dir", { error: err.message });
      }
    }
    return null;
  }

  const metricsPath = path.join(sessionFolder, "metrics.json");
  if (!fs.existsSync(metricsPath)) {
    logger.debug("No metrics.json found", { sessionFolder });
    return null;
  }

  try {
    const data = await fs.promises.readFile(metricsPath, "utf-8");
    return JSON.parse(data) as SessionMetrics;
  } catch (err: any) {
    logger.warn("Failed to load metrics.json", { error: err.message });
    return null;
  }
}

/**
 * Build the API request body from recording and metrics
 */
function buildFinalizeBody(
  recording: Recording,
  uploadResult: { key?: string },
  metrics: SessionMetrics | null
): Record<string, any> {
  const description = (recording as any).description || undefined;

  // Base body with required fields
  const body: Record<string, any> = {
    title: recording.title || `Recording ${new Date().toLocaleDateString()}`,
    description,
    duration: recording.duration || 0,
    activeDuration: recording.activeDuration || 0,
    verificationScore: recording.verificationScore || 0,
    isVerified: recording.isVerified || false,
    pasteEventCount: recording.pasteEventCount || 0,
    videoKey: uploadResult.key || "",
    // Phase 5: Include projectId for project assignment
    projectId: recording.projectId || undefined,
  };

  // Add structured metrics if available
  if (metrics) {
    const { input, activity } = metrics;
    const { keyboard, mouse, clipboard } = input;

    // Keyboard stats
    body.estimatedKeystrokes = keyboard.estimatedKeystrokes || undefined;
    body.estimatedWordsTyped = keyboard.estimatedWordsTyped || undefined;
    body.typingBurstCount = keyboard.typingBurstCount || undefined;
    body.peakWPM = keyboard.peakWPM || undefined;
    body.averageWPM = keyboard.averageWPM || undefined;
    body.keyboardActiveTime = keyboard.keyboardActiveTime || undefined;
    body.shortcutEstimate = keyboard.shortcutEstimate || undefined;
    body.typingIntensity = keyboard.typingIntensity || undefined;

    // Mouse stats
    body.mouseClicks = mouse.mouseClicks || undefined;
    body.mouseDistance = mouse.mouseDistance || undefined;
    body.scrollEvents = mouse.scrollEvents || undefined;

    // Clipboard stats
    body.pasteEventCount = clipboard.pasteEventCount || body.pasteEventCount;
    body.totalPastedCharacters = clipboard.totalPastedCharacters || undefined;
    body.largePasteCount = clipboard.largePasteCount || undefined;

    // Activity stats
    body.activeDuration = activity.activeDuration || body.activeDuration;
    body.idleDuration = activity.idleDuration || undefined;
    body.activityRatio = activity.activityRatio || undefined;
    body.keystrokesPerMinute = activity.keystrokesPerMinute || undefined;
    body.clicksPerMinute = activity.clicksPerMinute || undefined;
    body.inputEventsPerMinute = activity.inputEventsPerMinute || undefined;
    body.hasNaturalTypingPattern = activity.hasNaturalTypingPattern;
    body.hasSuspiciousWPM = activity.hasSuspiciousWPM;
    body.hasExcessivePasting = activity.hasExcessivePasting;
    body.activityScore = activity.activityScore || undefined;

    // Total input events
    body.totalInputEvents = input.totalInputEvents || undefined;

    logger.info("Finalize body built with metrics", {
      hasKeyboard: !!keyboard.estimatedKeystrokes,
      hasMouse: !!mouse.mouseClicks,
      hasClipboard: !!clipboard.pasteEventCount,
      activityScore: activity.activityScore,
    });
  } else {
    logger.warn("No metrics available for finalize");
  }

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(body).filter(([_, v]) => v !== undefined)
  );
}

/**
 * Finalize recording metadata with the backend finalize endpoint.
 */
export async function finalizeRecording(
  recording: Recording,
  uploadResult: { key?: string; publicUrl?: string },
  token: string,
  _metadata: {
    totalDuration: number;
    activeDuration: number;
    pasteEventCount: number;
    verificationScore: number;
    isVerified: boolean;
    keyboardStats?: any;
  },
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  if (!uploadResult.key) {
    return { success: false, error: "Missing video key for finalize" };
  }

  // Load metrics from disk or recording
  const metrics = await loadMetricsFromDisk(recording);

  // Build the request body
  const body = buildFinalizeBody(recording, uploadResult, metrics);

  const bodyString = JSON.stringify(body);
  const signedHeaders = createSignedHeaders(bodyString);

  logger.info("Finalizing recording with cloud", {
    recordingId: recording.id,
    hasMetrics: !!metrics,
    bodyFields: Object.keys(body),
  });

  const doRequest = async (authToken: string) =>
    fetch(buildApiUrl("RECORDINGS_FINALIZE"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...signedHeaders,
      },
      body: bodyString,
    });

  let authToken = token;
  let resp = await doRequest(authToken);
  if ((resp.status === 401 || resp.status === 403) && (await refreshAccessToken())) {
    const refreshed = secureAuthManager.getAccessToken() || token;
    authToken = refreshed;
    resp = await doRequest(authToken);
  }

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    let errorData = {};
    try {
      errorData = errorText ? JSON.parse(errorText) : {};
    } catch {
      // ignore
    }
    logger.error("Finalize request failed", {
      status: resp.status,
      error: (errorData as any).error || errorText,
    });
    return {
      success: false,
      error: (errorData as any).error || `Failed to finalize recording: ${resp.status}`,
    };
  }

  const result = (await resp.json()) as {
    recording?: { id: string };
    videoUrl?: string;
  };

  if (!result.recording?.id) {
    return { success: false, error: "Invalid finalize result from server" };
  }

  if (onProgress) onProgress(100);

  logger.info("Recording finalized successfully", {
    cloudRecordingId: result.recording.id,
    videoUrl: result.videoUrl,
  });

  return {
    success: true,
    recordingId: result.recording.id,
    videoUrl: result.videoUrl || buildApiUrlWithParams("RECORDINGS_VIEW", result.recording.id),
    key: uploadResult.key,
  };
}
