/**
 * Recordings Upload Operations
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 *
 * Upload state management and checkpoint operations.
 */

import * as fs from "fs";
import type { Recording, UploadCheckpoint, RecordingStatus } from "../../config/types";
import { secureAuthManager } from "../../config/store";
import { logger } from "../../utils/logger";
import type { TransitionResult } from "./types";
import {
  getRecording,
  getAllRecordings,
  updateRecording,
  transitionRecordingStatus,
  getPendingUploads,
} from "./store-operations";

/**
 * Request upload for a recording
 * Sets status to upload_queued if not connected, uploading if connected
 */
export function requestUpload(
  id: string,
  isConnected: boolean = false
): TransitionResult {
  const recording = getRecording(id);
  if (!recording) {
    return { success: false, error: "Recording not found" };
  }

  // Validate current status allows upload
  if (!["ready", "failed"].includes(recording.status)) {
    return {
      success: false,
      error: `Cannot upload recording with status: ${recording.status}`,
    };
  }

  // Check if video file exists
  if (!recording.videoPath || !fs.existsSync(recording.videoPath)) {
    updateRecording(id, {
      status: "failed",
      uploadError: "Video file not found",
    });
    return { success: false, error: "Video file not found" };
  }

  const newStatus: RecordingStatus = isConnected ? "uploading" : "upload_queued";
  const updated = updateRecording(id, {
    status: newStatus,
    uploadError: null,
    uploadProgress: 0,
  });

  if (!updated) {
    return { success: false, error: "Failed to update recording" };
  }

  logger.info("Upload requested", {
    id,
    status: newStatus,
    isConnected,
  });

  return { success: true, recording: updated };
}

/**
 * Update upload progress
 */
export function updateUploadProgress(id: string, progress: number): void {
  updateRecording(id, { uploadProgress: Math.min(100, Math.max(0, progress)) });
}

/**
 * Mark upload as complete
 */
export function markUploadComplete(
  id: string,
  cloudRecordingId: string,
  cloudUrl: string,
  connectedUserId: string | null = null
): Recording | null {
  const updated = updateRecording(id, {
    status: "uploaded",
    uploadProgress: 100,
    uploadError: null,
    cloudRecordingId,
    cloudUrl,
    connectedUserId,
    lastUploadAt: Date.now(),
  });

  if (updated) {
    logger.info("Upload completed", {
      id,
      cloudRecordingId,
      cloudUrl,
    });
  }

  return updated;
}

/**
 * Mark upload as failed
 */
export function markUploadFailed(id: string, error: string): Recording | null {
  const recording = getRecording(id);
  if (!recording) return null;

  const updated = updateRecording(id, {
    status: "failed",
    uploadError: error,
    uploadAttemptCount: recording.uploadAttemptCount + 1,
    lastUploadAt: Date.now(),
  });

  if (updated) {
    logger.warn("Upload failed", {
      id,
      error,
      attemptCount: updated.uploadAttemptCount,
    });
  }

  return updated;
}

/**
 * Retry a failed upload
 */
export function retryUpload(id: string): TransitionResult {
  const recording = getRecording(id);
  if (!recording) {
    return { success: false, error: "Recording not found" };
  }

  if (recording.status !== "failed") {
    return {
      success: false,
      error: `Cannot retry upload for recording with status: ${recording.status}`,
    };
  }

  const updated = updateRecording(id, {
    status: "uploading",
    uploadError: null,
    uploadProgress: 0,
  });

  if (!updated) {
    return { success: false, error: "Failed to update recording" };
  }

  logger.info("Retrying upload", {
    id,
    attemptCount: updated.uploadAttemptCount,
  });

  return { success: true, recording: updated };
}

// ============ Upload Checkpoint Management ============

/**
 * Save upload checkpoint for resumable uploads
 * Called after each batch of parts completes
 */
export function saveUploadCheckpoint(
  id: string,
  checkpoint: UploadCheckpoint
): Recording | null {
  const recording = getRecording(id);
  if (!recording) {
    logger.warn("Cannot save checkpoint - recording not found", { id });
    return null;
  }

  const uploadCheckpoint: UploadCheckpoint = {
    uploadId: checkpoint.uploadId,
    key: checkpoint.key,
    completedParts: checkpoint.completedParts || [],
    totalParts: checkpoint.totalParts,
    partSize: checkpoint.partSize,
    fileSize: checkpoint.fileSize,
    lastUpdatedAt: Date.now(),
  };

  const updated = updateRecording(id, { uploadCheckpoint });

  if (updated) {
    logger.debug("Upload checkpoint saved", {
      id,
      uploadId: checkpoint.uploadId,
      completedPartsCount: uploadCheckpoint.completedParts.length,
      totalParts: checkpoint.totalParts,
    });
  }

  return updated;
}

/**
 * Get upload checkpoint for a recording
 */
export function getUploadCheckpoint(id: string): UploadCheckpoint | null {
  const recording = getRecording(id);
  return recording?.uploadCheckpoint || null;
}

/**
 * Clear upload checkpoint (after successful upload or abort)
 */
export function clearUploadCheckpoint(id: string): Recording | null {
  const updated = updateRecording(id, { uploadCheckpoint: null });
  if (updated) {
    logger.debug("Upload checkpoint cleared", { id });
  }
  return updated;
}

/**
 * Get all recordings with incomplete uploads (have checkpoint data)
 * Used on app startup to offer resume
 */
export function getIncompleteUploads(): Recording[] {
  const recordings = getAllRecordings();
  return recordings.filter((r) => {
    // Must have a valid checkpoint
    if (!r.uploadCheckpoint?.uploadId) return false;
    // Must be in uploading or failed status
    if (!["uploading", "failed"].includes(r.status)) return false;
    // Video file must still exist
    if (!r.videoPath || !fs.existsSync(r.videoPath)) return false;
    // Checkpoint should not be too old (48 hours max - S3 multipart expires)
    const checkpointAge = Date.now() - (r.uploadCheckpoint.lastUpdatedAt || 0);
    const maxAge = 48 * 60 * 60 * 1000; // 48 hours
    return checkpointAge < maxAge;
  });
}

/**
 * Check if a recording has a valid resumable checkpoint
 */
export function hasResumableUpload(id: string): boolean {
  const recording = getRecording(id);
  if (!recording?.uploadCheckpoint?.uploadId) return false;

  // Check checkpoint age (S3 multipart uploads expire after ~7 days, but we use 48h to be safe)
  const checkpointAge =
    Date.now() - (recording.uploadCheckpoint.lastUpdatedAt || 0);
  const maxAge = 48 * 60 * 60 * 1000;

  return checkpointAge < maxAge;
}

/**
 * Process pending uploads after authentication
 * Returns list of recordings that should be uploaded
 */
export function processPendingUploads(): Recording[] {
  const pending = getPendingUploads();

  if (pending.length === 0) {
    return [];
  }

  logger.info("Processing pending uploads after auth", {
    count: pending.length,
  });

  // Transition all pending to uploading
  const toUpload: Recording[] = [];
  for (const recording of pending) {
    const result = transitionRecordingStatus(recording.id, "uploading");
    if (result.success && result.recording) {
      toUpload.push(result.recording);
    }
  }

  return toUpload;
}

/**
 * Request upload (async version with auth check)
 */
export async function requestUploadAsync(id: string): Promise<void> {
  const isConnected = secureAuthManager.isAuthenticated();
  const result = requestUpload(id, isConnected);
  if (!result.success) {
    throw new Error(result.error || "Failed to request upload");
  }
}

/**
 * Retry upload (async version)
 */
export async function retryUploadAsync(id: string): Promise<void> {
  const result = retryUpload(id);
  if (!result.success) {
    throw new Error(result.error || "Failed to retry upload");
  }
}
