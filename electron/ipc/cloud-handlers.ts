/**
 * Cloud Upload IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Cloud Upload Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow §Cloud Upload Flow
 *
 * Handles all cloud upload-related IPC requests.
 * Maps to: main.js cloud upload IPC handlers section
 */

import * as fs from "fs";
import * as path from "path";
import { AppContext } from "../core/app-context";
import { logger } from "../utils/logger";
import { NormalizedProgress } from "./types";
import { handleWithValidation } from "./validation";
import { cloudUploadRecordingSchema } from "./schemas";

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
 * Register cloud upload IPC handlers
 */
export function registerCloudHandlers(context: AppContext): void {
  // cloud:upload-recording - Upload recording to cloud
  // Maps to: main.js cloud:upload-recording handler
  handleWithValidation(
    "cloud:upload-recording",
    cloudUploadRecordingSchema,
    async (_event, { videoPath, metadata }) => {
      const uploadService = context.getUploadService();
      const windowManager = context.getWindowManager();
      const mainWindow = windowManager.getMainWindow();

      // Get valid token
      const authService = context.getAuthService();
      const token = await authService.getToken();

      logger.info("Cloud upload started (IPC handler)", {
        videoPath,
        hasToken: !!token,
        metadata: metadata
          ? {
              totalDuration: metadata.totalDuration,
              activeDuration: metadata.activeDuration,
              pasteEventCount: metadata.pasteEventCount,
              verificationScore: metadata.verificationScore,
              isVerified: metadata.isVerified,
            }
          : null,
      });

      if (!token) {
        logger.warn("Cloud upload failed: No authentication token");
        return { success: false, error: "Not connected to cloud account" };
      }

      try {
        // Check if file exists
        if (!fs.existsSync(videoPath)) {
          logger.error("Cloud upload failed: Video file not found", { videoPath });
          return {
            success: false,
            error: "Video file not found",
          };
        }

        const videoStats = await fs.promises.stat(videoPath);
        const fileSizeMB = (videoStats.size / (1024 * 1024)).toFixed(2);

        logger.info("Video file info", {
          filename: path.basename(videoPath),
          fileSize: videoStats.size,
          fileSizeMB: `${fileSizeMB} MB`,
          filePath: videoPath,
        });

        // Use upload service to upload the video
        // Note: The upload service expects a recording object, so we create a temporary one
        const tempRecording = {
          id: `temp_${Date.now()}`,
          videoPath,
          duration: metadata?.totalDuration || 0,
          activeDuration: metadata?.activeDuration || 0,
          pasteEventCount: metadata?.pasteEventCount || 0,
          verificationScore: metadata?.verificationScore || 0,
          isVerified: metadata?.isVerified || false,
          keyboardStats: metadata?.keyboardStats || null,
        };

        // Send progress updates to renderer
        const sendProgress = (update: NormalizedProgress) => {
          mainWindow?.webContents.send("upload:progress", update);
        };

        const uploadResult = await uploadService.uploadRecording(
          tempRecording.id,
          (progress) => {
            sendProgress({
              phase: "upload",
              percent: Math.min(100, Math.max(0, progress)),
              etaSeconds: null,
              message: "Uploading recording",
            });
          },
          mainWindow
        );

        if (!uploadResult.success) {
          logger.error("Upload failed", {
            error: uploadResult.error,
          });
          return {
            success: false,
            error: uploadResult.error,
            localOnly: uploadResult.localOnly,
          };
        }

        logger.info("Cloud upload completed successfully (IPC handler)", {
          recordingId: uploadResult.recordingId,
          videoUrl: uploadResult.videoUrl,
        });

        // Ensure final 100% progress
        sendProgress({
          phase: "upload",
          percent: 100,
          etaSeconds: 0,
          message: "Upload complete",
        });

        return {
          success: true,
          recordingId: uploadResult.recordingId,
          videoUrl: uploadResult.videoUrl,
        };
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error("Cloud upload failed with exception", {
          error: errorMessage,
          stack: errorStack,
          videoPath,
          fileExists: fs.existsSync(videoPath),
        });
        return {
          success: false,
          error: errorMessage || "Upload failed",
        };
      }
    }
  );
}
