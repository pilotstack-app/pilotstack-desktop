/**
 * Simplified Video Manager
 * 
 * Simple approach: Convert frames to timelapse video with proper speed.
 * No HLS, no complex filters, just reliable frame-to-video conversion.
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { app } from "electron";
import { AppContext } from "../../core/app-context";
import { VideoError } from "../../core/app-error";
import { store } from "../../config/store";
import { logger } from "../../utils/logger";
import { getFFmpegPath, getSoftwareEncodingArgs } from "../../utils/ffmpeg";

/**
 * Video generation result
 */
export interface VideoGenerationResult {
  success: boolean;
  outputFile: string;
  speedMultiplier?: number;
  originalFrames?: number;
  inputFormat?: string;
}

/**
 * Video generation options
 */
export interface VideoGenerationOptions {
  metadata?: {
    totalDuration?: number;
    activeDuration?: number;
    pasteEventCount?: number;
    verificationScore?: number;
    isVerified?: boolean;
  };
  onProgress?: (progress: {
    progress: number;
    time?: string;
    currentFrame?: number;
    totalFrames?: number;
    speedMultiplier?: number;
    message?: string;
  }) => void;
}

/**
 * Target timelapse duration (30 seconds)
 */
const TARGET_TIMELAPSE_DURATION = 30;

/**
 * Simplified Video Manager
 * 
 * Converts captured frames to timelapse video.
 * Simple, reliable, works on all devices.
 */
export class VideoManager {
  constructor(_context: AppContext) {
    // Context stored for potential future use
  }

  /**
   * Calculate speed multiplier to achieve target timelapse duration
   */
  calculateSpeedMultiplier(
    totalFrames: number,
    captureIntervalMs: number,
    targetDuration: number = TARGET_TIMELAPSE_DURATION
  ): number {
    // Calculate original duration in seconds
    const originalDuration = (totalFrames * captureIntervalMs) / 1000;

    if (originalDuration <= targetDuration) {
      return 1; // No speedup needed
    }

    // Calculate speedup to achieve target duration
    const speedup = originalDuration / targetDuration;

    // Cap the speedup to avoid too-fast videos (max 50x)
    return Math.min(speedup, 50);
  }

  /**
   * Count frames in session folder (public for IPC handler)
   */
  async countFrames(sessionFolder: string): Promise<number> {
    try {
      const files = await fs.promises.readdir(sessionFolder);
      const frameFiles = files.filter((f) => f.match(/^frame_\d+\.(jpg|jpeg|png)$/i));
      return frameFiles.length;
    } catch (error) {
      logger.error("Failed to count frames", { error: (error as Error).message });
      return 0;
    }
  }

  /**
   * Ensure dimensions are even (required by H.264 encoder)
   * Also ensures minimum dimensions for video quality
   */
  private ensureEvenDimensions(width: number, height: number): { width: number; height: number } {
    // Ensure minimum dimensions
    const minWidth = 640;
    const minHeight = 360;
    
    let finalWidth = Math.max(width, minWidth);
    let finalHeight = Math.max(height, minHeight);
    
    // Ensure even dimensions
    finalWidth = finalWidth % 2 === 0 ? finalWidth : finalWidth - 1;
    finalHeight = finalHeight % 2 === 0 ? finalHeight : finalHeight - 1;
    
    return { width: finalWidth, height: finalHeight };
  }

  /**
   * Parse JPEG dimensions from buffer
   * JPEG stores dimensions in SOF (Start of Frame) markers
   */
  private parseJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      let offset = 2; // Skip SOI marker (0xFFD8)
      
      while (offset < buffer.length - 8) {
        // Check for marker prefix
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        
        const marker = buffer[offset + 1];
        
        // Skip 0xFF padding bytes
        if (marker === 0xff) {
          offset++;
          continue;
        }
        
        // SOF markers (Start of Frame) contain dimensions
        // SOF0-SOF3: 0xC0-0xC3, SOF5-SOF7: 0xC5-0xC7, SOF9-SOF11: 0xC9-0xCB, SOF13-SOF15: 0xCD-0xCF
        if ((marker >= 0xc0 && marker <= 0xc3) || 
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)) {
          // SOF structure: marker (2) + length (2) + precision (1) + height (2) + width (2)
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          
          if (width > 0 && height > 0 && width < 10000 && height < 10000) {
            return { width, height };
          }
        }
        
        // Read segment length and skip
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get frame dimensions from the first valid frame
   * Supports both PNG and JPEG formats
   */
  private async getFrameDimensions(sessionFolder: string): Promise<{ width: number; height: number }> {
    const defaultDimensions = { width: 1920, height: 1080 };
    
    try {
      const files = await fs.promises.readdir(sessionFolder);
      const frameFiles = files
        .filter((f) => f.match(/^frame_\d+\.(jpg|jpeg|png)$/i))
        .sort();
      
      if (frameFiles.length === 0) {
        logger.warn("No frame files found, using default dimensions");
        return defaultDimensions;
      }
      
      // Try first few frames in case one is corrupted
      const framesToTry = Math.min(3, frameFiles.length);
      
      for (let i = 0; i < framesToTry; i++) {
        const framePath = path.join(sessionFolder, frameFiles[i]);
        
        try {
          const buffer = await fs.promises.readFile(framePath);
          
          if (buffer.length < 100) {
            continue; // Skip tiny/empty files
          }
          
          // Check PNG magic bytes: 0x89 0x50 0x4E 0x47
          if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
            // PNG - dimensions are at bytes 16-23 (IHDR chunk)
            if (buffer.length >= 24) {
              const width = buffer.readUInt32BE(16);
              const height = buffer.readUInt32BE(20);
              
              // Sanity check dimensions
              if (width > 0 && height > 0 && width < 10000 && height < 10000) {
                logger.debug("Detected PNG dimensions", { width, height, file: frameFiles[i] });
                return this.ensureEvenDimensions(width, height);
              }
            }
          }
          // Check JPEG magic bytes: 0xFF 0xD8 0xFF
          else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            const dimensions = this.parseJpegDimensions(buffer);
            if (dimensions) {
              logger.debug("Detected JPEG dimensions", { ...dimensions, file: frameFiles[i] });
              return this.ensureEvenDimensions(dimensions.width, dimensions.height);
            }
          }
        } catch (frameError) {
          logger.debug("Failed to read frame", { file: frameFiles[i], error: (frameError as Error).message });
          continue;
        }
      }
      
      logger.warn("Could not detect dimensions from frames, using default");
      return defaultDimensions;
    } catch (error) {
      logger.warn("Failed to get frame dimensions, using default", {
        error: (error as Error).message,
      });
      return defaultDimensions;
    }
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory(outputDir: string): Promise<string> {
    try {
      await fs.promises.mkdir(outputDir, { recursive: true });
      const testFile = path.join(outputDir, `.pilotstack_test_${Date.now()}.tmp`);
      try {
        await fs.promises.writeFile(testFile, "test");
        await fs.promises.unlink(testFile);
        return outputDir;
      } catch {
        const fallbackDir = app.getPath("videos");
        await fs.promises.mkdir(fallbackDir, { recursive: true });
        store.delete("outputDirectory");
        return fallbackDir;
      }
    } catch (_error) {
      const fallbackDir = app.getPath("videos");
      await fs.promises.mkdir(fallbackDir, { recursive: true });
      store.delete("outputDirectory");
      return fallbackDir;
    }
  }

  /**
   * Generate video from frames
   * 
   * Simple, reliable timelapse generation.
   */
  async generate(
    sessionFolder: string,
    musicPath?: string,
    options: VideoGenerationOptions = {}
  ): Promise<VideoGenerationResult> {
    const frameRate = store.get("frameRate") || 30;
    const captureInterval = store.get("captureInterval") || 1000;
    
    let outputDir = store.get("outputDirectory") || app.getPath("videos");
    outputDir = await this.ensureOutputDirectory(outputDir);
    
    logger.info("Starting video generation", {
      sessionFolder,
      outputDir,
      hasMusic: !!musicPath,
    });

    // Count frames
    const totalFrames = await this.countFrames(sessionFolder);
    if (totalFrames === 0) {
      throw new VideoError("No frames found in session folder.");
    }

    logger.info("Frames found", { totalFrames });

    // Get frame dimensions and ensure they're even (required by H.264)
    const { width: originalWidth, height: originalHeight } = await this.getFrameDimensions(sessionFolder);
    const { width, height } = this.ensureEvenDimensions(originalWidth, originalHeight);

    // Log if dimensions were adjusted
    if (originalWidth !== width || originalHeight !== height) {
      logger.info("Adjusted frame dimensions to be even", {
        original: { width: originalWidth, height: originalHeight },
        adjusted: { width, height },
      });
    }

    // Calculate speed multiplier for timelapse
    const speedMultiplier = this.calculateSpeedMultiplier(
      totalFrames,
      captureInterval
    );
    
    // Calculate effective frame rate (input frame rate * speed multiplier)
    // This makes the video play faster, creating a timelapse
    const effectiveFrameRate = frameRate * speedMultiplier;
    
    // Cap at 60fps for compatibility
    const finalFrameRate = Math.min(effectiveFrameRate, 60);

    logger.info("Timelapse settings", {
      totalFrames,
      captureInterval,
      speedMultiplier: speedMultiplier.toFixed(2),
      effectiveFrameRate: finalFrameRate.toFixed(2),
      width,
      height,
    });

    // Determine input pattern (try png first, then jpg for backward compatibility)
    let inputPattern = path.join(sessionFolder, "frame_%06d.png");
    let extension = "png";
    
    // Check if png files exist, otherwise try jpg
    const files = await fs.promises.readdir(sessionFolder);
    const frameFiles = files.filter((f) => f.match(/^frame_\d+\.(png|jpg|jpeg)$/i));
    
    if (frameFiles.length === 0) {
      throw new VideoError("No frame files found in session folder.");
    }
    
    // Check frame numbering - ensure frames start from 1
    const frameNumbers = frameFiles
      .map((f) => {
        const match = f.match(/^frame_(\d+)\./i);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    
    if (frameNumbers.length === 0) {
      throw new VideoError("Could not parse frame numbers from filenames.");
    }
    
    const minFrame = frameNumbers[0];
    const maxFrame = frameNumbers[frameNumbers.length - 1];
    
    // If frames don't start from 1, we need to adjust the pattern
    if (minFrame !== 1) {
      logger.warn("Frames don't start from 1, adjusting input pattern", {
        minFrame,
        maxFrame,
        totalFrames: frameNumbers.length,
      });
      // Use start_number parameter to handle this
      // FFmpeg will use start_number to offset the frame sequence
    }
    
    const hasPng = frameFiles.some((f) => f.match(/^frame_\d+\.png$/i));
    if (!hasPng) {
      const hasJpg = frameFiles.some((f) => f.match(/^frame_\d+\.(jpg|jpeg)$/i));
      if (hasJpg) {
        inputPattern = path.join(sessionFolder, "frame_%06d.jpg");
        extension = "jpg";
      }
    }
    
    logger.debug("Frame pattern determined", {
      inputPattern,
      extension,
      minFrame,
      maxFrame,
      totalFrameFiles: frameFiles.length,
    });

    const outputFile = path.join(outputDir, `pilotstack_${Date.now()}.mp4`);

    // Get FFmpeg path
    const ffmpegPath = getFFmpegPath();
    if (!fs.existsSync(ffmpegPath)) {
      throw new VideoError(
        `FFmpeg binary not found at ${ffmpegPath}. Please reinstall the application.`
      );
    }

    // Make FFmpeg executable on Unix
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(ffmpegPath, 0o755);
      } catch {
        // Ignore chmod errors
      }
    }

    // Build simple FFmpeg command
    const args = [
      "-y", // Overwrite output
      "-framerate",
      String(finalFrameRate), // Input frame rate (creates timelapse speed)
      "-start_number",
      String(minFrame), // Use actual minimum frame number
      "-i",
      inputPattern,
    ];

    // Add music if provided
    if (musicPath) {
      args.push("-i", musicPath);
      args.push("-map", "0:v", "-map", "1:a");
    }

    // Add scale filter to ensure dimensions are even (required by H.264)
    // Use -2 to auto-calculate the other dimension while keeping aspect ratio
    // This prevents any stretching or deformation of the video
    // The scale filter will:
    // 1. Keep the width as detected from frames
    // 2. Calculate height to maintain aspect ratio
    // 3. Ensure both dimensions are even (divisible by 2)
    // 
    // Format: scale=width:height:force_original_aspect_ratio=decrease:flags=lanczos
    // The pad filter adds black bars if needed (not used here since we maintain AR)
    args.push(
      "-vf",
      `scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos`
    );

    // Video encoding - use software encoding for reliability
    const encodingArgs = getSoftwareEncodingArgs();
    args.push(...encodingArgs);

    // Output settings
    args.push(
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      String(frameRate) // Output frame rate (30fps)
    );

    // Audio settings if music provided
    if (musicPath) {
      args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
    }

    args.push(outputFile);

    logger.info("Starting FFmpeg", {
      path: ffmpegPath,
      args: args.join(" "),
    });

    // Run FFmpeg
    return new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(ffmpegPath, args);
      let stderr = "";

      ffmpegProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Parse progress
        const frameMatch = chunk.match(/frame=\s*(\d+)/);
        const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);

        if (timeMatch && frameMatch) {
          const currentFrame = parseInt(frameMatch[1]);
          const progress = Math.min((currentFrame / totalFrames) * 100, 99);
          
          options.onProgress?.({
            progress,
            time: timeMatch[1],
            currentFrame,
            totalFrames,
            speedMultiplier,
            message: `Processing frame ${currentFrame} of ${totalFrames}`,
          });
        }
      });

      ffmpegProcess.on("close", async (code) => {
        if (code === 0) {
          // Verify output file
          try {
            const stats = await fs.promises.stat(outputFile);
            if (stats.size < 100) {
              throw new VideoError("Output video file is too small");
            }

            logger.info("Video generation completed", {
              outputFile,
              size: stats.size,
            });

            // Cleanup session folder
            try {
              await fs.promises.rm(sessionFolder, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }

            resolve({
              success: true,
              outputFile,
              speedMultiplier,
              originalFrames: totalFrames,
              inputFormat: extension,
            });
          } catch (statError: any) {
            reject(
              new VideoError(
                `Failed to verify output video: ${statError.message}`
              )
            );
          }
        } else {
          // Log full stderr for debugging
          const fullStderr = stderr.length > 2000 ? stderr.substring(stderr.length - 2000) : stderr;
          
          logger.error("FFmpeg failed", {
            code,
            stderr: fullStderr,
            inputPattern,
            totalFrames,
            sessionFolder,
          });

          // Check for common errors
          let errorMessage = "Video generation failed";
          if (stderr.includes("No such file") || stderr.includes("No such file or directory")) {
            errorMessage = `Frame files not found. Expected pattern: ${inputPattern}. Check if frames exist in session folder.`;
          } else if (stderr.includes("Permission denied")) {
            errorMessage = "Permission denied: Cannot write output video file.";
          } else if (stderr.includes("Invalid data found")) {
            errorMessage = "Invalid frame data. Some frames may be corrupted.";
          } else if (stderr.includes("Invalid argument")) {
            errorMessage = `Invalid FFmpeg arguments. Input pattern: ${inputPattern}`;
          }

          reject(new VideoError(errorMessage));
        }
      });

      ffmpegProcess.on("error", (err: any) => {
        reject(
          new VideoError(
            `FFmpeg failed to start: ${err.message}`
          )
        );
      });
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Cleanup if needed
  }
}
