/**
 * Recordings IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Recordings Library Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 *
 * Handles all recordings library-related IPC requests.
 * Maps to: main.js recordings IPC handlers section
 */

import { shell, app, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { SessionMetrics } from "../config/types";
import { AppContext } from "../core/app-context";
import { secureAuthManager, store } from "../config/store";
import { logger } from "../utils/logger";
import { handleWithValidation, handleNoArgs } from "./validation";
import {
  recordingIdSchema,
  addRecordingSchema,
  updateTitleSchema,
  deleteRecordingSchema,
} from "./schemas";

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
 * Load metrics.json from session folder if it exists
 * This must be done when adding the recording because the session folder
 * may be deleted after video generation (to clean up frame files)
 */
function loadMetricsFromSessionFolder(framesDir: string | null | undefined): SessionMetrics | null {
  if (!framesDir) return null;
  
  const metricsPath = path.join(framesDir, "metrics.json");
  
  try {
    if (fs.existsSync(metricsPath)) {
      const data = fs.readFileSync(metricsPath, "utf-8");
      const metrics = JSON.parse(data) as SessionMetrics;
      logger.info("Loaded metrics from session folder", { 
        framesDir,
        hasInput: !!metrics.input,
        hasActivity: !!metrics.activity,
      });
      return metrics;
    }
  } catch (error) {
    logger.warn("Failed to load metrics from session folder", { 
      framesDir, 
      error: getErrorMessage(error) 
    });
  }
  
  return null;
}

/**
 * Register recordings IPC handlers
 */
export function registerRecordingsHandlers(context: AppContext): void {
  // recordings:list - List all recordings
  // Maps to: main.js recordings:list handler
  handleNoArgs("recordings:list", () => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized", recordings: [] };
    }
    return { success: true, recordings: recordingsManager.getAll() };
  });

  // recordings:get - Get single recording
  // Maps to: main.js recordings:get handler
  handleWithValidation("recordings:get", recordingIdSchema, (_event, { id }) => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }
    const recording = recordingsManager.get(id);
    if (!recording) {
      return { success: false, error: "Recording not found" };
    }
    return { success: true, recording };
  });

  // recordings:getLatest - Get latest recording
  // Maps to: main.js recordings:getLatest handler
  handleNoArgs("recordings:getLatest", () => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }
    const recording = recordingsManager.getLatest();
    return { success: true, recording };
  });

  // recordings:add - Add new recording
  // Maps to: main.js recordings:add handler
  handleWithValidation("recordings:add", addRecordingSchema, (_event, recordingData) => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }
    try {
      // IMPORTANT: Load metrics from session folder NOW before it gets deleted
      // The session folder (framesDir) contains metrics.json with all activity stats
      // (WPM, keystrokes, mouse clicks, etc.) but may be cleaned up after video generation
      let metrics = recordingData.metrics as SessionMetrics | null | undefined;
      if (!metrics && recordingData.framesDir) {
        metrics = loadMetricsFromSessionFolder(recordingData.framesDir);
      }

      // Convert the validated schema data to RecordingData type
      // The schema is more permissive with passthrough(), so we need to cast
      const data = {
        sessionId: recordingData.sessionId,
        videoPath: recordingData.videoPath,
        framesDir: recordingData.framesDir,
        title: recordingData.title,
        duration: recordingData.duration,
        activeDuration: recordingData.activeDuration,
        frameCount: recordingData.frameCount,
        verificationScore: recordingData.verificationScore,
        isVerified: recordingData.isVerified,
        pasteEventCount: recordingData.pasteEventCount,
        fileSize: recordingData.fileSize,
        status: recordingData.status,
        metrics: metrics || null,
        // Phase 5: Project assignment
        projectId: (recordingData as any).projectId || null,
        projectName: (recordingData as any).projectName || null,
      };
      const recording = recordingsManager.add(data);
      return { success: true, recording };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("Failed to add recording", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // recordings:delete - Delete recording
  // Maps to: main.js recordings:delete handler
  handleWithValidation("recordings:delete", deleteRecordingSchema, (_event, { id, deleteFiles }) => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }
    return recordingsManager.delete(id, deleteFiles ?? false);
  });

  // recordings:updateTitle - Update recording title
  // Maps to: main.js recordings:updateTitle handler
  handleWithValidation("recordings:updateTitle", updateTitleSchema, (_event, { id, title }) => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }
    const recording = recordingsManager.updateTitle(id, title);
    if (!recording) {
      return { success: false, error: "Recording not found" };
    }
    return { success: true, recording };
  });

  // recordings:requestUpload - Request upload
  // Maps to: main.js recordings:requestUpload handler
  handleWithValidation("recordings:requestUpload", recordingIdSchema, async (_event, { id }) => {
    const recordingsManager = context.getRecordingsManager();
    const uploadService = context.getUploadService();
    const windowManager = context.getWindowManager();

    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }

    const isConnected = secureAuthManager.isAuthenticated();
    const result = recordingsManager.requestUpload(id, isConnected);

    if (!result.success || !result.recording) {
      return result;
    }

    // If connected, start the upload immediately
    if (isConnected && result.recording.status === "uploading") {
      const mainWindow = windowManager.getMainWindow();
      try {
        const uploadResult = await uploadService.uploadRecording(
          id,
          (progress) => recordingsManager.updateUploadProgress(id, progress),
          mainWindow
        );

        if (uploadResult.success) {
          const recording = recordingsManager.get(id);
          if (!recording) {
            return { success: false, error: "Recording not found after upload" };
          }
          return { success: true, recording };
        } else {
          return { success: false, error: uploadResult.error };
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        logger.error("Upload failed", { id, error: errorMessage });
        return { success: false, error: errorMessage };
      }
    }

    // If not connected, recording is now in upload_queued status
    return { success: true, recording: result.recording, needsAuth: !isConnected };
  });

  // recordings:retryUpload - Retry failed upload
  // Maps to: main.js recordings:retryUpload handler
  handleWithValidation("recordings:retryUpload", recordingIdSchema, async (_event, { id }) => {
    const recordingsManager = context.getRecordingsManager();
    const uploadService = context.getUploadService();
    const windowManager = context.getWindowManager();

    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }

    const result = recordingsManager.retryUpload(id);
    if (!result.success) {
      return result;
    }

    // Start the upload
    const mainWindow = windowManager.getMainWindow();
    try {
      const uploadResult = await uploadService.uploadRecording(
        id,
        (progress) => recordingsManager.updateUploadProgress(id, progress),
        mainWindow
      );

      if (uploadResult.success) {
        const recording = recordingsManager.get(id);
        if (!recording) {
          return { success: false, error: "Recording not found after upload" };
        }
        return { success: true, recording };
      } else {
        return { success: false, error: uploadResult.error };
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("Retry upload failed", { id, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // recordings:getDiskUsage - Get disk usage statistics
  // Maps to: main.js recordings:getDiskUsage handler
  handleNoArgs("recordings:getDiskUsage", () => {
    const recordingsManager = context.getRecordingsManager();
    if (!recordingsManager) {
      return { success: false, error: "Recordings manager not initialized" };
    }
    return { success: true, ...recordingsManager.getDiskUsage() };
  });

  // recordings:openFolder - Open recordings folder
  // Maps to: main.js recordings:openFolder handler
  handleNoArgs("recordings:openFolder", async () => {
    const outputDir = (store.get("outputDirectory") as string) || app.getPath("videos");

    if (fs.existsSync(outputDir)) {
      shell.openPath(outputDir);
      return { success: true, path: outputDir };
    } else {
      // Try to create the directory if it doesn't exist
      try {
        fs.mkdirSync(outputDir, { recursive: true });
        shell.openPath(outputDir);
        return { success: true, path: outputDir };
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        logger.error("Failed to open recordings folder", {
          error: errorMessage,
          path: outputDir,
        });
        return { success: false, error: "Failed to open recordings folder" };
      }
    }
  });

  // recordings:getStoragePath - Get storage path
  // Maps to: main.js recordings:getStoragePath handler
  handleNoArgs("recordings:getStoragePath", () => {
    const outputDir = (store.get("outputDirectory") as string) || app.getPath("videos");
    return { success: true, path: outputDir };
  });

  // dialog:select-music - Select music file
  // Maps to: main.js dialog:select-music handler
  handleNoArgs("dialog:select-music", async () => {
    const windowManager = context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    if (!mainWindow) {
      return null;
    }
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "aac", "m4a"] }],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  // dialog:select-output-dir - Select output directory
  // Maps to: main.js dialog:select-output-dir handler
  handleNoArgs("dialog:select-output-dir", async () => {
    try {
      logger.info("Requesting output directory selection");
      const windowManager = context.getWindowManager();
      const mainWindow = windowManager.getMainWindow();
      if (!mainWindow) {
        return null;
      }
      const res = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory", "createDirectory"],
        title: "Select Output Folder for Videos",
        message:
          "Choose a folder where pilotstack will save your video recordings. You can create a new folder if needed.",
      });
      if (!res.canceled && res.filePaths.length > 0) {
        const selectedPath = res.filePaths[0];
        // Test write permissions
        try {
          const testFile = path.join(selectedPath, `.pilotstack_test_${Date.now()}.tmp`);
          await fs.promises.writeFile(testFile, "test");
          await fs.promises.unlink(testFile);
          store.set("outputDirectory", selectedPath);
          logger.info("Output directory selected and verified", {
            path: selectedPath,
          });
          return selectedPath;
        } catch (testError: unknown) {
          const testErrorMessage = getErrorMessage(testError);
          logger.error("Cannot write to selected directory", {
            path: selectedPath,
            error: testErrorMessage,
          });
          // Show error dialog
          await dialog.showMessageBox(mainWindow || undefined, {
            type: "error",
            title: "Permission Denied",
            message: "Cannot write to selected folder",
            detail: `pilotstack cannot write to "${selectedPath}". Please select a different folder or grant the app permission in System Settings > Privacy & Security > Files and Folders.`,
          });
          return null;
        }
      }
      return null;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("Error selecting output directory", { error: errorMessage });
      return null;
    }
  });
}
