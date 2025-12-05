/**
 * Capture IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Capture Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow §Recording Flow
 *
 * Handles all capture-related IPC requests.
 * Maps to: main.js capture IPC handlers section
 */

import { desktopCapturer } from "electron";
import { AppContext } from "../core/app-context";
import { sanitizeForIPC } from "../utils/ipc-sanitizer";
import { logger } from "../utils/logger";
import { handleWithValidation, handleNoArgs } from "./validation";
import { captureStartSchema, captureResumeSchema } from "./schemas";

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
 * Register capture IPC handlers
 */
export function registerCaptureHandlers(context: AppContext): void {
  // app:get-sources - Get available screen/window sources
  // Maps to: main.js app:get-sources handler
  handleNoArgs("app:get-sources", async () => {
    try {
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
  // Maps to: main.js capture:start handler
  handleWithValidation("capture:start", captureStartSchema, async (_event, options) => {
    try {
      const captureManager = context.getCaptureManager();
      const activityManager = context.getActivityManager();
      const clipboardMonitor = context.getClipboardMonitor();
      const keyboardMonitor = context.getKeyboardMonitor();
      const trayManager = context.getTrayManager();

      // Set activity monitors on capture manager
      captureManager.setActivityMonitors({
        activityManager,
        keyboardMonitor,
        clipboardMonitor,
      });

      // Start activity manager
      try {
        activityManager.start();
      } catch (error: unknown) {
        logger.error("Activity start error", { error: getErrorMessage(error) });
      }

      // Start clipboard monitor
      try {
        clipboardMonitor.start();
      } catch (error: unknown) {
        logger.error("Clipboard start error", { error: getErrorMessage(error) });
      }

      // Start keyboard monitor
      try {
        keyboardMonitor.start();
      } catch (error: unknown) {
        logger.error("Keyboard monitor start error", { error: getErrorMessage(error) });
      }

      const result = await captureManager.start(options.sourceId);
      trayManager.updateTray();
      return result;
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
  // Maps to: main.js capture:stop handler
  handleNoArgs("capture:stop", async () => {
    const activityManager = context.getActivityManager();
    const clipboardMonitor = context.getClipboardMonitor();
    const keyboardMonitor = context.getKeyboardMonitor();
    const captureManager = context.getCaptureManager();
    const trayManager = context.getTrayManager();

    // Stop activity manager and get stats
    let activityStats: unknown = null;
    try {
      activityStats = activityManager.stop();
      activityStats = sanitizeForIPC(activityStats);
    } catch (error: unknown) {
      logger.debug("Failed to stop activity manager", { error: getErrorMessage(error) });
    }

    // Stop clipboard monitor and get paste events
    let pasteEvents: unknown[] = [];
    try {
      pasteEvents = clipboardMonitor.stop();
      pasteEvents = sanitizeForIPC(pasteEvents) as unknown[];
    } catch (error: unknown) {
      logger.debug("Failed to stop clipboard monitor", { error: getErrorMessage(error) });
    }

    // Stop keyboard monitor and get stats
    let keyboardStats: unknown = null;
    try {
      keyboardStats = keyboardMonitor.stop();
      keyboardStats = sanitizeForIPC(keyboardStats);
    } catch (error: unknown) {
      logger.debug("Failed to stop keyboard monitor", { error: getErrorMessage(error) });
    }

    try {
      // Add timeout to prevent hanging
      const stopPromise = captureManager.stop();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Stop timeout")), 10000)
      );

      const result = await Promise.race([stopPromise, timeoutPromise]);
      trayManager.updateTray();

      // Sanitize the result object for IPC serialization
      const sanitizedResult = sanitizeForIPC(result);

      // Include activity, paste, and keyboard data in result
      const response = {
        ...sanitizedResult,
        activityStats,
        pasteEvents,
        keyboardStats,
      };

      // Final safety check: ensure the entire response is serializable
      return sanitizeForIPC(response);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:stop error", { error: errorMessage });
      trayManager.updateTray();

      // Force cleanup on timeout
      if (errorMessage === "Stop timeout") {
        logger.warn("Stop timed out, forcing cleanup");
        try {
          // Access private properties for emergency cleanup
           
          const manager = captureManager as any;
          if (manager.isRecordingActive !== undefined) {
            manager.isRecordingActive = false;
          }
          if (manager.captureLoop) {
            manager.captureLoop.stop();
          }
          // Worker removed in simplified version
          if (typeof manager.clearSessionState === "function") {
            manager.clearSessionState();
          }
        } catch (cleanupError: unknown) {
          logger.error("Cleanup error", { error: getErrorMessage(cleanupError) });
        }
      }

      // Return data we have even on error
      const state = captureManager.getState();
      const sessionFolder = state.sessionFolder || null;
      const totalFrames = state.frameCount || 0;

      return sanitizeForIPC({
        success: true, // Still return success so UI continues
        error: errorMessage || "Error during stop",
        sessionFolder,
        totalFrames,
        activityStats,
        pasteEvents,
        keyboardStats,
      });
    }
  });

  // capture:pause - Pause recording
  // Maps to: main.js capture:pause handler
  handleNoArgs("capture:pause", () => {
    try {
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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:pause error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // capture:resume - Resume recording
  // Maps to: main.js capture:resume handler
  handleWithValidation("capture:resume", captureResumeSchema, async (_event, options) => {
    try {
      const activityManager = context.getActivityManager();
      const captureManager = context.getCaptureManager();

      if (activityManager) {
        activityManager.resume();
      }

      const state = captureManager.getState();
      if (!state.isRecording) {
        return { success: false, error: "Recording not active" };
      }

      return await captureManager.resume(options?.sourceId || state.sourceId || "");
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("capture:resume error", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // capture:emergency-stop - Emergency stop
  // Maps to: main.js capture:emergency-stop handler
  handleNoArgs("capture:emergency-stop", async () => {
    const trayManager = context.getTrayManager();
    try {
      const activityManager = context.getActivityManager();
      const clipboardMonitor = context.getClipboardMonitor();
      const captureManager = context.getCaptureManager();

      if (activityManager) {
        try {
          activityManager.stop();
        } catch (error: unknown) {
          logger.error("Activity stop error", { error: getErrorMessage(error) });
        }
      }

      if (clipboardMonitor) {
        try {
          clipboardMonitor.stop();
        } catch (error: unknown) {
          logger.error("Clipboard stop error", { error: getErrorMessage(error) });
        }
      }

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
  // Maps to: main.js recording:get-state handler
  handleNoArgs("recording:get-state", () => {
    try {
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
