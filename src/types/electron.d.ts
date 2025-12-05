export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

export interface CaptureStartResult {
  success: boolean;
  sessionFolder?: string;
  error?: string;
}

export interface CaptureStopResult {
  success: boolean;
  sessionFolder: string;
  totalFrames: number;
  droppedFrames?: number;
  activityStats?: ActivityStats;
  pasteEvents?: PasteEvent[];
  keyboardStats?: KeyboardStats;
  error?: string;
}

export interface FrameUpdateData {
  frameCount: number;
  estimatedDuration: number; // Timelapse duration (for "Video Length")
  realTimeDuration?: number; // Real-time elapsed duration (for "Elapsed Time")
  queueSize?: number;
  droppedFrames?: number;
  skippedFrames?: number;
  // Performance metrics
  adaptiveQuality?: string;
  captureTime?: number;
  compressionRatio?: string;
  avgFrameSize?: string;
  bufferSize?: number;
}

export interface VideoGenerateResult {
  success: boolean;
  outputFile: string;
  speedMultiplier?: number;
  originalFrames?: number;
}

export interface NormalizedProgress {
  phase: string;
  percent: number;
  etaSeconds?: number | null;
  message?: string;
}

// Backwards-compatible alias for video progress events
export interface VideoProgressData extends NormalizedProgress {
  /**
   * Legacy progress percentage used by older generators.
   * Prefer `percent` but keep this for compatibility.
   */
  progress?: number;
}

export interface ValidationProgressData {
  progress: number;
  message: string;
}

export interface FrameValidationResult {
  success: boolean;
  validFrames?: number;
  totalFrames?: number;
  invalidCount?: number;
  dimensions?: { width: number; height: number };
  error?: string;
}

export interface CaptureErrorData {
  message: string;
}

export interface ProcessingProgressData {
  processed: number;
  total: number;
  stage?: string;
}

export interface PerformanceInfo {
  platform: string;
  arch: string;
  cpuCount?: number;
  totalMemory?: number;
  isAppleSilicon?: boolean;
  avgCaptureTime?: number;
  droppedFrames: number;
  totalFrames: number;
  sharpAvailable?: boolean;
  workerAvailable?: boolean;
}

export type CaptureQuality = "low" | "medium" | "high" | "max";

// Activity tracking
export interface ActivityStats {
  totalDuration: number;
  activeDuration: number;
  idlePeriods: IdlePeriod[];
  idleCount: number;
  isCurrentlyIdle: boolean;
  isPaused: boolean;
}

export interface IdlePeriod {
  start: number;
  end: number;
  duration: number;
}

// Paste detection
export interface PasteEvent {
  timestamp: number;
  approximateSize: number;
  isLarge: boolean;
  frameIndex?: number;
}

// Keyboard activity tracking
// This interface matches the KeyboardStats returned by KeyboardMonitor
export interface KeyboardStats {
  // Core keystroke metrics
  estimatedKeystrokes: number;
  keyboardActiveTime: number; // seconds
  estimatedWordsTyped: number;
  
  // Typing patterns
  typingBurstCount: number;
  averageWPM: number;
  peakWPM: number;
  shortcutEstimate: number;
  
  // Mouse metrics
  mouseClicks: number;
  mouseDistance: number;
  scrollEvents: number;
  
  // Combined metrics
  totalInputEvents: number;
  keyboardOnlyPeriods: number;
  
  // Session info
  sessionDuration: number; // seconds
  lastActivityTime: number | null;
  
  // Typing intensity (keystrokes per active minute)
  typingIntensity: number;
}

export interface KeyboardActivityUpdate {
  estimatedKeystrokes: number;
  currentBurstKeystrokes: number;
  peakWPM: number;
  recentActivity: number;
}

// Recording state for recovery
export interface RecordingState {
  isRecording: boolean;
  sessionFolder: string | null;
  frameCount: number;
  sourceId: string | null;
  droppedFrames?: number;
  activityStats?: ActivityStats;
  pasteEvents?: PasteEvent[];
}

// Recoverable session data
export interface RecoverableSession {
  sessionFolder: string;
  sourceId: string;
  startTime: number;
  frameCount: number;
  isActive: boolean;
  lastHeartbeat: number;
  actualFrameCount?: number;
}

// Session recovery result
export interface SessionRecoveryResult {
  success: boolean;
  sessionFolder?: string;
  totalFrames?: number;
  dimensions?: { width: number; height: number };
  error?: string;
}

// Heartbeat data
export interface HeartbeatData {
  frameCount: number;
  sessionFolder: string;
  isActive: boolean;
  timestamp: number;
}

// Emergency stop data
export interface EmergencyStopData {
  sessionFolder: string;
  frameCount: number;
}

// Ghost mode
export interface GhostStatus {
  isGhostMode: boolean;
}

// Device/Auth
export interface DeviceInfo {
  deviceId: string | null;
  deviceName: string;
  platform: string;
  arch: string;
  fingerprint?: string;
}

export interface AuthToken {
  token: string | null;
  timestamp: number | null;
  isSecure?: boolean;
  needsRefresh?: boolean;
}

export interface AuthTokenReceived {
  success: boolean;
  token?: string;
  isEnhancedAuth?: boolean;
}

export interface AuthStatus {
  isConnected: boolean;
  tokenTimestamp?: number;
}

export interface AuthState {
  isConnected: boolean;
  deviceId: string | null;
  userProfile: UserProfile | null;
  accessTokenExpiresAt?: number;
  needsRefresh?: boolean;
  // Was previously connected (has stored credentials)
  wasConnected?: boolean;
  // Session fully expired (refresh token expired, needs full re-auth)
  sessionExpired?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl: string | null;
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  website?: string | null;
  twitter?: string | null;
  github?: string | null;
  createdAt?: string;
  stats?: {
    recordingCount: number;
    deviceCount: number;
    totalViews: number;
  };
}

export interface DeviceCredentials {
  deviceId: string;
  deviceSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

// Auto-update
export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

export interface UpdateCheckResult {
  success: boolean;
  updateAvailable?: boolean;
  updateInfo?: UpdateInfo;
  error?: string;
}

export interface UpdateDownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateStatus {
  updateAvailable: boolean;
  updateDownloaded: boolean;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  currentVersion: string;
}

export interface UpdateStatusEvent {
  status: 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-progress' | 'update-downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

// Upload
export interface UploadRecordingOptions {
  videoPath: string;
  metadata: SessionMetadata;
}

export interface UploadRecordingResult {
  success: boolean;
  recordingId?: string;
  videoUrl?: string;
  error?: string;
}

// Video generation with metadata
export interface VideoGenerateOptions {
  sessionFolder: string;
  musicPath?: string;
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  totalDuration: number;
  activeDuration: number;
  pasteEventCount: number;
  verificationScore: number;
  isVerified: boolean;
  // Keyboard activity stats (optional for backwards compatibility)
  keyboardStats?: {
    estimatedKeystrokes: number;
    estimatedWordsTyped: number;
    typingBurstCount: number;
    peakWPM: number;
    averageWPM: number;
    mouseClicks: number;
    scrollEvents: number;
    typingIntensity: number;
  };
}

// Recording status state machine
export type RecordingStatus =
  | "recording"
  | "processing"
  | "ready"
  | "upload_queued"
  | "uploading"
  | "uploaded"
  | "failed";

// Recording entity (persistent library)
export interface Recording {
  id: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  // Paths
  videoPath: string;
  framesDir: string | null;
  // Metadata
  title: string;
  duration: number;
  activeDuration: number;
  frameCount: number;
  verificationScore: number;
  isVerified: boolean;
  pasteEventCount: number;
  fileSize: number;
  // Keyboard activity stats
  keyboardStats?: {
    estimatedKeystrokes: number;
    estimatedWordsTyped: number;
    typingBurstCount: number;
    peakWPM: number;
    averageWPM: number;
    mouseClicks: number;
    scrollEvents: number;
    typingIntensity: number;
  } | null;
  // State machine
  status: RecordingStatus;
  // Upload state
  uploadAttemptCount: number;
  lastUploadAt: number | null;
  uploadProgress: number;
  uploadError: string | null;
  // Cloud binding
  cloudRecordingId: string | null;
  cloudUrl: string | null;
  connectedUserId: string | null;
}

// Recording data for adding new recording
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
  // Keyboard activity stats for cloud upload
  keyboardStats?: {
    estimatedKeystrokes: number;
    estimatedWordsTyped: number;
    typingBurstCount: number;
    peakWPM: number;
    averageWPM: number;
    mouseClicks: number;
    scrollEvents: number;
    typingIntensity: number;
  };
}

// Recordings API responses
export interface RecordingsListResult {
  success: boolean;
  recordings: Recording[];
  error?: string;
}

export interface RecordingResult {
  success: boolean;
  recording?: Recording | null;
  error?: string;
  needsAuth?: boolean;
}

export interface RecordingsDiskUsageResult {
  success: boolean;
  totalSize?: number;
  count?: number;
  formattedSize?: string;
  error?: string;
}

// Recording events
export interface RecordingsChangedEvent {
  recordings: Recording[];
}

export interface RecordingUploadProgressEvent {
  id: string;
  progress: number;
}

export interface RecordingUploadCompleteEvent {
  id: string;
  cloudUrl: string;
}

export interface RecordingUploadFailedEvent {
  id: string;
  error: string;
}

// Upload status events (compression + chunked upload)
export interface UploadStatusEvent {
  phase: 'compressing' | 'uploading';
  message: string;
  fileSizeMB?: string;
}

export interface UploadProgressEvent extends NormalizedProgress {}

export interface UploadCompressionProgressEvent {
  progress: number;
}

export interface pilotstackAPI {
  // Screen sources
  getSources: () => Promise<ScreenSource[]>;

  // Performance
  getPerformanceInfo: () => Promise<PerformanceInfo>;
  // Check if app is packaged (for reliable dev/prod detection)
  isPackaged: () => Promise<boolean>;

  // Recording state
  getRecordingState: () => Promise<RecordingState>;

  // Session recovery
  checkRecovery: () => Promise<RecoverableSession | null>;
  clearRecovery: () => Promise<{ success: boolean }>;
  recoverSession: (options: {
    sessionFolder: string;
  }) => Promise<SessionRecoveryResult>;

  // Capture controls
  startCapture: (options: { sourceId: string }) => Promise<CaptureStartResult>;
  stopCapture: () => Promise<CaptureStopResult>;
  emergencyStop: () => Promise<CaptureStopResult>;
  pauseCapture: () => Promise<{
    success: boolean;
    paused?: boolean;
    error?: string;
  }>;
  resumeCapture: (options: {
    sourceId: string;
  }) => Promise<{ success: boolean; resumed?: boolean; error?: string }>;

  // Video generation
  generateVideo: (
    options: VideoGenerateOptions,
  ) => Promise<VideoGenerateResult>;
  validateFrames: (options: {
    sessionFolder: string;
  }) => Promise<FrameValidationResult>;

  // Dialogs
  selectMusic: () => Promise<string | null>;
  selectOutputDir: () => Promise<string | null>;

  // File operations
  openInFolder: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;

  // Settings
  getSetting: <T>(key: string) => Promise<T>;
  setSetting: (key: string, value: unknown) => Promise<boolean>;

  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;

  // Activity monitoring
  getActivityStats: () => Promise<ActivityStats | null>;

  // Clipboard monitoring
  getClipboardEvents: () => Promise<PasteEvent[]>;

  // Keyboard activity monitoring
  getKeyboardStats: () => Promise<KeyboardStats | null>;
  getKeyboardActivityScore: () => Promise<number>;

  // Ghost mode
  enterGhostMode: () => Promise<{ success: boolean }>;
  exitGhostMode: () => Promise<{ success: boolean }>;
  getGhostStatus: () => Promise<GhostStatus>;

  // Authentication / Cloud sync (Enhanced Security)
  getDeviceInfo: () => Promise<DeviceInfo>;
  setDeviceCredentials: (
    credentials: DeviceCredentials,
  ) => Promise<{ success: boolean }>;
  getAuthToken: () => Promise<AuthToken>;
  getAuthState: () => Promise<AuthState>;
  getUserProfile: () => Promise<UserProfile | null>;
  refreshAuthToken: () => Promise<{ success: boolean }>;
  clearAuthToken: () => Promise<{ success: boolean }>;
  openConnectUrl: (options: { url: string }) => Promise<{ success: boolean }>;
  uploadRecording: (
    options: UploadRecordingOptions,
  ) => Promise<UploadRecordingResult>;

  // Recordings Library (persistent storage)
  getRecordings: () => Promise<RecordingsListResult>;
  getRecording: (id: string) => Promise<RecordingResult>;
  getLatestRecording: () => Promise<RecordingResult>;
  addRecording: (recordingData: RecordingData) => Promise<RecordingResult>;
  deleteRecording: (
    id: string,
    deleteFiles?: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  updateRecordingTitle: (id: string, title: string) => Promise<RecordingResult>;
  requestRecordingUpload: (id: string) => Promise<RecordingResult>;
  retryRecordingUpload: (id: string) => Promise<RecordingResult>;
  getRecordingsDiskUsage: () => Promise<RecordingsDiskUsageResult>;
  openRecordingsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  getRecordingsStoragePath: () => Promise<{ success: boolean; path: string }>;

  // Event listeners
  onFrameUpdate: (callback: (data: FrameUpdateData) => void) => () => void;
  onVideoProgress: (callback: (data: VideoProgressData) => void) => () => void;
  onValidationProgress: (
    callback: (data: ValidationProgressData) => void,
  ) => () => void;
  onCaptureError: (callback: (data: CaptureErrorData) => void) => () => void;
  onProcessingProgress: (
    callback: (data: ProcessingProgressData) => void,
  ) => () => void;
  onRecordingHeartbeat: (callback: (data: HeartbeatData) => void) => () => void;
  onEmergencyStopped: (
    callback: (data: EmergencyStopData) => void,
  ) => () => void;
  onRecoveryAvailable: (
    callback: (data: RecoverableSession) => void,
  ) => () => void;
  onStateSync: (callback: (data: RecordingState) => void) => () => void;
  onIdleStart: (
    callback: (data: { timestamp: number; idleSeconds: number }) => void,
  ) => () => void;
  onIdleEnd: (callback: (data: { duration: number }) => void) => () => void;
  onKeyboardActivityUpdate: (
    callback: (data: KeyboardActivityUpdate) => void,
  ) => () => void;
  onAuthTokenReceived: (
    callback: (data: AuthTokenReceived) => void,
  ) => () => void;
  onAuthStatus: (callback: (data: AuthStatus) => void) => () => void;
  onAuthProfileUpdated: (callback: (data: UserProfile) => void) => () => void;
  onAuthTokenRefreshed: (
    callback: (data: { success: boolean; expiresAt?: number }) => void,
  ) => () => void;
  onAuthSessionExpired: (callback: () => void) => () => void;

  // Recordings library events
  onRecordingsChanged: (
    callback: (data: RecordingsChangedEvent) => void,
  ) => () => void;
  onRecordingUploadProgress: (
    callback: (data: RecordingUploadProgressEvent) => void,
  ) => () => void;
  onRecordingUploadComplete: (
    callback: (data: RecordingUploadCompleteEvent) => void,
  ) => () => void;
  onRecordingUploadFailed: (
    callback: (data: RecordingUploadFailedEvent) => void,
  ) => () => void;

  // Upload status events (compression + chunked upload)
  onUploadStatus: (callback: (data: UploadStatusEvent) => void) => () => void;
  onUploadProgress: (callback: (data: UploadProgressEvent) => void) => () => void;
  onUploadCompressionProgress: (
    callback: (data: UploadCompressionProgressEvent) => void,
  ) => () => void;

  // Auto-updater
  checkForUpdates: () => Promise<UpdateCheckResult>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => Promise<{ success: boolean; error?: string }>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  onUpdateStatus: (callback: (data: UpdateStatusEvent) => void) => () => void;

  // Logging
  getRecentLogs: (lines: number) => Promise<string[]>;
  getLogFilePath: () => Promise<string>;
  getAllLogFiles: () => Promise<string[]>;
  clearLogs: () => Promise<void>;

  // Video folder access request
  onRequestFolderAccess: (callback: (data: { path: string }) => void) => () => void;
}

export interface PlatformAPI {
  os: string;
  arch: string;
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isDev: boolean;
}

declare global {
  interface Window {
    pilotstack: pilotstackAPI;
    platform: PlatformAPI;
  }
}

export {};
