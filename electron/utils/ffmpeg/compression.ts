/**
 * FFmpeg Compression Utilities
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Compression
 *
 * Video compression utilities for upload optimization.
 */

import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { PLATFORM } from "../platform";
import { logger } from "../logger";
import { getFFmpegPath } from "./path-resolver";

// Upload size thresholds
export const UPLOAD_SIZE_THRESHOLD = 100 * 1024 * 1024; // 100MB - compress above this
const TARGET_UPLOAD_BITRATE = "4M"; // Target 4 Mbps for good quality web playback
const AGGRESSIVE_UPLOAD_BITRATE = "2M"; // 2 Mbps for very large files

/**
 * Upload compression settings
 */
export interface UploadCompressionSettings {
  needsCompression: boolean;
  targetBitrate?: string;
  crf?: string;
  estimatedSizeMB?: number;
  reason: string;
}

/**
 * Compression result
 */
export interface CompressionResult {
  success: boolean;
  outputPath?: string;
  wasCompressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
  reason?: string;
  error?: string;
}

/**
 * Get compression arguments optimized for cloud upload
 * Balances quality vs file size for web playback
 */
export function getUploadCompressionSettings(
  originalSize: number,
  duration: number
): UploadCompressionSettings {
  const originalBitrate = (originalSize * 8) / duration;
  const originalBitrateMbps = originalBitrate / 1000000;

  const sizeMB = originalSize / (1024 * 1024);

  logger.info("Analyzing video for upload compression", {
    originalSizeMB: sizeMB.toFixed(2),
    durationSeconds: duration,
    originalBitrateMbps: originalBitrateMbps.toFixed(2),
  });

  if (originalSize < UPLOAD_SIZE_THRESHOLD) {
    return {
      needsCompression: false,
      reason: "File already under upload threshold",
    };
  }

  let targetBitrate = TARGET_UPLOAD_BITRATE;
  let crf = "28";

  if (sizeMB > 500) {
    targetBitrate = AGGRESSIVE_UPLOAD_BITRATE;
    crf = "30";
  } else if (sizeMB > 300) {
    targetBitrate = "3M";
    crf = "29";
  }

  const targetBitrateNum = parseFloat(targetBitrate) * 1000000;
  const estimatedSizeMB = (targetBitrateNum * duration) / 8 / 1024 / 1024;

  logger.info("Upload compression settings calculated", {
    targetBitrate,
    crf,
    estimatedSizeMB: estimatedSizeMB.toFixed(2),
    compressionRatio: (sizeMB / estimatedSizeMB).toFixed(2),
  });

  return {
    needsCompression: true,
    targetBitrate,
    crf,
    estimatedSizeMB,
    reason: `Compressing ${sizeMB.toFixed(0)}MB to ~${estimatedSizeMB.toFixed(0)}MB`,
  };
}

/**
 * Get FFmpeg arguments for upload-optimized compression
 */
export function getUploadCompressionArgs(
  settings: UploadCompressionSettings
): string[] {
  if (!settings.needsCompression || !settings.targetBitrate || !settings.crf) {
    return [];
  }

  const threads = Math.max(1, PLATFORM.CPU_COUNT - 1);

  return [
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    settings.crf,
    "-maxrate",
    settings.targetBitrate,
    "-bufsize",
    `${parseFloat(settings.targetBitrate) * 2}M`,
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    String(threads),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
  ];
}

/**
 * Get video duration using FFmpeg
 */
export async function getVideoDuration(
  videoPath: string
): Promise<number | null> {
  return new Promise((resolve) => {
    const ffmpegPath = getFFmpegPath();

    const args = ["-i", videoPath, "-f", "null", "-"];

    const process = spawn(ffmpegPath, args);
    let stderr = "";

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", () => {
      const durationMatch = stderr.match(
        /Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/
      );
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        resolve(hours * 3600 + minutes * 60 + seconds);
      } else {
        resolve(null);
      }
    });

    process.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Compress video for upload
 * Creates a temporary compressed version optimized for cloud storage
 */
export async function compressForUpload(
  inputPath: string,
  onProgress?: (progress: number) => void
): Promise<CompressionResult> {
  return new Promise(async (resolve) => {
    try {
      const stats = await fs.promises.stat(inputPath);
      const duration = await getVideoDuration(inputPath);

      if (!duration || duration <= 0) {
        resolve({
          success: false,
          error: "Could not determine video duration",
        });
        return;
      }

      const settings = getUploadCompressionSettings(stats.size, duration);

      if (!settings.needsCompression) {
        resolve({
          success: true,
          outputPath: inputPath,
          wasCompressed: false,
          reason: settings.reason,
        });
        return;
      }

      logger.info("Starting upload compression", {
        inputPath,
        originalSizeMB: (stats.size / 1024 / 1024).toFixed(2),
        settings,
      });

      const outputDir = path.dirname(inputPath);
      const outputPath = path.join(
        outputDir,
        `upload_${Date.now()}_${path.basename(inputPath)}`
      );

      const ffmpegPath = getFFmpegPath();
      const compressionArgs = getUploadCompressionArgs(settings);

      const args = ["-y", "-i", inputPath, ...compressionArgs, outputPath];

      logger.debug("FFmpeg compression command", {
        ffmpegPath,
        args: args.join(" "),
      });

      const ffmpegProcess = spawn(ffmpegPath, args);
      let stderr = "";

      ffmpegProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;

        const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && onProgress) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const progress = Math.min(
            99,
            Math.round((currentTime / duration) * 100)
          );
          onProgress(progress);
        }
      });

      ffmpegProcess.on("close", async (code) => {
        if (code === 0) {
          try {
            const outputStats = await fs.promises.stat(outputPath);
            const compressionRatio = stats.size / outputStats.size;

            logger.info("Upload compression completed", {
              originalSizeMB: (stats.size / 1024 / 1024).toFixed(2),
              compressedSizeMB: (outputStats.size / 1024 / 1024).toFixed(2),
              compressionRatio: compressionRatio.toFixed(2),
              outputPath,
            });

            if (onProgress) onProgress(100);

            resolve({
              success: true,
              outputPath,
              wasCompressed: true,
              originalSize: stats.size,
              compressedSize: outputStats.size,
              compressionRatio,
              reason: settings.reason,
            });
          } catch (statError: any) {
            resolve({
              success: false,
              error: `Failed to verify compressed file: ${statError.message}`,
            });
          }
        } else {
          logger.error("Upload compression failed", {
            code,
            stderr: stderr.slice(-500),
          });

          try {
            await fs.promises.unlink(outputPath);
          } catch (_e) {
            // Ignore cleanup errors
          }

          resolve({
            success: false,
            error: `Compression failed with code ${code}`,
          });
        }
      });

      ffmpegProcess.on("error", (err) => {
        logger.error("FFmpeg compression process error", { error: err.message });
        resolve({
          success: false,
          error: `FFmpeg error: ${err.message}`,
        });
      });
    } catch (error: any) {
      logger.error("Upload compression error", { error: error.message });
      resolve({
        success: false,
        error: error.message,
      });
    }
  });
}

/**
 * Clean up temporary compressed file
 */
export async function cleanupCompressedFile(
  filePath: string,
  originalPath: string
): Promise<void> {
  if (filePath && filePath !== originalPath) {
    try {
      await fs.promises.unlink(filePath);
      logger.debug("Cleaned up temporary compressed file", { filePath });
    } catch (error: any) {
      logger.warn("Failed to clean up compressed file", {
        filePath,
        error: error.message,
      });
    }
  }
}
