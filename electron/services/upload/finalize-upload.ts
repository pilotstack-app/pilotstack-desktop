/**
 * Finalize Upload
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
 *
 * Recording finalization after upload.
 */

import type { Recording } from "../../config/types";
import { secureAuthManager } from "../../config/store";
import { buildApiUrl, buildApiUrlWithParams } from "../../config/api";
import { createSignedHeaders, refreshAccessToken } from "./auth-helpers";

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
 * Finalize recording metadata with the backend finalize endpoint.
 */
export async function finalizeRecording(
  recording: Recording,
  uploadResult: { key?: string; publicUrl?: string },
  token: string,
  metadata: {
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

  const keyboardStats = metadata.keyboardStats || {};
  const description = (recording as any).description || undefined;

  const body = {
    title: recording.title || `Recording ${new Date().toLocaleDateString()}`,
    description,
    duration: metadata.totalDuration,
    activeDuration: metadata.activeDuration,
    verificationScore: metadata.verificationScore,
    isVerified: metadata.isVerified,
    pasteEventCount: metadata.pasteEventCount,
    videoKey: uploadResult.key || "",
    // keyboard stats
    estimatedKeystrokes: keyboardStats.estimatedKeystrokes || undefined,
    estimatedWordsTyped: keyboardStats.estimatedWordsTyped || undefined,
    typingBurstCount: keyboardStats.typingBurstCount || undefined,
    peakWPM: keyboardStats.peakWPM || undefined,
    averageWPM: keyboardStats.averageWPM || undefined,
    // mouse stats
    mouseClicks: keyboardStats.mouseClicks || undefined,
    scrollEvents: keyboardStats.scrollEvents || undefined,
    // computed
    typingIntensity: keyboardStats.typingIntensity || undefined,
  };

  const bodyString = JSON.stringify(body);
  const signedHeaders = createSignedHeaders(bodyString);

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

  return {
    success: true,
    recordingId: result.recording.id,
    videoUrl: result.videoUrl || buildApiUrlWithParams("RECORDINGS_VIEW", result.recording.id),
    key: uploadResult.key,
  };
}
