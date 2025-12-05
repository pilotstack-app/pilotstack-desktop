/**
 * IPC Type Definitions
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - IPC Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow
 */

import { KeyboardStats } from "../monitors/keyboard-monitor";

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  // Capture
  CAPTURE_START: "capture:start",
  CAPTURE_STOP: "capture:stop",
  CAPTURE_PAUSE: "capture:pause",
  CAPTURE_RESUME: "capture:resume",
  CAPTURE_EMERGENCY_STOP: "capture:emergency-stop",
  RECORDING_GET_STATE: "recording:get-state",
  
  // Video
  VIDEO_GENERATE: "video:generate",
  VIDEO_VALIDATE_FRAMES: "video:validate-frames",
  
  // Session
  SESSION_CHECK_RECOVERY: "session:check-recovery",
  SESSION_RECOVER: "session:recover",
  SESSION_CLEAR_RECOVERY: "session:clear-recovery",
  
  // Activity
  ACTIVITY_GET_STATS: "activity:get-stats",
  CLIPBOARD_GET_EVENTS: "clipboard:get-events",
  KEYBOARD_GET_STATS: "keyboard:get-stats",
  
  // Auth
  AUTH_GET_DEVICE_INFO: "auth:get-device-info",
  AUTH_GET_TOKEN: "auth:get-token",
  AUTH_REFRESH_TOKEN: "auth:refresh-token",
  AUTH_GET_USER_PROFILE: "auth:get-user-profile",
  AUTH_CLEAR_TOKEN: "auth:clear-token",
  
  // Cloud Upload
  CLOUD_UPLOAD_RECORDING: "cloud:upload-recording",
  
  // Recordings
  RECORDINGS_LIST: "recordings:list",
  RECORDINGS_GET: "recordings:get",
  RECORDINGS_ADD: "recordings:add",
  RECORDINGS_DELETE: "recordings:delete",
  RECORDINGS_REQUEST_UPLOAD: "recordings:requestUpload",
  RECORDINGS_RETRY_UPLOAD: "recordings:retryUpload",
  
  // App
  APP_GET_SOURCES: "app:get-sources",
  APP_GET_PERFORMANCE_INFO: "app:get-performance-info",
  APP_IS_PACKAGED: "app:is-packaged",
} as const;

/**
 * IPC request/response types
 */
export interface CaptureStartRequest {
  sourceId: string;
}

export interface CaptureResumeRequest {
  sourceId?: string;
}

export interface VideoGenerateRequest {
  sessionFolder: string;
  musicPath?: string;
}

export interface SessionRecoverRequest {
  sessionFolder: string;
}

export interface CloudUploadRequest {
  videoPath: string;
  metadata?: {
    totalDuration?: number;
    activeDuration?: number;
    pasteEventCount?: number;
    verificationScore?: number;
    isVerified?: boolean;
    keyboardStats?: KeyboardStats;
  };
}

export interface VideoGenerateRequestWithMetadata extends VideoGenerateRequest {
  metadata?: {
    totalDuration?: number;
    activeDuration?: number;
    pasteEventCount?: number;
    verificationScore?: number;
    isVerified?: boolean;
    keyboardStats?: KeyboardStats;
  };
}

/**
 * Normalized progress shape for all long-running operations.
 * - phase: logical phase of the operation (e.g., "capture", "processing", "upload")
 * - percent: 0-100 progress value
 * - etaSeconds: optional remaining time estimate
 * - message: optional human-friendly status
 */
export interface NormalizedProgress {
  phase: string;
  percent: number;
  etaSeconds?: number | null;
  message?: string;
}

