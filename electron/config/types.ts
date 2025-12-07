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
 * Keyboard input metrics
 * 
 * Tracks keyboard activity patterns for verification scoring.
 */
export interface KeyboardMetrics {
  estimatedKeystrokes: number;
  keyboardActiveTime: number; // seconds
  estimatedWordsTyped: number;
  typingBurstCount: number;
  averageWPM: number;
  peakWPM: number;
  shortcutEstimate: number;
  typingIntensity: number; // keystrokes per active minute
}

/**
 * Mouse input metrics
 * 
 * Tracks mouse activity for verification scoring.
 */
export interface MouseMetrics {
  mouseClicks: number;
  mouseDistance: number; // pixels
  scrollEvents: number;
}

/**
 * Clipboard/paste metrics
 * 
 * Tracks paste events for verification scoring.
 */
export interface ClipboardMetrics {
  pasteEventCount: number;
  totalPastedCharacters: number;
  largePasteCount: number; // pastes > 500 chars
  pasteTimestamps: number[];
}

/**
 * Combined input metrics
 * 
 * Aggregates all input activity for a recording session.
 */
export interface InputMetrics {
  keyboard: KeyboardMetrics;
  mouse: MouseMetrics;
  clipboard: ClipboardMetrics;
  totalInputEvents: number;
  sessionDuration: number; // seconds
  lastActivityTime: number | null;
}

/**
 * Activity analysis stats
 * 
 * Computed statistics from input metrics for verification.
 */
export interface ActivityStats {
  // Time-based
  totalDuration: number; // seconds
  activeDuration: number; // seconds (time with input activity)
  idleDuration: number; // seconds
  activityRatio: number; // activeDuration / totalDuration (0-1)
  
  // Input density
  keystrokesPerMinute: number;
  clicksPerMinute: number;
  inputEventsPerMinute: number;
  
  // Verification indicators
  hasNaturalTypingPattern: boolean;
  hasSuspiciousWPM: boolean;
  hasExcessivePasting: boolean;
  
  // Raw score contribution
  activityScore: number; // 0-100
}

/**
 * Session metrics file structure
 * 
 * Written to metrics.json in the session folder.
 */
export interface SessionMetrics {
  version: number;
  sessionId: string;
  startTime: number;
  endTime: number | null;
  lastUpdated: number;
  input: InputMetrics;
  activity: ActivityStats;
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
  // New: structured metrics
  metrics: SessionMetrics | null;
  // Phase 5: Project assignment
  projectId: string | null;
  projectName: string | null;
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

// =============================================================================
// Projects Feature Types (Phase 5: Desktop App Integration)
// =============================================================================

/**
 * Project visibility options
 */
export type ProjectVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

/**
 * Project entity from the API
 * 
 * Matches the Project model from the web platform.
 */
export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  
  // Computed stats
  totalDuration: number;
  totalRecordings: number;
  verifiedDuration: number;
  
  // Visibility
  visibility: ProjectVisibility;
  slug: string | null;
  
  // Metadata
  isArchived: boolean;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response from GET /api/projects
 */
export interface ProjectsListResponse {
  projects: Project[];
  uncategorizedCount: number;
}

/**
 * Project selection for recording
 */
export interface ProjectSelection {
  projectId: string | null;
  projectName: string | null;
}

/**
 * Project pattern for auto-detection
 */
export interface ProjectPattern {
  projectId: string;
  pattern: string; // Regex pattern or string match
  priority: number;
}

