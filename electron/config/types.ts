/**
 * Configuration Type Definitions
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Configuration & Settings §Settings Store Schema
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 */

/**
 * Quality preset levels
 */
export type QualityPreset = "ultra_low" | "low" | "medium" | "high" | "max";

/**
 * Compression mode
 */
export type CompressionMode = "speed" | "balanced" | "quality";

/**
 * Watermark position
 */
export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Recording status (state machine)
 */
export type RecordingStatus =
  | "recording"
  | "processing"
  | "ready"
  | "upload_queued"
  | "uploading"
  | "uploaded"
  | "failed";

/**
 * Application settings schema
 */
export interface AppSettings {
  frameRate: number; // 1-60 fps
  captureInterval: number; // 100-10000ms
  outputDirectory: string;
  theme: "dark" | "light";
  useHardwareAcceleration: boolean;
  captureQuality: QualityPreset;
  useJpegCapture: boolean;
  enableAdaptiveQuality: boolean;
  enableFrameSkipping: boolean;
  enableDynamicInterval: boolean;
  maxQueueSize: number; // 10-200
  maxCapturePixels: number; // 0 = unlimited
  jpegQuality: number; // 20-95
  compressionMode: CompressionMode;
  useStreamingEncoder: boolean;
  showWatermark: boolean;
  watermarkText: string;
  watermarkOpacity: number; // 0.1-1.0
  watermarkPosition: WatermarkPosition;
  showVerificationBadge: boolean;
  showStatsOverlay: boolean;
  userHandle: string;
}

/**
 * Session recovery state
 */
export interface SessionState {
  sessionFolder: string;
  sourceId: string;
  startTime: number;
  frameCount: number;
  isActive: boolean;
  lastHeartbeat: number;
}

/**
 * Upload checkpoint part
 */
export interface UploadCheckpointPart {
  partNumber: number;
  etag: string;
}

/**
 * Upload checkpoint for resumable uploads
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Multipart Upload
 */
export interface UploadCheckpoint {
  uploadId: string;
  key: string;
  completedParts: UploadCheckpointPart[];
  totalParts: number;
  partSize: number;
  fileSize: number;
  lastUpdatedAt: number;
}

/**
 * Recording entity
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 */
export interface Recording {
  id: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  videoPath: string;
  framesDir: string | null;
  title: string;
  duration: number;
  activeDuration: number;
  frameCount: number;
  verificationScore: number;
  isVerified: boolean;
  pasteEventCount: number;
  fileSize: number;
  status: RecordingStatus;
  uploadAttemptCount: number;
  lastUploadAt: number | null;
  uploadProgress: number; // 0-100
  uploadError: string | null;
  cloudRecordingId: string | null;
  cloudUrl: string | null;
  connectedUserId: string | null;
  uploadCheckpoint: UploadCheckpoint | null;
}

/**
 * Stored auth data structure
 */
export interface StoredAuthData {
  accessToken: string; // Encrypted
  refreshToken: string; // Encrypted
  deviceId: string;
  deviceSecret: string; // Encrypted
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  userProfile: UserProfile | null;
  lastUpdated: number;
}

/**
 * Auth credentials (decrypted)
 */
export interface AuthCredentials {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  deviceSecret: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  userProfile?: UserProfile;
}

/**
 * Auth state for renderer
 */
export interface AuthState {
  isConnected: boolean;
  deviceId: string | null;
  userProfile: UserProfile | null;
  accessTokenExpiresAt?: number;
  needsRefresh: boolean;
  wasConnected: boolean;
  sessionExpired: boolean;
}

/**
 * User profile
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatarUrl?: string;
}

