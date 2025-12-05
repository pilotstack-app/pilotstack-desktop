/**
 * Recordings Store Operations
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 *
 * CRUD operations for recordings storage.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import type { Recording, RecordingStatus } from "../../config/types";
import { recordingsStore } from "../../config/store";
import { logger } from "../../utils/logger";
import { VALID_TRANSITIONS, type RecordingData, type TransitionResult, type DeleteResult, type DiskUsage } from "./types";

/**
 * Generate a unique recording ID
 */
export function generateRecordingId(): string {
  return `rec_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

/**
 * Get all recordings from the library
 * Sorted by createdAt descending (newest first)
 */
export function getAllRecordings(): Recording[] {
  const recordings = recordingsStore.get("recordings") || [];
  // Sort by createdAt descending (newest first)
  return recordings.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get a single recording by ID
 */
export function getRecording(id: string): Recording | null {
  const recordings = getAllRecordings();
  return recordings.find((r) => r.id === id) || null;
}

/**
 * Get the most recent recording
 */
export function getLatestRecording(): Recording | null {
  const recordings = getAllRecordings();
  return recordings.length > 0 ? recordings[0] : null;
}

/**
 * Get recordings by status
 */
export function getRecordingsByStatus(status: RecordingStatus): Recording[] {
  const recordings = getAllRecordings();
  return recordings.filter((r) => r.status === status);
}

/**
 * Get recordings pending upload (upload_queued status)
 */
export function getPendingUploads(): Recording[] {
  return getRecordingsByStatus("upload_queued");
}

/**
 * Add a new recording to the library
 */
export function addRecording(recordingData: RecordingData): Recording {
  const now = Date.now();
  const recording: Recording = {
    id: generateRecordingId(),
    sessionId: recordingData.sessionId || `session_${now}`,
    createdAt: now,
    updatedAt: now,
    // Paths
    videoPath: recordingData.videoPath,
    framesDir: recordingData.framesDir || null,
    // Metadata
    title: recordingData.title || `Recording ${new Date().toLocaleDateString()}`,
    duration: recordingData.duration || 0,
    activeDuration: recordingData.activeDuration || 0,
    frameCount: recordingData.frameCount || 0,
    verificationScore: recordingData.verificationScore || 0,
    isVerified: recordingData.isVerified || false,
    pasteEventCount: recordingData.pasteEventCount || 0,
    fileSize: recordingData.fileSize || 0,
    // State machine
    status: recordingData.status || "ready",
    // Upload state
    uploadAttemptCount: 0,
    lastUploadAt: null,
    uploadProgress: 0,
    uploadError: null,
    // Cloud binding
    cloudRecordingId: null,
    cloudUrl: null,
    connectedUserId: null,
    uploadCheckpoint: null,
  };

  const recordings = getAllRecordings();
  recordings.unshift(recording); // Add to beginning
  recordingsStore.set("recordings", recordings);

  logger.info("Recording added to library", {
    id: recording.id,
    title: recording.title,
    status: recording.status,
  });

  return recording;
}

/**
 * Update a recording by ID
 */
export function updateRecording(
  id: string,
  updates: Partial<Recording>
): Recording | null {
  const recordings = getAllRecordings();
  const index = recordings.findIndex((r) => r.id === id);

  if (index === -1) {
    logger.warn("Recording not found for update", { id });
    return null;
  }

  const recording = recordings[index];
  const updatedRecording: Recording = {
    ...recording,
    ...updates,
    updatedAt: Date.now(),
  };

  recordings[index] = updatedRecording;
  recordingsStore.set("recordings", recordings);

  logger.info("Recording updated", {
    id,
    updates: Object.keys(updates),
  });

  return updatedRecording;
}

/**
 * Transition recording status with validation
 */
export function transitionRecordingStatus(
  id: string,
  newStatus: RecordingStatus
): TransitionResult {
  const recording = getRecording(id);
  if (!recording) {
    logger.warn("Recording not found for status transition", { id });
    return { success: false, error: "Recording not found" };
  }

  const currentStatus = recording.status;
  const validTransitions = VALID_TRANSITIONS[currentStatus] || [];

  if (!validTransitions.includes(newStatus)) {
    logger.warn("Invalid status transition", {
      id,
      from: currentStatus,
      to: newStatus,
      valid: validTransitions,
    });
    return {
      success: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  const updated = updateRecording(id, { status: newStatus });
  if (!updated) {
    return { success: false, error: "Failed to update recording" };
  }

  logger.info("Recording status transitioned", {
    id,
    from: currentStatus,
    to: newStatus,
  });

  return { success: true, recording: updated };
}

/**
 * Delete a recording from the library
 */
export function deleteRecording(
  id: string,
  deleteFiles: boolean = false
): DeleteResult {
  const recording = getRecording(id);
  if (!recording) {
    return { success: false, error: "Recording not found" };
  }

  // Optionally delete the video file
  if (deleteFiles && recording.videoPath) {
    try {
      if (fs.existsSync(recording.videoPath)) {
        fs.unlinkSync(recording.videoPath);
        logger.info("Deleted video file", { path: recording.videoPath });
      }
    } catch (error) {
      logger.warn("Failed to delete video file", {
        path: recording.videoPath,
        error: (error as Error).message,
      });
    }
  }

  const recordings = getAllRecordings();
  const filtered = recordings.filter((r) => r.id !== id);
  recordingsStore.set("recordings", filtered);

  logger.info("Recording deleted from library", { id, deleteFiles });

  return { success: true };
}

/**
 * Check if video file exists for a recording
 */
export function checkVideoExists(id: string): boolean {
  const recording = getRecording(id);
  if (!recording) return false;
  return recording.videoPath ? fs.existsSync(recording.videoPath) : false;
}

/**
 * Get disk usage for all recordings
 */
export function getDiskUsage(): DiskUsage {
  const recordings = getAllRecordings();
  let totalSize = 0;
  let count = 0;

  for (const recording of recordings) {
    if (recording.videoPath && fs.existsSync(recording.videoPath)) {
      try {
        const stats = fs.statSync(recording.videoPath);
        totalSize += stats.size;
        count++;
      } catch (_e) {
        // Ignore errors
      }
    }
  }

  return {
    totalSize,
    count,
    formattedSize: formatBytes(totalSize),
  };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
