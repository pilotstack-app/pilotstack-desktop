/**
 * Preload Script
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Architecture Overview §Process Architecture
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow
 * 
 * Context bridge for secure IPC communication.
 * Maps to: preload.js
 * 
 * This script runs in a context that has access to both the DOM and Node.js APIs,
 * but is isolated from the renderer process. It exposes a secure API to the renderer
 * through the contextBridge, preventing the renderer from directly accessing Node.js APIs.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  pilotstackAPI,
  PlatformAPI,
  ScreenSource,
  PerformanceInfo,
  RecordingState,
  RecoverableSession,
  SessionRecoveryResult,
  CaptureStartResult,
  CaptureStopResult,
  VideoGenerateOptions,
  VideoGenerateResult,
  FrameValidationResult,
  ActivityStats,
  PasteEvent,
  KeyboardStats,
  KeyboardActivityUpdate,
  GhostStatus,
  DeviceInfo,
  DeviceCredentials,
  AuthToken,
  AuthState,
  UserProfile,
  UploadRecordingOptions,
  UploadRecordingResult,
  RecordingsListResult,
  RecordingResult,
  RecordingData,
  RecordingsDiskUsageResult,
  FrameUpdateData,
  VideoProgressData,
  ValidationProgressData,
  CaptureErrorData,
  ProcessingProgressData,
  HeartbeatData,
  EmergencyStopData,
  AuthTokenReceived,
  AuthStatus,
  UpdateCheckResult,
  UpdateStatus,
  UpdateStatusEvent,
  RecordingsChangedEvent,
  RecordingUploadProgressEvent,
  RecordingUploadCompleteEvent,
  RecordingUploadFailedEvent,
  UploadStatusEvent,
  UploadProgressEvent,
  UploadCompressionProgressEvent,
} from "../src/types/electron";

/**
 * Create event listener helper
 * 
 * Wraps IPC event listener registration and returns cleanup function.
 */
function createEventListener<T>(
  channel: string,
  callback: (data: T) => void
): () => void {
  const handler = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/**
 * Secure API exposed to renderer process
 * 
 * All methods match the pilotstackAPI interface defined in src/types/electron.d.ts
 */
const pilotstackAPI: pilotstackAPI = {
  // Screen sources
  getSources: (): Promise<ScreenSource[]> =>
    ipcRenderer.invoke("app:get-sources"),

  // Performance info
  getPerformanceInfo: (): Promise<PerformanceInfo> =>
    ipcRenderer.invoke("app:get-performance-info"),

  // Check if app is packaged (for reliable dev/prod detection)
  isPackaged: (): Promise<boolean> =>
    ipcRenderer.invoke("app:is-packaged"),

  // Recording state - CRITICAL for recovery
  getRecordingState: (): Promise<RecordingState> =>
    ipcRenderer.invoke("recording:get-state"),

  // Session recovery
  checkRecovery: (): Promise<RecoverableSession | null> =>
    ipcRenderer.invoke("session:check-recovery"),

  clearRecovery: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("session:clear-recovery"),

  recoverSession: (options: { sessionFolder: string }): Promise<SessionRecoveryResult> =>
    ipcRenderer.invoke("session:recover", options),

  // Capture controls
  startCapture: (options: { sourceId: string }): Promise<CaptureStartResult> =>
    ipcRenderer.invoke("capture:start", options),

  stopCapture: (): Promise<CaptureStopResult> =>
    ipcRenderer.invoke("capture:stop"),

  emergencyStop: (): Promise<CaptureStopResult> =>
    ipcRenderer.invoke("capture:emergency-stop"),

  pauseCapture: (): Promise<{ success: boolean; paused?: boolean; error?: string }> =>
    ipcRenderer.invoke("capture:pause"),

  resumeCapture: (options: { sourceId: string }): Promise<{ success: boolean; resumed?: boolean; error?: string }> =>
    ipcRenderer.invoke("capture:resume", options),

  // Video generation
  generateVideo: (options: VideoGenerateOptions): Promise<VideoGenerateResult> =>
    ipcRenderer.invoke("video:generate", options),

  validateFrames: (options: { sessionFolder: string }): Promise<FrameValidationResult> =>
    ipcRenderer.invoke("video:validate-frames", options),

  // Dialogs
  selectMusic: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:select-music"),

  selectOutputDir: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:select-output-dir"),

  // File operations
  openInFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke("shell:open-path", path),

  openFile: (path: string): Promise<void> =>
    ipcRenderer.invoke("shell:open-file", path),

  // Settings
  getSetting: <T>(key: string): Promise<T> =>
    ipcRenderer.invoke("store:get", key),

  setSetting: (key: string, value: unknown): Promise<boolean> =>
    ipcRenderer.invoke("store:set", { key, value }),

  // Window controls
  minimize: (): Promise<void> =>
    ipcRenderer.invoke("window:minimize"),

  maximize: (): Promise<void> =>
    ipcRenderer.invoke("window:maximize"),

  close: (): Promise<void> =>
    ipcRenderer.invoke("window:close"),

  // Activity monitoring
  getActivityStats: (): Promise<ActivityStats | null> =>
    ipcRenderer.invoke("activity:get-stats"),

  // Clipboard monitoring
  getClipboardEvents: (): Promise<PasteEvent[]> =>
    ipcRenderer.invoke("clipboard:get-events"),

  // Keyboard activity monitoring
  getKeyboardStats: (): Promise<KeyboardStats | null> =>
    ipcRenderer.invoke("keyboard:get-stats"),

  getKeyboardActivityScore: (): Promise<number> =>
    ipcRenderer.invoke("keyboard:get-activity-score"),

  // Keyboard activity event
  onKeyboardActivityUpdate: (callback: (data: KeyboardActivityUpdate) => void) =>
    createEventListener("keyboard:activity-update", callback),

  // Ghost mode
  enterGhostMode: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("ghost:enter"),

  exitGhostMode: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("ghost:exit"),

  getGhostStatus: (): Promise<GhostStatus> =>
    ipcRenderer.invoke("ghost:status"),

  // Authentication / Cloud sync (Enhanced Security)
  getDeviceInfo: (): Promise<DeviceInfo> =>
    ipcRenderer.invoke("auth:get-device-info"),

  setDeviceCredentials: (credentials: DeviceCredentials): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("auth:set-device-credentials", credentials),

  getAuthToken: (): Promise<AuthToken> =>
    ipcRenderer.invoke("auth:get-token"),

  getAuthState: (): Promise<AuthState> =>
    ipcRenderer.invoke("auth:get-auth-state"),

  getUserProfile: (): Promise<UserProfile | null> =>
    ipcRenderer.invoke("auth:get-user-profile"),

  refreshAuthToken: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("auth:refresh-token"),

  clearAuthToken: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("auth:clear-token"),

  openConnectUrl: (options: { url: string }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("auth:open-connect", options),

  uploadRecording: (options: UploadRecordingOptions): Promise<UploadRecordingResult> =>
    ipcRenderer.invoke("cloud:upload-recording", options),

  // Recordings Library (persistent storage)
  getRecordings: (): Promise<RecordingsListResult> =>
    ipcRenderer.invoke("recordings:list"),

  getRecording: (id: string): Promise<RecordingResult> =>
    ipcRenderer.invoke("recordings:get", { id }),

  getLatestRecording: (): Promise<RecordingResult> =>
    ipcRenderer.invoke("recordings:getLatest"),

  addRecording: (recordingData: RecordingData): Promise<RecordingResult> =>
    ipcRenderer.invoke("recordings:add", recordingData),

  deleteRecording: (id: string, deleteFiles = false): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("recordings:delete", { id, deleteFiles }),

  updateRecordingTitle: (id: string, title: string): Promise<RecordingResult> =>
    ipcRenderer.invoke("recordings:updateTitle", { id, title }),

  requestRecordingUpload: (id: string): Promise<RecordingResult> =>
    ipcRenderer.invoke("recordings:requestUpload", { id }),

  retryRecordingUpload: (id: string): Promise<RecordingResult> =>
    ipcRenderer.invoke("recordings:retryUpload", { id }),

  getRecordingsDiskUsage: (): Promise<RecordingsDiskUsageResult> =>
    ipcRenderer.invoke("recordings:getDiskUsage"),

  openRecordingsFolder: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke("recordings:openFolder"),

  getRecordingsStoragePath: (): Promise<{ success: boolean; path: string }> =>
    ipcRenderer.invoke("recordings:getStoragePath"),

  // Event listeners
  onFrameUpdate: (callback: (data: FrameUpdateData) => void) =>
    createEventListener("capture:frame-update", callback),

  onVideoProgress: (callback: (data: VideoProgressData) => void) =>
    createEventListener("video:progress", callback),

  onValidationProgress: (callback: (data: ValidationProgressData) => void) =>
    createEventListener("video:validation-progress", callback),

  onCaptureError: (callback: (data: CaptureErrorData) => void) =>
    createEventListener("capture:error", callback),

  onProcessingProgress: (callback: (data: ProcessingProgressData) => void) =>
    createEventListener("processing:progress", callback),

  onRecordingHeartbeat: (callback: (data: HeartbeatData) => void) =>
    createEventListener("recording:heartbeat", callback),

  onEmergencyStopped: (callback: (data: EmergencyStopData) => void) =>
    createEventListener("recording:emergency-stopped", callback),

  onRecoveryAvailable: (callback: (data: RecoverableSession) => void) =>
    createEventListener("session:recovery-available", callback),

  onStateSync: (callback: (data: RecordingState) => void) =>
    createEventListener("recording:state-sync", callback),

  // Activity events
  onIdleStart: (callback: (data: { timestamp: number; idleSeconds: number }) => void) =>
    createEventListener("activity:idle-start", callback),

  onIdleEnd: (callback: (data: { duration: number }) => void) =>
    createEventListener("activity:idle-end", callback),

  // Auth events
  onAuthTokenReceived: (callback: (data: AuthTokenReceived) => void) =>
    createEventListener("auth:token-received", callback),

  onAuthStatus: (callback: (data: AuthStatus) => void) =>
    createEventListener("auth:status", callback),

  onAuthProfileUpdated: (callback: (data: UserProfile) => void) =>
    createEventListener("auth:profile-updated", callback),

  onAuthTokenRefreshed: (callback: (data: { success: boolean; expiresAt?: number }) => void) =>
    createEventListener("auth:token-refreshed", callback),

  onAuthSessionExpired: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("auth:session-expired", handler);
    return () => ipcRenderer.removeListener("auth:session-expired", handler);
  },

  // Recordings library events
  onRecordingsChanged: (callback: (data: RecordingsChangedEvent) => void) =>
    createEventListener("recordings:changed", callback),

  onRecordingUploadProgress: (callback: (data: RecordingUploadProgressEvent) => void) =>
    createEventListener("recordings:upload-progress", callback),

  onRecordingUploadComplete: (callback: (data: RecordingUploadCompleteEvent) => void) =>
    createEventListener("recordings:upload-complete", callback),

  onRecordingUploadFailed: (callback: (data: RecordingUploadFailedEvent) => void) =>
    createEventListener("recordings:upload-failed", callback),

  // Upload status events (compression + chunked upload)
  onUploadStatus: (callback: (data: UploadStatusEvent) => void) =>
    createEventListener("upload:status", callback),

  onUploadProgress: (callback: (data: UploadProgressEvent) => void) =>
    createEventListener("upload:progress", callback),

  onUploadCompressionProgress: (callback: (data: UploadCompressionProgressEvent) => void) =>
    createEventListener("upload:compression-progress", callback),

  // Auto-updater
  checkForUpdates: (): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke("updater:check"),

  downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("updater:download"),

  installUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("updater:install"),

  getUpdateStatus: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke("updater:status"),

  onUpdateStatus: (callback: (data: UpdateStatusEvent) => void) =>
    createEventListener("updater:status", callback),

  // Logging
  getRecentLogs: (lines: number): Promise<string[]> =>
    ipcRenderer.invoke("logger:get-recent", lines),

  getLogFilePath: (): Promise<string> =>
    ipcRenderer.invoke("logger:get-log-file"),

  getAllLogFiles: (): Promise<string[]> =>
    ipcRenderer.invoke("logger:get-all-logs"),

  clearLogs: (): Promise<void> =>
    ipcRenderer.invoke("logger:clear-logs"),

  // Video folder access request
  onRequestFolderAccess: (callback: (data: { path: string }) => void) =>
    createEventListener("video:request-folder-access", callback),

  // Projects (Phase 5: Desktop App Integration)
  getProjects: () =>
    ipcRenderer.invoke("projects:list"),

  refreshProjects: () =>
    ipcRenderer.invoke("projects:refresh"),

  getProjectSelection: () =>
    ipcRenderer.invoke("projects:getSelection"),

  setProjectSelection: (selection: { projectId: string | null; projectName: string | null }) =>
    ipcRenderer.invoke("projects:setSelection", selection),

  autoDetectProject: (sourceTitle: string) =>
    ipcRenderer.invoke("projects:autoDetect", { sourceTitle }),

  addProjectPattern: (projectId: string, pattern: string, priority?: number) =>
    ipcRenderer.invoke("projects:addPattern", { projectId, pattern, priority: priority ?? 50 }),

  removeProjectPattern: (projectId: string, pattern: string) =>
    ipcRenderer.invoke("projects:removePattern", { projectId, pattern }),

  getProjectPatterns: () =>
    ipcRenderer.invoke("projects:getPatterns"),

  clearProjectCache: () =>
    ipcRenderer.invoke("projects:clearCache"),
};

/**
 * Platform info (read-only)
 * 
 * Use process.defaultApp for reliable dev/prod detection.
 * process.defaultApp is true when running from Electron directly (dev mode)
 * and false/undefined when packaged.
 */
const platformAPI: PlatformAPI = {
  os: process.platform,
  arch: process.arch,
  isMac: process.platform === "darwin",
  isWindows: process.platform === "win32",
  isLinux: process.platform === "linux",
  // Use process.defaultApp for reliable detection in both dev and packaged apps
  isDev: process.defaultApp === true,
};

// Expose APIs to renderer process
contextBridge.exposeInMainWorld("pilotstack", pilotstackAPI);
contextBridge.exposeInMainWorld("platform", platformAPI);

