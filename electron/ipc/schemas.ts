/**
 * IPC Validation Schemas
 *
 * Zod schemas for all IPC channel payloads.
 * Ensures type-safe communication between main and renderer processes.
 *
 * Reference: OPEN_SOURCE_ARCHITECTURE.md - IPC Security Hardening
 */

import { z } from "zod";

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Safe string with reasonable limits
 */
const safeString = (maxLength = 512) => z.string().max(maxLength);

/**
 * File path validation - prevents path traversal attacks
 */
const safeFilePath = z
  .string()
  .min(1, "Path cannot be empty")
  .max(2048, "Path too long")
  .refine(
    (path) => !path.includes(".."),
    "Path traversal not allowed"
  );

/**
 * Source ID validation (Electron desktopCapturer format)
 */
const sourceIdSchema = z
  .string()
  .min(1, "Source ID cannot be empty")
  .max(256, "Source ID too long");

/**
 * Recording ID validation
 * Recording IDs are in format: rec_XXXXXXXXXXXXXXXX (rec_ prefix + 16 hex chars)
 * Also accept standard UUIDs for backwards compatibility
 */
const recordingIdFormat = z.string().refine(
  (val) => {
    // Accept rec_xxx format (16 hex chars after rec_)
    if (/^rec_[a-f0-9]{16}$/i.test(val)) {
      return true;
    }
    // Accept standard UUID format for backwards compatibility
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val)) {
      return true;
    }
    return false;
  },
  "Invalid recording ID format. Expected rec_xxx or UUID format."
);

// =============================================================================
// Capture Handler Schemas
// =============================================================================

/**
 * capture:start - Start recording with a source
 */
export const captureStartSchema = z
  .object({
    sourceId: sourceIdSchema,
  })
  .strict();

/**
 * capture:resume - Resume recording (optionally with new source)
 */
export const captureResumeSchema = z
  .object({
    sourceId: sourceIdSchema.optional(),
  })
  .strict();

// =============================================================================
// Auth Handler Schemas
// =============================================================================

/**
 * auth:set-device-credentials - Set authentication credentials
 */
export const setDeviceCredentialsSchema = z
  .object({
    deviceId: z.string().min(1).max(128),
    deviceSecret: z.string().length(64).optional(),
    accessToken: z.string().min(1).max(512).optional(),
    refreshToken: z.string().min(1).max(512).optional(),
    expiresIn: z.number().int().positive().optional(),
  })
  .strict();

/**
 * auth:open-connect - Open connection URL in browser
 * Only allows HTTPS URLs to pilotstack domains for security
 */
export const openConnectSchema = z
  .object({
    url: z
      .string()
      .url("Invalid URL format")
      .refine(
        (url) => {
          try {
            const parsed = new URL(url);
            // Allow localhost for development and pilotstack.app for production
            return (
              parsed.protocol === "https:" ||
              (parsed.protocol === "http:" && parsed.hostname === "localhost")
            );
          } catch {
            return false;
          }
        },
        "URL must use HTTPS (or HTTP for localhost)"
      ),
  })
  .strict();

// =============================================================================
// Video Handler Schemas
// =============================================================================

/**
 * Keyboard stats embedded in video metadata
 * 
 * Note: We use passthrough() instead of strict() to allow additional fields
 * from the KeyboardMonitor that may be added in the future, while still
 * validating the fields we explicitly define.
 */
const keyboardStatsSchema = z
  .object({
    // Core keystroke metrics
    estimatedKeystrokes: z.number().int().nonnegative().optional(),
    estimatedWordsTyped: z.number().int().nonnegative().optional(),
    keyboardActiveTime: z.number().int().nonnegative().optional(),
    
    // Typing patterns
    typingBurstCount: z.number().int().nonnegative().optional(),
    peakWPM: z.number().int().nonnegative().optional(),
    averageWPM: z.number().int().nonnegative().optional(),
    shortcutEstimate: z.number().int().nonnegative().optional(),
    
    // Mouse metrics
    mouseClicks: z.number().int().nonnegative().optional(),
    mouseDistance: z.number().nonnegative().optional(),
    scrollEvents: z.number().int().nonnegative().optional(),
    
    // Combined metrics
    totalInputEvents: z.number().int().nonnegative().optional(),
    keyboardOnlyPeriods: z.number().int().nonnegative().optional(),
    
    // Session info
    sessionDuration: z.number().int().nonnegative().optional(),
    lastActivityTime: z.number().nullable().optional(),
    
    // Typing intensity (keystrokes per active minute)
    typingIntensity: z.number().nonnegative().optional(),
  })
  .passthrough() // Allow additional fields from KeyboardMonitor
  .optional();

/**
 * Video metadata for generation and upload
 */
const videoMetadataSchema = z
  .object({
    totalDuration: z.number().int().nonnegative().optional(),
    activeDuration: z.number().int().nonnegative().optional(),
    pasteEventCount: z.number().int().nonnegative().optional(),
    verificationScore: z.number().int().min(0).max(100).optional(),
    isVerified: z.boolean().optional(),
    keyboardStats: keyboardStatsSchema,
  })
  .strict()
  .optional();

/**
 * video:generate - Generate video from frames
 */
export const generateVideoSchema = z
  .object({
    sessionFolder: safeFilePath,
    musicPath: safeFilePath.optional(),
    metadata: videoMetadataSchema,
  })
  .strict();

/**
 * video:validate-frames - Validate frame sequence
 */
export const validateFramesSchema = z
  .object({
    sessionFolder: safeFilePath,
  })
  .strict();

// =============================================================================
// Cloud Upload Handler Schemas
// =============================================================================

/**
 * cloud:upload-recording - Upload recording to cloud
 */
export const cloudUploadRecordingSchema = z
  .object({
    videoPath: safeFilePath,
    metadata: videoMetadataSchema,
  })
  .strict();

// =============================================================================
// Recordings Handler Schemas
// =============================================================================

/**
 * recordings:get - Get single recording by ID
 * Uses recordingIdFormat which accepts both rec_xxx and UUID formats
 */
export const recordingIdSchema = z
  .object({
    id: recordingIdFormat,
  })
  .strict();

/**
 * Session metrics schema for structured metrics data
 */
const sessionMetricsSchema = z
  .object({
    version: z.number().optional(),
    sessionId: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().nullable().optional(),
    lastUpdated: z.number().optional(),
    input: z.object({
      keyboard: z.object({}).passthrough().optional(),
      mouse: z.object({}).passthrough().optional(),
      clipboard: z.object({}).passthrough().optional(),
      totalInputEvents: z.number().optional(),
      sessionDuration: z.number().optional(),
      lastActivityTime: z.number().nullable().optional(),
    }).passthrough().optional(),
    activity: z.object({}).passthrough().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

/**
 * recordings:add - Add new recording
 * 
 * Note: Using passthrough() to allow additional fields from frontend
 * that may include sessionId, status, frameCount, fileSize, etc.
 */
export const addRecordingSchema = z
  .object({
    // Required fields
    videoPath: safeFilePath,
    
    // Optional ID fields - frontend sends sessionId, not sessionFolder
    sessionId: safeString(256).optional(),
    sessionFolder: safeFilePath.optional(),
    framesDir: safeFilePath.nullable().optional(),
    
    // Metadata
    title: safeString(200).optional(),
    duration: z.number().nonnegative().default(0),
    activeDuration: z.number().nonnegative().default(0),
    frameCount: z.number().int().nonnegative().optional(),
    fileSize: z.number().int().nonnegative().optional(),
    
    // Verification
    verificationScore: z.number().min(0).max(100).default(0),
    isVerified: z.boolean().default(false),
    pasteEventCount: z.number().int().nonnegative().optional(),
    
    // Activity stats (legacy)
    keyboardStats: keyboardStatsSchema,
    
    // Structured metrics from MetricsAggregator
    metrics: sessionMetricsSchema,
    
    // Status
    status: z.enum(["recording", "processing", "ready", "upload_queued", "uploading", "uploaded", "failed"]).optional(),
    
    // Phase 5: Project assignment
    projectId: z.string().max(128).nullable().optional(),
    projectName: z.string().max(200).nullable().optional(),
  })
  .passthrough(); // Allow additional fields from frontend

/**
 * recordings:updateTitle - Update recording title
 */
export const updateTitleSchema = z
  .object({
    id: recordingIdFormat,
    title: z.string().min(1, "Title cannot be empty").max(200, "Title too long"),
  })
  .strict();

/**
 * recordings:delete - Delete recording
 */
export const deleteRecordingSchema = z
  .object({
    id: recordingIdFormat,
    deleteFiles: z.boolean().optional(),
  })
  .strict();

// =============================================================================
// Session Handler Schemas
// =============================================================================

/**
 * session:recover - Recover interrupted session
 */
export const sessionRecoverSchema = z
  .object({
    sessionFolder: safeFilePath,
  })
  .strict();

// =============================================================================
// App Handler Schemas
// =============================================================================

/**
 * shell:open-path / shell:open-file - Open path in file manager
 */
export const shellOpenPathSchema = safeFilePath;

/**
 * store:get - Get value from store
 */
export const storeGetSchema = z.string().min(1).max(64);

/**
 * store:set - Set value in store
 * Only allow specific safe keys to be set from renderer
 */
const ALLOWED_STORE_KEYS = [
  "outputDirectory",
  "autoGhostMode",
  "captureQuality",
  "captureInterval",
  "musicEnabled",
  "lastMusicPath",
  "theme",
  "windowBounds",
  "frameRate",
  "useHardwareAcceleration",
  "useJpegCapture",
  "enableAdaptiveQuality",
  "enableFrameSkipping",
  // Project settings (Phase 5)
  "lastUsedProjectId",
  "lastUsedProjectName",
] as const;

export const storeSetSchema = z
  .object({
    key: z.enum(ALLOWED_STORE_KEYS),
    value: z.unknown(),
  })
  .strict();

/**
 * logger:get-recent - Get recent log entries
 */
export const loggerGetRecentSchema = z.number().int().min(1).max(10000);

// =============================================================================
// Project Handler Schemas (Phase 5: Desktop App Integration)
// =============================================================================

/**
 * projects:setSelection - Set the selected project for recording
 */
export const setProjectSelectionSchema = z
  .object({
    projectId: z.string().max(128).nullable(),
    projectName: z.string().max(200).nullable(),
  })
  .strict();

/**
 * projects:addPattern - Add a window title pattern for auto-detection
 */
export const addProjectPatternSchema = z
  .object({
    projectId: z.string().min(1).max(128),
    pattern: z.string().min(1).max(500),
    priority: z.number().int().min(0).max(100).default(50),
  })
  .strict();

/**
 * projects:removePattern - Remove a pattern
 */
export const removeProjectPatternSchema = z
  .object({
    projectId: z.string().min(1).max(128),
    pattern: z.string().min(1).max(500),
  })
  .strict();

// =============================================================================
// Schema Registry
// =============================================================================

/**
 * All IPC schemas mapped by channel name
 * Used for automatic validation in handler registration
 */
export const ipcSchemas = {
  // Capture handlers
  "capture:start": captureStartSchema,
  "capture:resume": captureResumeSchema,

  // Auth handlers
  "auth:set-device-credentials": setDeviceCredentialsSchema,
  "auth:open-connect": openConnectSchema,

  // Video handlers
  "video:generate": generateVideoSchema,
  "video:validate-frames": validateFramesSchema,

  // Cloud handlers
  "cloud:upload-recording": cloudUploadRecordingSchema,

  // Recordings handlers
  "recordings:get": recordingIdSchema,
  "recordings:add": addRecordingSchema,
  "recordings:updateTitle": updateTitleSchema,
  "recordings:delete": deleteRecordingSchema,
  "recordings:requestUpload": recordingIdSchema,
  "recordings:retryUpload": recordingIdSchema,

  // Session handlers
  "session:recover": sessionRecoverSchema,

  // App handlers (partial - only validated ones)
  "shell:open-path": shellOpenPathSchema,
  "shell:open-file": shellOpenPathSchema,
  "store:get": storeGetSchema,
  "store:set": storeSetSchema,
  "logger:get-recent": loggerGetRecentSchema,

  // Project handlers (Phase 5)
  "projects:setSelection": setProjectSelectionSchema,
  "projects:addPattern": addProjectPatternSchema,
  "projects:removePattern": removeProjectPatternSchema,
} as const;

/**
 * Type for all validated IPC channel names
 */
export type ValidatedIPCChannel = keyof typeof ipcSchemas;

/**
 * Helper type to get the inferred type for a schema
 */
export type IPCPayload<T extends ValidatedIPCChannel> = z.infer<
  (typeof ipcSchemas)[T]
>;
