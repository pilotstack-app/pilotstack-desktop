/**
 * Video Generation Helpers
 * 
 * Helper functions for video generation operations.
 * Extracted from video-manager.ts to keep file sizes under 300 lines.
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { app, dialog, BrowserWindow } from "electron";
import { logger } from "../../utils/logger";
import { VideoError } from "../../core/app-error";
import { store } from "../../config/store";

/**
 * Ensure output directory exists and is writable
 */
export async function ensureOutputDirectory(
  outputDir: string,
  mainWindow: BrowserWindow | null
): Promise<string> {
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const testFile = path.join(outputDir, `.pilotstack_test_${Date.now()}.tmp`);
    try {
      await fs.promises.writeFile(testFile, "test");
      await fs.promises.unlink(testFile);
      logger.info("Output directory write test passed", { outputDir });
      return outputDir;
    } catch (testError: any) {
      logger.warn("Cannot write to output directory, using fallback", {
        outputDir,
        error: testError.message,
      });
      const fallbackDir = app.getPath("videos");
      await fs.promises.mkdir(fallbackDir, { recursive: true });
      store.delete("outputDirectory");
      return fallbackDir;
    }
  } catch (mkdirError: any) {
    logger.error("Cannot create output directory", {
      outputDir,
      error: mkdirError.message,
    });

    // Try fallback
    if (outputDir !== app.getPath("videos")) {
      const fallbackDir = app.getPath("videos");
      try {
        await fs.promises.mkdir(fallbackDir, { recursive: true });
        store.delete("outputDirectory");
        return fallbackDir;
      } catch (fallbackError: any) {
        logger.error("Fallback directory also failed", {
          error: fallbackError.message,
          code: fallbackError.code,
        });

        // Request folder access from user
        if (mainWindow) {
          const result = await dialog.showMessageBox(mainWindow, {
            type: "warning",
            title: "Permission Required",
            message: "pilotstack needs permission to save videos",
            detail: `Cannot write to the output folder. Please select a folder where pilotstack can save videos.\n\nError: ${fallbackError.message}\n\nClick "Select Folder" to choose a location, or "Cancel" to abort.`,
            buttons: ["Select Folder", "Cancel"],
            defaultId: 0,
          });

          if (result.response === 0) {
            mainWindow?.webContents.send("video:request-folder-access");
            throw new VideoError(
              "Please select an output folder in Settings. The app will request folder access when you choose a location."
            );
          }
        }

        throw new VideoError(
          `Cannot create output directory. Please check file permissions or select a different folder in Settings. Error: ${mkdirError.message}`
        );
      }
    } else {
      throw new VideoError(
        `Cannot create output directory. Please check file permissions in System Settings > Privacy & Security > Files and Folders. Error: ${mkdirError.message}`
      );
    }
  }
}

/**
 * Parse FFmpeg progress from stderr output
 */
export function parseFFmpegProgress(
  chunk: string,
  totalFrames?: number
): {
  progress?: number;
  time?: string;
  currentFrame?: number;
} | null {
  const frameMatch = chunk.match(/frame=\s*(\d+)/);
  const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);

  if (timeMatch) {
    const progress = frameMatch && totalFrames
      ? Math.min((parseInt(frameMatch[1]) / totalFrames) * 100, 99)
      : undefined;
    
    return {
      progress,
      time: timeMatch[1],
      currentFrame: frameMatch ? parseInt(frameMatch[1]) : undefined,
    };
  }

  return null;
}

/**
 * Check if FFmpeg error indicates hardware encoding failure
 */
export function isHardwareEncodingError(stderr: string): boolean {
  return (
    stderr.includes("Cannot load") ||
    stderr.includes("No NVENC capable devices") ||
    stderr.includes("Failed to initialise VAAPI") ||
    stderr.includes("Error initializing")
  );
}

/**
 * Get user-friendly error message from FFmpeg stderr
 */
export function getFFmpegErrorMessage(stderr: string): string {
  if (stderr.includes("No such file or directory")) {
    return "Frame files not found. Check if capture format matches input pattern.";
  }
  if (stderr.includes("Invalid data")) {
    return "Some frames may be corrupted.";
  }
  if (
    stderr.includes("Permission denied") ||
    stderr.includes("EACCES") ||
    stderr.includes("EPERM") ||
    stderr.includes("cannot open")
  ) {
    return "Permission denied: Cannot write output video file. Please check file permissions or select a different output folder in Settings.";
  }
  if (stderr.includes("drawtext")) {
    return "Overlay rendering failed. Retrying without overlays...";
  }
  return "Video generation failed";
}

/**
 * Video generation result
 */
export interface FrameBasedGenerationResult {
  success: boolean;
  outputFile: string;
  speedMultiplier: number;
  originalFrames: number;
  inputFormat: string;
}

/**
 * Run frame-based video generation FFmpeg process
 */
export async function runFrameBasedGeneration(
  ffmpegPath: string,
  args: string[],
  sessionFolder: string,
  outputFile: string,
  validation: { validFrames: number },
  extension: string,
  speedMultiplier: number,
  onProgress?: (progress: {
    progress: number;
    time?: string;
    currentFrame?: number;
    totalFrames?: number;
    speedMultiplier?: number;
    inputFormat?: string;
  }) => void,
  onRetry?: () => Promise<FrameBasedGenerationResult>
): Promise<FrameBasedGenerationResult> {
  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpegPath, args);
    let stderr = "";

    ffmpegProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;

      const progressInfo = parseFFmpegProgress(chunk, validation.validFrames);
      if (progressInfo && progressInfo.progress !== undefined) {
        onProgress?.({
          time: progressInfo.time,
          progress: progressInfo.progress,
          currentFrame: progressInfo.currentFrame,
          totalFrames: validation.validFrames,
          speedMultiplier,
          inputFormat: extension,
        });
      }
    });

    ffmpegProcess.on("close", async (code) => {
      if (code === 0) {
        logger.info("FFmpeg process completed successfully", {
          outputFile,
        });

        try {
          const outputStats = await fs.promises.stat(outputFile);
          if (outputStats.size < 100) {
            logger.error("Output video file is too small", {
              size: outputStats.size,
              outputFile,
            });
            reject(new VideoError("Output video file is too small"));
            return;
          }
          logger.info("Output video verified", {
            size: outputStats.size,
            outputFile,
          });
        } catch (statError: any) {
          logger.error("Failed to verify output video", {
            error: statError.message,
            code: statError.code,
            outputFile,
          });
          if (statError.code === "EACCES" || statError.code === "EPERM") {
            reject(
              new VideoError(
                `Permission denied: Cannot access output file. Please check file permissions or select a different output folder in Settings.`
              )
            );
          } else {
            reject(
              new VideoError(
                `Failed to verify output video: ${statError.message}`
              )
            );
          }
          return;
        }

        try {
          await fs.promises.rm(sessionFolder, {
            recursive: true,
            force: true,
          });
        } catch (_e) {
          // Cleanup errors are non-critical
        }

        resolve({
          success: true,
          outputFile,
          speedMultiplier,
          originalFrames: validation.validFrames,
          inputFormat: extension,
        });
      } else {
        const errorMessage = getFFmpegErrorMessage(stderr);

        // If overlay fails, try without it
        if (stderr.includes("drawtext") && onRetry) {
          logger.warn("Overlay failed, retrying without stats");
          try {
            const result = await onRetry();
            resolve(result);
            return;
          } catch (_retryError) {
            // Fall through to error
          }
        }

        logger.error("FFmpeg process failed", {
          code,
          stderr: stderr.substring(0, 500),
        });

        reject(new VideoError(errorMessage));
      }
    });

    ffmpegProcess.on("error", (err: any) => {
      let errorMessage = `FFmpeg failed to start: ${err.message}`;
      if (err.code === "EACCES" || err.code === "EPERM") {
        errorMessage =
          "Permission denied: Cannot execute FFmpeg. Please check file permissions.";
      } else if (err.code === "ENOENT") {
        errorMessage =
          "FFmpeg not found. Please ensure FFmpeg is properly installed.";
      }
      reject(new VideoError(errorMessage));
    });
  });
}

