/**
 * Recordings Manager Types
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 *
 * Type definitions for the recordings manager.
 */

import type { Recording, RecordingStatus, SessionMetrics } from "../../config/types";

/**
 * Valid status transitions
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - State Machine
 */
export const VALID_TRANSITIONS: Record<RecordingStatus, RecordingStatus[]> = {
  recording: ["processing"],
  processing: ["ready", "failed"],
  ready: ["upload_queued", "uploading"],
  upload_queued: ["uploading", "ready"], // Can cancel queue
  uploading: ["uploaded", "failed"],
  uploaded: [], // Terminal state
  failed: ["upload_queued", "uploading", "ready"], // Can retry or cancel
};

/**
 * Recording data for adding new recording (without auto-generated fields)
 */
export interface RecordingData {
  sessionId?: string;
  videoPath: string;
  framesDir?: string | null;
  title?: string;
  duration?: number;
  activeDuration?: number;
  frameCount?: number;
  verificationScore?: number;
  isVerified?: boolean;
  pasteEventCount?: number;
  fileSize?: number;
  status?: RecordingStatus;
  // Structured metrics from MetricsAggregator
  metrics?: SessionMetrics | null;
  // Phase 5: Project assignment
  projectId?: string | null;
  projectName?: string | null;
}

/**
 * Transition result
 */
export interface TransitionResult {
  success: boolean;
  error?: string;
  recording?: Recording;
}

/**
 * Delete result
 */
export interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Disk usage information
 */
export interface DiskUsage {
  totalSize: number;
  count: number;
  formattedSize: string;
}
