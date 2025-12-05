/**
 * Frame Validator
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Generation Flow
 * 
 * Validates and renumbers frame sequence for video generation.
 * Maps to: handlers/video.js validateAndRenumberFrames()
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";
import { StreamingEncoder } from "../../managers/streaming/streaming-encoder";

/**
 * Frame validation result
 */
export interface FrameValidationResult {
  success: boolean;
  validFrames: number;
  totalFrames: number;
  invalidCount: number;
  dimensions?: { width: number; height: number };
  format?: string;
  extension?: string;
  isStreamingSession?: boolean;
  duration?: number;
  segmentCount?: number;
  isRecovered?: boolean;
  error?: string;
}

/**
 * Frame format detection result
 */
export interface FrameFormatInfo {
  format: "jpeg" | "png";
  extension: "jpg" | "png";
  count: number;
}

/**
 * Frame validator for video generation
 */
export class FrameValidator {
  /**
   * Detect the frame format in a session folder
   */
  async detectFrameFormat(sessionFolder: string): Promise<FrameFormatInfo> {
    const files = await fs.promises.readdir(sessionFolder);

    const jpgFiles = files.filter((f) => f.endsWith(".jpg"));
    const pngFiles = files.filter((f) => f.endsWith(".png"));

    if (jpgFiles.length > pngFiles.length) {
      return { format: "jpeg", extension: "jpg", count: jpgFiles.length };
    }
    return { format: "png", extension: "png", count: pngFiles.length };
  }

  /**
   * Check if a session folder contains HLS streaming output
   */
  async isStreamingSession(sessionFolder: string): Promise<boolean> {
    return await StreamingEncoder.isStreamingOutput(sessionFolder);
  }

  /**
   * Load metadata from a streaming encoder session
   */
  async loadStreamingMetadata(sessionFolder: string): Promise<any> {
    return await StreamingEncoder.loadMetadata(sessionFolder);
  }

  /**
   * Validate and renumber frames
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Generation Flow
   * Maps to: handlers/video.js validateAndRenumberFrames()
   */
  async validateAndRenumberFrames(
    sessionFolder: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<FrameValidationResult> {
    logger.info("Starting frame validation", { sessionFolder });
    onProgress?.(5, "Checking session type...");

    // First, check if this is a streaming session (HLS output)
    const isStreaming = await this.isStreamingSession(sessionFolder);
    const playlistPath = path.join(sessionFolder, "recording.m3u8");
    const hasPlaylist = fs.existsSync(playlistPath);

    if (isStreaming || hasPlaylist) {
      logger.info("Validating streaming session", {
        sessionFolder,
        detectedBy: isStreaming ? "metadata" : "playlist",
      });
      onProgress?.(20, "Loading session metadata...");

      // Load streaming metadata with timeout protection
      let streamingMetadata: any = null;
      try {
        const loadPromise = this.loadStreamingMetadata(sessionFolder);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Metadata load timeout")), 30000)
        );
        streamingMetadata = await Promise.race([loadPromise, timeoutPromise]);
      } catch (loadError: any) {
        logger.warn("Failed to load streaming metadata, attempting recovery", {
          error: loadError.message,
        });
      }

      onProgress?.(40, "Verifying video segments...");

      // Even if metadata load failed, we can still try to process if playlist exists
      if (!streamingMetadata && hasPlaylist) {
        logger.info("Metadata unavailable, creating minimal metadata from playlist");

        const files = await fs.promises.readdir(sessionFolder);
        const segmentFiles = files.filter((f) => f.endsWith(".ts"));

        if (segmentFiles.length > 0) {
          // Estimate frame count from segments (rough estimate: 6 seconds per segment at 30fps)
          const estimatedFrameCount = segmentFiles.length * 6 * 30;

          streamingMetadata = {
            playlistPath,
            frameCount: estimatedFrameCount,
            segmentCount: segmentFiles.length,
            width: 1920,
            height: 1080,
            duration: segmentFiles.length * 6, // Estimated duration
            isRecovered: true,
          };

          logger.info("Created recovered metadata", {
            segmentCount: segmentFiles.length,
            estimatedFrameCount,
          });
        }
      }

      if (!streamingMetadata) {
        return {
          success: false,
          error:
            "No metadata found for streaming session. The recording may be corrupted.",
          validFrames: 0,
          totalFrames: 0,
          invalidCount: 0,
          isStreamingSession: true,
        };
      }

      onProgress?.(60, "Checking frame count...");

      // Check if we have frames in the metadata
      if (!streamingMetadata.frameCount || streamingMetadata.frameCount === 0) {
        return {
          success: false,
          error: "No frames captured in streaming session",
          validFrames: 0,
          totalFrames: 0,
          invalidCount: 0,
          isStreamingSession: true,
        };
      }

      // Verify playlist exists
      const actualPlaylistPath =
        streamingMetadata.playlistPath || playlistPath;
      if (!fs.existsSync(actualPlaylistPath)) {
        return {
          success: false,
          error: "HLS playlist not found",
          validFrames: 0,
          totalFrames: 0,
          invalidCount: 0,
          isStreamingSession: true,
        };
      }

      onProgress?.(80, "Verifying segments...");

      // Verify at least one segment exists
      const files = await fs.promises.readdir(sessionFolder);
      const segmentFiles = files.filter((f) => f.endsWith(".ts"));

      if (segmentFiles.length === 0) {
        return {
          success: false,
          error: "No HLS segments found",
          validFrames: 0,
          totalFrames: 0,
          invalidCount: 0,
          isStreamingSession: true,
        };
      }

      onProgress?.(100, "Validation complete!");

      logger.info("Streaming session validated", {
        frameCount: streamingMetadata.frameCount,
        segmentCount: segmentFiles.length,
        duration: streamingMetadata.duration,
        isRecovered: streamingMetadata.isRecovered || false,
      });

      return {
        success: true,
        validFrames: streamingMetadata.frameCount,
        totalFrames: streamingMetadata.frameCount,
        invalidCount: 0,
        dimensions: {
          width: streamingMetadata.width || 1920,
          height: streamingMetadata.height || 1080,
        },
        format: "hls",
        extension: "ts",
        isStreamingSession: true,
        duration: streamingMetadata.duration,
        segmentCount: segmentFiles.length,
        isRecovered: streamingMetadata.isRecovered || false,
      };
    }

    onProgress?.(20, "Analyzing frame files...");

    // Legacy path: frame-by-frame validation
    onProgress?.(50, "Scanning frame directory...");

    try {
      const formatInfo = await this.detectFrameFormat(sessionFolder);
      const files = await fs.promises.readdir(sessionFolder);
      const frameFiles = files
        .filter((f) => f.endsWith(`.${formatInfo.extension}`))
        .sort();

      if (frameFiles.length === 0) {
        return {
          success: false,
          error: "No frames found",
          validFrames: 0,
          totalFrames: 0,
          invalidCount: 0,
        };
      }

      onProgress?.(80, "Reading frame metadata...");

      // Get dimensions from first frame
      const sharp = require("sharp");
      const firstFrame = path.join(sessionFolder, frameFiles[0]);
      const frameMeta = await sharp(firstFrame).metadata();

      onProgress?.(100, "Validation complete!");

      return {
        success: true,
        validFrames: frameFiles.length,
        totalFrames: frameFiles.length,
        invalidCount: 0,
        dimensions: { width: frameMeta.width, height: frameMeta.height },
        format: formatInfo.format,
        extension: formatInfo.extension,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        validFrames: 0,
        totalFrames: 0,
        invalidCount: 0,
      };
    }
  }

  /**
   * Count frames in session folder
   */
  async countFrames(sessionFolder: string): Promise<number> {
    try {
      const formatInfo = await this.detectFrameFormat(sessionFolder);
      const files = await fs.promises.readdir(sessionFolder);
      return files.filter((f) => f.endsWith(`.${formatInfo.extension}`)).length;
    } catch {
      return 0;
    }
  }
}
