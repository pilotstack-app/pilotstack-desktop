/**
 * Capture IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Capture Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow §Recording Flow
 *
 * Handles all capture-related IPC requests.
 * Uses the new native FFmpeg CaptureService for better performance.
 */

import { desktopCapturer } from "electron";
import { AppContext } from "../core/app-context";
import { sanitizeForIPC } from "../utils/ipc-sanitizer";
import { logger } from "../utils/logger";
import { handleWithValidation, handleNoArgs } from "./validation";
import { captureStartSchema, captureResumeSchema } from "./schemas";
import { isNativeCaptureSupported } from "../managers/capture-engine/platform-utils";

/**
 * Safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}

/**
 * Check if we should use the new native capture service
 * Native capture is preferred on all platforms for better stability
 */
function useNativeCapture(): boolean {
  return isNativeCaptureSupported();
}

/**
 * Register capture IPC handlers
 */
export function registerCaptureHandlers(context: AppContext): void {
  // app:get-sources - Get available screen/window sources
  // For native capture, we only support full screen capture
  handleNoArgs("app:get-sources", async () => {
    try {
      // Native capture only supports full screen, but we still list sources
      // for UI compatibility
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
      });
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      }));
    } catch (error: unknown) {
      logger.error("Failed to get sources", { error: getErrorMessage(error) });
      return [];
    }
  });

  // capture:start - Start recording
  // Uses new CaptureService with native FFmpeg capture
  handleWithValidation("capture:start", captureStartSchema, async (_event, _options) => {
    try {
      const trayManager = context.getTrayManager();

      if (useNativeCapture()) {
        // Use new native capture service
        const captureService = context.getCaptureService();
        
        logger.info("Starting native capture service");
        const result = await captureService.start({
          displayIndex: 0, // Primary display
          frameRate: 1, // 1 fps for timelapse
          segmentDuration: 6,
        });

        trayManager.updateTray();

        if (result.success) {
          return {
            success: true,
            sessionFolder: result.sessionFolder,
            sessionId: result.sessionId,
            format: "hls", // HLS format for native capture
          };
        } else {
          return {
            success: false,
            error: result.error || "Failed to start native capture",
          };
        }
      } else {
        // Fallback to old capture manager (deprecated path)
        const captureManager = context.getCaptureManager();
        const activityManager = context.getActivityManager();
        const clipboardMonitor = context.getClipboardMonitor();
        const keyboardMonitor = context.getKeyboardMonitor();

        captureManager.setActivityMonitors({
          activityManager,
          keyboardMonitor,
          clipboardMonitor,
        });

        try { activityManager.start(); } catch (e) { logger.error("Activity start error", { error: getErrorMessage(e) }); }
        try { clipboardMonitor.start(); } catch (e) { logger.error("Clipboard start error", { error: getErrorMessage(e) }); }
        try { keyboardMonitor.start(); } catch (e) { logger.error("Keyboard start error", { error: getErrorMessage(e) }); }

        const result = await captureManager.start(_options.sourceId);
        trayManager.updateTray();
        return result;
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:start error", { error: errorMessage });
      return {
        success: false,
        error: errorMessage || "Failed to start recording",
      };
    }
  });

  // capture:stop - Stop recording
  // Handles both native and legacy capture
  handleNoArgs("capture:stop", async () => {
    const trayManager = context.getTrayManager();

    try {
      if (useNativeCapture()) {
        // Use new native capture service
        const captureService = context.getCaptureService();
        
        if (!captureService.isRecording()) {
          return sanitizeForIPC({
            success: false,
            error: "Recording not active",
            sessionFolder: null,
            totalFrames: 0,
          });
        }

        logger.info("Stopping native capture service");
        const result = await captureService.stop();

        trayManager.updateTray();

        // Get final metrics from the service
        const metrics = captureService.getCurrentMetrics();

        return sanitizeForIPC({
          success: result.success,
          error: result.error,
          sessionFolder: result.sessionFolder,
          sessionId: result.sessionId,
          totalFrames: result.segmentCount, // Segments instead of frames
          duration: result.duration,
          metricsPath: result.metricsPath,
          // Include activity data from metrics
          activityStats: metrics?.activity || null,
          keyboardStats: metrics?.input?.keyboard || null,
          pasteEvents: metrics?.input?.clipboard?.pasteTimestamps?.map(ts => ({ timestamp: ts })) || [],
          format: "hls",
        });
      } else {
        // Legacy capture manager path
        const activityManager = context.getActivityManager();
        const clipboardMonitor = context.getClipboardMonitor();
        const keyboardMonitor = context.getKeyboardMonitor();
        const captureManager = context.getCaptureManager();

        let activityStats: unknown = null;
        let pasteEvents: unknown[] = [];
        let keyboardStats: unknown = null;

        try { activityStats = sanitizeForIPC(activityManager.stop()); } catch (e) { logger.debug("Activity stop error", { error: getErrorMessage(e) }); }
        try { pasteEvents = sanitizeForIPC(clipboardMonitor.stop()) as unknown[]; } catch (e) { logger.debug("Clipboard stop error", { error: getErrorMessage(e) }); }
        try { keyboardStats = sanitizeForIPC(keyboardMonitor.stop()); } catch (e) { logger.debug("Keyboard stop error", { error: getErrorMessage(e) }); }

        const stopPromise = captureManager.stop();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Stop timeout")), 10000)
        );

        const result = await Promise.race([stopPromise, timeoutPromise]);
        trayManager.updateTray();

        return sanitizeForIPC({
          ...(result as object),
          activityStats,
          pasteEvents,
          keyboardStats,
        });
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:stop error", { error: errorMessage });
      trayManager.updateTray();

      return sanitizeForIPC({
        success: true, // Still return success so UI continues
        error: errorMessage || "Error during stop",
        sessionFolder: null,
        totalFrames: 0,
      });
    }
  });

  // capture:pause - Pause recording
  handleNoArgs("capture:pause", () => {
    try {
      if (useNativeCapture()) {
        const captureService = context.getCaptureService();
        if (!captureService.isRecording()) {
          return { success: false, error: "Recording not active" };
        }
        return captureService.pause();
      } else {
        const activityManager = context.getActivityManager();
        const captureManager = context.getCaptureManager();

        if (activityManager) {
          activityManager.pause();
        }

        const state = captureManager.getState();
        if (!state.isRecording) {
          return { success: false, error: "Recording not active" };
        }

        return captureManager.pause();
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:pause error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // capture:resume - Resume recording
  handleWithValidation("capture:resume", captureResumeSchema, async (_event, _options) => {
    try {
      if (useNativeCapture()) {
        const captureService = context.getCaptureService();
        if (!captureService.isRecording()) {
          return { success: false, error: "Recording not active" };
        }
        return captureService.resume();
      } else {
        const activityManager = context.getActivityManager();
        const captureManager = context.getCaptureManager();

        if (activityManager) {
          activityManager.resume();
        }

        const state = captureManager.getState();
        if (!state.isRecording) {
          return { success: false, error: "Recording not active" };
        }

        return await captureManager.resume(_options?.sourceId || state.sourceId || "");
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:resume error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // capture:emergency-stop - Emergency stop
  handleNoArgs("capture:emergency-stop", async () => {
    const trayManager = context.getTrayManager();
    try {
      if (useNativeCapture()) {
        const captureService = context.getCaptureService();
        await captureService.emergencyStop();
        trayManager.updateTray();
        return sanitizeForIPC({
          success: true,
          sessionFolder: null,
          totalFrames: 0,
        });
      } else {
        const activityManager = context.getActivityManager();
        const clipboardMonitor = context.getClipboardMonitor();
        const captureManager = context.getCaptureManager();

        try { activityManager.stop(); } catch (e) { logger.error("Activity stop error", { error: getErrorMessage(e) }); }
        try { clipboardMonitor.stop(); } catch (e) { logger.error("Clipboard stop error", { error: getErrorMessage(e) }); }

        const state = captureManager.getState();
        if (!state.isRecording) {
          return sanitizeForIPC({
            success: false,
            error: "Recording not active",
            sessionFolder: null,
            totalFrames: 0,
          });
        }

        const result = await captureManager.stop();
        trayManager.updateTray();
        return sanitizeForIPC(result);
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:emergency-stop error", { error: errorMessage });
      trayManager.updateTray();
      return sanitizeForIPC({
        success: false,
        error: errorMessage,
        sessionFolder: null,
        totalFrames: 0,
      });
    }
  });

  // recording:get-state - Get current recording state
  handleNoArgs("recording:get-state", () => {
    try {
      if (useNativeCapture()) {
        const captureService = context.getCaptureService();
        const state = captureService.getState();
        const metrics = captureService.getCurrentMetrics();

        return sanitizeForIPC({
          isRecording: state.isRecording,
          isPaused: state.isPaused,
          sessionFolder: state.sessionFolder,
          sessionId: state.sessionId,
          duration: state.duration,
          segmentCount: state.segmentCount,
          frameCount: state.segmentCount, // For compatibility
          sourceId: null, // Native capture doesn't use sourceId
          droppedFrames: 0,
          skippedSimilarFrames: 0,
          queueSize: 0,
          bufferSize: 0,
          maxQueueSize: 100,
          adaptiveQuality: "native",
          effectiveInterval: 1000,
          format: "hls",
          error: state.error,
          activityStats: metrics?.activity || null,
          pasteEvents: metrics?.input?.clipboard?.pasteTimestamps?.map(ts => ({ timestamp: ts })) || [],
          keyboardStats: metrics?.input?.keyboard || null,
        });
      } else {
        const captureManager = context.getCaptureManager();
        const activityManager = context.getActivityManager();
        const clipboardMonitor = context.getClipboardMonitor();
        const keyboardMonitor = context.getKeyboardMonitor();

        const state = captureManager.getState();
        if (!state.isRecording) {
          return sanitizeForIPC({
            isRecording: false,
            sessionFolder: null,
            frameCount: 0,
            sourceId: null,
            droppedFrames: 0,
            skippedSimilarFrames: 0,
            queueSize: 0,
            bufferSize: 0,
            maxQueueSize: 100,
            adaptiveQuality: "high",
            effectiveInterval: 1000,
            format: "png",
            activityStats: activityManager?.getStats() || null,
            pasteEvents: clipboardMonitor?.getPasteEvents() || [],
          });
        }

        return sanitizeForIPC({
          ...state,
          activityStats: activityManager?.getStats() || null,
          pasteEvents: clipboardMonitor?.getPasteEvents() || [],
          keyboardStats: keyboardMonitor?.getStats() || null,
        });
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("recording:get-state error", { error: errorMessage });
      return sanitizeForIPC({
        isRecording: false,
        error: errorMessage,
      });
    }
  });

  // ghost:enter - Enter ghost mode
  // Maps to: main.js ghost:enter handler
  handleNoArgs("ghost:enter", () => {
    const windowManager = context.getWindowManager();
    windowManager.enterGhostMode();
    return { success: true };
  });

  // ghost:exit - Exit ghost mode
  // Maps to: main.js ghost:exit handler
  handleNoArgs("ghost:exit", () => {
    const windowManager = context.getWindowManager();
    windowManager.exitGhostMode();
    return { success: true };
  });

  // ghost:status - Get ghost mode status
  // Maps to: main.js ghost:status handler
  handleNoArgs("ghost:status", () => {
    const windowManager = context.getWindowManager();
    return { isGhostMode: windowManager.isInGhostMode() };
  });
}
