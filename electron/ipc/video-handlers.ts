/**
 * Video IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Video Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow §Video Generation Flow
 *
 * Handles all video generation-related IPC requests.
 * Maps to: main.js video IPC handlers section
 */

import { AppContext } from "../core/app-context";
import { NormalizedProgress } from "./types";
import { logger } from "../utils/logger";
import { handleWithValidation } from "./validation";
import { generateVideoSchema, validateFramesSchema } from "./schemas";

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
 * Register video IPC handlers
 */
export function registerVideoHandlers(context: AppContext): void {
  // video:generate - Generate video from frames
  // Maps to: main.js video:generate handler
  handleWithValidation("video:generate", generateVideoSchema, async (_event, options) => {
    try {
      const videoManager = context.getVideoManager();
      const mainWindow = context.getWindowManager().getMainWindow();

      const sendProgress = (update: NormalizedProgress) => {
        if (!mainWindow) return;
        mainWindow.webContents.send("video:progress", update);
      };

      logger.info("Starting video generation", {
        sessionFolder: options.sessionFolder,
        hasMusic: !!options.musicPath,
      });

      // Convert optional metadata to RecordingMetadata format
      const generationOptions = options.metadata
        ? {
            metadata: {
              totalDuration: options.metadata.totalDuration || 0,
              activeDuration: options.metadata.activeDuration || 0,
              pasteEventCount: options.metadata.pasteEventCount || 0,
              verificationScore: options.metadata.verificationScore || 0,
              isVerified: options.metadata.isVerified || false,
              keyboardStats: options.metadata.keyboardStats
                ? {
                    estimatedKeystrokes: options.metadata.keyboardStats.estimatedKeystrokes,
                    peakWPM: options.metadata.keyboardStats.peakWPM,
                  }
                : undefined,
            },
          }
        : {};

      // Initial progress signal
      sendProgress({
        phase: "processing",
        percent: 1,
        etaSeconds: null,
        message: "Starting video generation...",
      });

      const result = await videoManager.generate(options.sessionFolder, options.musicPath, {
        ...generationOptions,
        onProgress: (data) => {
          const percent = Math.min(99, data.progress !== undefined ? data.progress : 0);
          sendProgress({
            phase: "processing",
            percent,
            etaSeconds: undefined,
            message: data.time ? `Processing (${data.time})` : data.message ?? "Processing...",
          });
        },
      });

      logger.info("Video generation completed successfully", {
        outputFile: result.outputFile,
      });

      // Completion signal
      sendProgress({
        phase: "processing",
        percent: 100,
        etaSeconds: 0,
        message: "Video generation complete",
      });

      return result;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error("Video generation failed", {
        error: errorMessage,
        stack: errorStack,
        sessionFolder: options.sessionFolder,
      });
      return {
        success: false,
        error: errorMessage || "Failed to generate video",
      };
    }
  });

  // video:validate-frames - Validate frame sequence (simplified - just count frames)
  // Maps to: main.js video:validate-frames handler
  handleWithValidation("video:validate-frames", validateFramesSchema, async (_event, options) => {
    try {
      const videoManager = context.getVideoManager();
      // Simple frame counting - no complex validation needed
       
      const countFrames = (videoManager as any).countFrames;
      if (typeof countFrames === "function") {
        // Bind to videoManager to ensure 'this' context is preserved if needed
        const frameCount = await countFrames.call(videoManager, options.sessionFolder);
        
        // If count is 0, we should probably treat it as a potential error or at least warn
        if (frameCount === 0) {
          logger.warn("video:validate-frames found 0 frames", { sessionFolder: options.sessionFolder });
        }
        
        return {
          success: true,
          validFrames: frameCount,
        };
      }
      return {
        success: false,
        error: "Frame counting not available",
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("video:validate-frames error", { error: errorMessage });
      return {
        success: false,
        error: errorMessage || "Failed to validate frames",
      };
    }
  });
}
