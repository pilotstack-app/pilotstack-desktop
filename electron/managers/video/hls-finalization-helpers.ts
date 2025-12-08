/**
 * HLS Finalization Helpers
 * 
 * Helper functions for HLS finalization operations.
 * Extracted from hls-finalizer.ts to keep file sizes under 300 lines.
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { logger } from "../../utils/logger";
import { VideoError } from "../../core/app-error";
import { FFmpegBuilder } from "./ffmpeg-builder";
import { HLSFinalizationOptions, HLSFinalizationResult } from "./hls-finalizer";

/**
 * Fast HLS to MP4 finalization using stream copy (no re-encoding)
 */
export async function finalizeFastHLS(
  sessionFolder: string,
  metadata: any,
  outputFile: string,
  musicPath: string | null,
  ffmpegBuilder: FFmpegBuilder,
  options: HLSFinalizationOptions = {}
): Promise<HLSFinalizationResult> {
  const ffmpegPath = ffmpegBuilder.getFFmpegPath();
  const playlistPath =
    metadata.playlistPath || path.join(sessionFolder, "recording.m3u8");

  logger.info("Starting fast HLS finalization (stream copy)", {
    playlistPath,
    outputFile,
    hasMusic: !!musicPath,
    durationMinutes: (metadata.duration / 60).toFixed(1),
  });

  return new Promise((resolve, reject) => {
    const args = ffmpegBuilder.buildFastHLSFinalizationCommand({
      playlistPath,
      output: outputFile,
      musicPath: musicPath || undefined,
    });

    const ffmpegProcess = spawn(ffmpegPath, args);
    let stderr = "";
    const startTime = Date.now();

    ffmpegProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;

      const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && metadata.duration) {
        const timeParts = timeMatch[1].split(":");
        const currentTime =
          parseInt(timeParts[0]) * 3600 +
          parseInt(timeParts[1]) * 60 +
          parseFloat(timeParts[2]);
        const progress = Math.min(
          99,
          Math.round((currentTime / metadata.duration) * 100)
        );

        options.onProgress?.({
          time: timeMatch[1],
          progress,
          currentTime,
          totalDuration: metadata.duration,
          isFastMode: true,
        });
      }
    });

    ffmpegProcess.on("close", async (code) => {
      const elapsed = (Date.now() - startTime) / 1000;

      if (code === 0) {
        logger.info("Fast HLS finalization completed", {
          outputFile,
          elapsedSeconds: elapsed.toFixed(1),
          durationMinutes: (metadata.duration / 60).toFixed(1),
        });

        try {
          const outputStats = await fs.promises.stat(outputFile);
          if (outputStats.size < 100) {
            reject(new VideoError("Output video file is too small"));
            return;
          }

          // Clean up session folder - DISABLED for metrics preservation
          try {
            // await fs.promises.rm(sessionFolder, {
            //   recursive: true,
            //   force: true,
            // });
            logger.info("Preserving streaming session folder", {
              sessionFolder,
            });
          } catch (cleanupError: any) {
            logger.warn("Failed to clean up session folder", {
              error: cleanupError.message,
            });
          }

          resolve({
            success: true,
            outputFile,
            frameCount: metadata.frameCount,
            duration: metadata.duration,
            segmentCount: metadata.segmentCount,
            isStreamingFinalization: true,
            isFastMode: true,
            noOverlays: true,
            finalizationTime: elapsed,
            activityMarkers: metadata.activityMarkers,
            totalKeystrokes: metadata.totalKeystrokes,
            pasteCount: metadata.pasteCount,
            idleFrameCount: metadata.idleFrameCount,
            activeFrameCount: metadata.activeFrameCount,
          });
        } catch (statError: any) {
          reject(
            new VideoError(
              `Failed to verify output video: ${statError.message}`
            )
          );
        }
      } else {
        logger.error("Fast HLS finalization failed", {
          code,
          stderr: stderr.slice(-500),
        });
        reject(new VideoError(`Fast remux failed: ${code}`));
      }
    });

    ffmpegProcess.on("error", (err) => {
      reject(new VideoError(`FFmpeg error: ${err.message}`));
    });
  });
}

/**
 * Simple HLS to MP4 remux without overlays (fallback)
 */
export async function finalizeSimpleHLS(
  sessionFolder: string,
  metadata: any,
  outputFile: string,
  ffmpegBuilder: FFmpegBuilder
): Promise<HLSFinalizationResult> {
  const ffmpegPath = ffmpegBuilder.getFFmpegPath();
  const playlistPath =
    metadata.playlistPath || path.join(sessionFolder, "recording.m3u8");

  return new Promise((resolve, reject) => {
    const args = ffmpegBuilder.buildSimpleHLSRemuxCommand({
      playlistPath,
      output: outputFile,
    });

    const ffmpegProcess = spawn(ffmpegPath, args);
    let _stderr = "";

    ffmpegProcess.stderr.on("data", (data) => {
      _stderr += data.toString();
    });

    ffmpegProcess.on("close", async (code) => {
      if (code === 0) {
        try {
          await fs.promises.rm(sessionFolder, { recursive: true, force: true });
        } catch (_e) {
          // Ignore cleanup errors
        }

        resolve({
          success: true,
          outputFile,
          frameCount: metadata.frameCount,
          duration: metadata.duration,
          isStreamingFinalization: true,
          noOverlays: true,
        });
      } else {
        reject(new VideoError(`Simple remux failed: ${code}`));
      }
    });

    ffmpegProcess.on("error", (err) => {
      reject(new VideoError(`FFmpeg error: ${err.message}`));
    });
  });
}

/**
 * HLS to MP4 finalization with overlays
 */
export async function runHLSFinalizationWithOverlays(
  ffmpegPath: string,
  args: string[],
  sessionFolder: string,
  outputFile: string,
  metadata: any,
  options: HLSFinalizationOptions = {},
  _ffmpegBuilder: FFmpegBuilder
): Promise<HLSFinalizationResult> {
  logger.info("Starting HLS finalization with overlays", {
    ffmpegPath,
    outputFile,
    durationMinutes: metadata.duration ? (metadata.duration / 60).toFixed(1) : "unknown",
  });

  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpegPath, args);
    let stderr = "";
    const startTime = Date.now();

    ffmpegProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;

      const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && metadata.duration) {
        const timeParts = timeMatch[1].split(":");
        const currentTime =
          parseInt(timeParts[0]) * 3600 +
          parseInt(timeParts[1]) * 60 +
          parseFloat(timeParts[2]);
        const progress = Math.min(
          99,
          Math.round((currentTime / metadata.duration) * 100)
        );

        options.onProgress?.({
          time: timeMatch[1],
          progress,
          currentTime,
          totalDuration: metadata.duration,
          isFastMode: false,
        });
      }
    });

    ffmpegProcess.on("close", async (code) => {
      const elapsed = (Date.now() - startTime) / 1000;

      if (code === 0) {
        logger.info("HLS finalization with overlays completed", {
          outputFile,
          elapsedSeconds: elapsed.toFixed(1),
        });

        try {
          const outputStats = await fs.promises.stat(outputFile);
          if (outputStats.size < 100) {
            reject(new VideoError("Output video file is too small"));
            return;
          }

          // Clean up session folder - DISABLED for metrics preservation
          try {
            // await fs.promises.rm(sessionFolder, {
            //   recursive: true,
            //   force: true,
            // });
            logger.info("Preserving streaming session folder", {
              sessionFolder,
            });
          } catch (cleanupError: any) {
            logger.warn("Failed to clean up session folder", {
              error: cleanupError.message,
            });
          }

          resolve({
            success: true,
            outputFile,
            frameCount: metadata.frameCount || 0,
            duration: metadata.duration || 0,
            segmentCount: metadata.segmentCount,
            isStreamingFinalization: true,
            isFastMode: false,
            noOverlays: false,
            finalizationTime: elapsed,
            activityMarkers: metadata.activityMarkers,
            totalKeystrokes: metadata.totalKeystrokes,
            pasteCount: metadata.pasteCount,
            idleFrameCount: metadata.idleFrameCount,
            activeFrameCount: metadata.activeFrameCount,
          });
        } catch (statError: any) {
          reject(
            new VideoError(
              `Failed to verify output video: ${statError.message}`
            )
          );
        }
      } else {
        logger.error("HLS finalization with overlays failed", {
          code,
          stderr: stderr.slice(-500),
        });
        reject(new VideoError(`HLS finalization failed: ${code}`));
      }
    });

    ffmpegProcess.on("error", (err) => {
      reject(new VideoError(`FFmpeg error: ${err.message}`));
    });
  });
}

