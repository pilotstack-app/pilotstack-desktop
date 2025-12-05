/**
 * Frame Processor Worker
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Project Structure §workers
 * 
 * Frame validation worker.
 * Maps to: workers/frame-processor.js
 * 
 * Handles CPU-intensive frame validation and processing in a separate thread
 * for maximum performance without blocking the main Electron process.
 * 
 * Updated to support both PNG and JPEG formats for improved capture performance.
 */

import { parentPort } from "worker_threads";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

// Disable sharp cache for lower memory usage in worker
sharp.cache(false);
// Enable SIMD for better performance
sharp.simd(true);

// Performance configuration - optimized for screen recording quality
const CONFIG = {
  JPEG_QUALITY: 95, // High quality for readable text/UI
  PNG_COMPRESSION: 2, // Lower = faster
  MIN_VALID_SIZE: 500,
  CONCURRENCY: 4, // Process 4 frames at a time
  // Supported formats for validation
  SUPPORTED_FORMATS: ["png", "jpg", "jpeg"],
};

interface FrameValidationResult {
  valid: boolean;
  reason?: string;
  width?: number;
  height?: number;
  size?: number;
  format?: string;
  filepath?: string;
}

interface FormatInfo {
  format: string;
  extension: string | null;
  pattern: RegExp | null;
}

interface ValidationResult {
  success: boolean;
  error?: string;
  validFrames?: number;
  totalFrames?: number;
  invalidCount?: number;
  dimensions?: { width: number; height: number } | null;
  format?: string;
  extension?: string;
}

/**
 * Validate and get metadata for a single frame
 */
async function validateFrame(filepath: string): Promise<FrameValidationResult> {
  try {
    const stats = await fs.promises.stat(filepath);

    if (stats.size < CONFIG.MIN_VALID_SIZE) {
      return { valid: false, reason: "too_small" };
    }

    // Use sharp to validate and get metadata (very fast)
    const metadata = await sharp(filepath).metadata();

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < 10 ||
      metadata.height < 10
    ) {
      return { valid: false, reason: "invalid_dimensions" };
    }

    return {
      valid: true,
      width: metadata.width,
      height: metadata.height,
      size: stats.size,
      format: metadata.format,
    };
  } catch (error) {
    return { valid: false, reason: (error as Error).message };
  }
}

/**
 * Process frames in batches for optimal performance
 */
async function processBatch(
  files: string[],
  batchSize: number = CONFIG.CONCURRENCY
): Promise<FrameValidationResult[]> {
  const results: FrameValidationResult[] = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(validateFrame));
    results.push(
      ...batchResults.map((r, idx) => ({ ...r, filepath: batch[idx] }))
    );

    // Report progress
    parentPort?.postMessage({
      type: "progress",
      processed: Math.min(i + batchSize, files.length),
      total: files.length,
    });
  }

  return results;
}

/**
 * Detect frame format from session folder
 */
async function detectFrameFormat(sessionFolder: string): Promise<FormatInfo> {
  const files = await fs.promises.readdir(sessionFolder);

  // Check for JPEG files first (new format)
  const jpgFiles = files.filter((f) => f.endsWith(".jpg"));
  if (jpgFiles.length > 0) {
    return { format: "jpeg", extension: "jpg", pattern: /^frame_\d{6}\.jpg$/ };
  }

  // Fall back to PNG (legacy format)
  const pngFiles = files.filter((f) => f.endsWith(".png"));
  if (pngFiles.length > 0) {
    return { format: "png", extension: "png", pattern: /^frame_\d{6}\.png$/ };
  }

  return { format: "unknown", extension: null, pattern: null };
}

/**
 * Validate all frames in a session folder (supports PNG and JPEG)
 */
async function validateAllFrames(sessionFolder: string): Promise<ValidationResult> {
  const formatInfo = await detectFrameFormat(sessionFolder);

  if (!formatInfo.pattern) {
    return {
      success: false,
      error: "No valid frames found",
      validFrames: 0,
      totalFrames: 0,
    };
  }

  const files = await fs.promises.readdir(sessionFolder);
  const frameFiles = files
    .filter((f) => formatInfo.pattern!.test(f))
    .sort()
    .map((f) => path.join(sessionFolder, f));

  if (frameFiles.length === 0) {
    return {
      success: false,
      error: "No frames found",
      validFrames: 0,
      totalFrames: 0,
    };
  }

  const results = await processBatch(frameFiles);
  const validFrames = results.filter((r) => r.valid);
  const invalidFrames = results.filter((r) => !r.valid);

  // Remove invalid frames
  for (const frame of invalidFrames) {
    if (frame.filepath) {
      try {
        await fs.promises.unlink(frame.filepath);
      } catch (e) {
        // Ignore deletion errors
      }
    }
  }

  // Renumber valid frames sequentially (keeping same format)
  for (let i = 0; i < validFrames.length; i++) {
    const frame = validFrames[i];
    if (!frame.filepath) continue;

    const newFilename = `frame_${String(i + 1).padStart(6, "0")}.${formatInfo.extension}`;
    const newFilepath = path.join(sessionFolder, newFilename);

    if (frame.filepath !== newFilepath) {
      await fs.promises.rename(frame.filepath, newFilepath);
      frame.filepath = newFilepath;
    }
  }

  // Get consistent dimensions from first valid frame
  const dimensions =
    validFrames.length > 0 && validFrames[0].width && validFrames[0].height
      ? { width: validFrames[0].width, height: validFrames[0].height }
      : null;

  return {
    success: true,
    validFrames: validFrames.length,
    totalFrames: frameFiles.length,
    invalidCount: invalidFrames.length,
    dimensions,
    format: formatInfo.format,
    extension: formatInfo.extension || undefined,
  };
}

/**
 * Optimize a single frame using sharp
 */
async function optimizeFrame(
  buffer: Buffer,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    format?: string;
  } = {}
): Promise<Buffer> {
  const { maxWidth, maxHeight, format = "png" } = options;

  let pipeline = sharp(buffer);

  // Get metadata first
  const metadata = await pipeline.metadata();

  // Resize if needed (maintaining aspect ratio)
  if (
    maxWidth &&
    maxHeight &&
    metadata.width &&
    metadata.height &&
    (metadata.width > maxWidth || metadata.height > maxHeight)
  ) {
    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Output based on format
  if (format === "jpeg" || format === "jpg") {
    return pipeline
      .jpeg({ quality: CONFIG.JPEG_QUALITY, mozjpeg: false })
      .toBuffer();
  }

  return pipeline
    .png({ compressionLevel: CONFIG.PNG_COMPRESSION, effort: 1 })
    .toBuffer();
}

/**
 * Normalize frames to PNG for FFmpeg (if needed)
 * Some FFmpeg configurations work better with PNG input
 */
async function normalizeFramesToPng(
  sessionFolder: string,
  forceConvert: boolean = false
): Promise<{ success: boolean; converted: number; total: number; format: string }> {
  const formatInfo = await detectFrameFormat(sessionFolder);

  // Already PNG, no conversion needed
  if (formatInfo.format === "png" && !forceConvert) {
    const files = await fs.promises.readdir(sessionFolder);
    return {
      success: true,
      converted: 0,
      total: files.filter((f) => f.endsWith(".png")).length,
      format: "png",
    };
  }

  const files = await fs.promises.readdir(sessionFolder);
  const jpgFiles = files.filter((f) => f.endsWith(".jpg")).sort();

  let converted = 0;
  const total = jpgFiles.length;

  // Convert JPEG to PNG in batches
  for (let i = 0; i < jpgFiles.length; i += CONFIG.CONCURRENCY) {
    const batch = jpgFiles.slice(i, i + CONFIG.CONCURRENCY);

    await Promise.all(
      batch.map(async (file) => {
        const jpgPath = path.join(sessionFolder, file);
        const pngPath = jpgPath.replace(".jpg", ".png");

        try {
          await sharp(jpgPath)
            .png({ compressionLevel: CONFIG.PNG_COMPRESSION, effort: 1 })
            .toFile(pngPath);

          await fs.promises.unlink(jpgPath);
          converted++;
        } catch (error) {
          console.error(`Failed to convert ${file}:`, (error as Error).message);
        }
      })
    );

    parentPort?.postMessage({
      type: "progress",
      processed: Math.min(i + CONFIG.CONCURRENCY, total),
      total,
      stage: "normalizing",
    });
  }

  return { success: true, converted, total, format: "png" };
}

/**
 * Optimize frames for faster FFmpeg processing
 */
async function optimizeFramesForEncoding(
  sessionFolder: string
): Promise<{ success: boolean; optimizedCount: number; format: string }> {
  const formatInfo = await detectFrameFormat(sessionFolder);

  const files = await fs.promises.readdir(sessionFolder);
  const frameFiles = files
    .filter((f) => f.endsWith(".png") || f.endsWith(".jpg"))
    .sort();

  let processed = 0;
  const total = frameFiles.length;

  // Process in batches
  for (let i = 0; i < frameFiles.length; i += CONFIG.CONCURRENCY) {
    const batch = frameFiles.slice(i, i + CONFIG.CONCURRENCY);

    await Promise.all(
      batch.map(async (file) => {
        const filepath = path.join(sessionFolder, file);
        const buffer = await fs.promises.readFile(filepath);
        const ext = path.extname(file).toLowerCase();

        let optimized: Buffer;
        if (ext === ".jpg" || ext === ".jpeg") {
          // Re-compress JPEG with high quality for video (better text readability)
          optimized = await sharp(buffer)
            .jpeg({
              quality: CONFIG.JPEG_QUALITY,
              mozjpeg: false,
              chromaSubsampling: "4:2:0",
            })
            .toBuffer();
        } else {
          // Optimize PNG with minimal compression
          optimized = await sharp(buffer)
            .png({ compressionLevel: 1, effort: 1 })
            .toBuffer();
        }

        await fs.promises.writeFile(filepath, optimized);
      })
    );

    processed += batch.length;
    parentPort?.postMessage({
      type: "progress",
      processed,
      total,
      stage: "optimizing",
    });
  }

  return { success: true, optimizedCount: total, format: formatInfo.format };
}

/**
 * Get frame statistics for a session
 */
async function getFrameStats(sessionFolder: string): Promise<{
  success: boolean;
  error?: string;
  frameCount?: number;
  format?: string;
  avgFrameSize?: number;
  estimatedTotalSize?: number;
  dimensions?: { width: number; height: number };
}> {
  const formatInfo = await detectFrameFormat(sessionFolder);

  if (!formatInfo.extension) {
    return { success: false, error: "No frames found" };
  }

  const files = await fs.promises.readdir(sessionFolder);
  const frameFiles = files
    .filter((f) => f.endsWith(`.${formatInfo.extension}`))
    .sort();

  if (frameFiles.length === 0) {
    return { success: false, error: "No frames found" };
  }

  // Sample a few frames for size statistics
  const sampleSize = Math.min(10, frameFiles.length);
  const sampleIndices: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    sampleIndices.push(Math.floor((i * frameFiles.length) / sampleSize));
  }

  let totalSize = 0;
  const sampleStats: number[] = [];

  for (const idx of sampleIndices) {
    const filepath = path.join(sessionFolder, frameFiles[idx]);
    const stats = await fs.promises.stat(filepath);
    totalSize += stats.size;
    sampleStats.push(stats.size);
  }

  const avgSize = totalSize / sampleSize;
  const estimatedTotalSize = avgSize * frameFiles.length;

  // Get dimensions from first frame
  const firstFramePath = path.join(sessionFolder, frameFiles[0]);
  const metadata = await sharp(firstFramePath).metadata();

  return {
    success: true,
    frameCount: frameFiles.length,
    format: formatInfo.format,
    avgFrameSize: Math.round(avgSize),
    estimatedTotalSize: Math.round(estimatedTotalSize),
    dimensions: metadata.width && metadata.height
      ? {
          width: metadata.width,
          height: metadata.height,
        }
      : undefined,
  };
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on("message", async (message: { type: string; data?: any }) => {
    const { type, data } = message;

    try {
      let result: any;

      switch (type) {
        case "validate":
          result = await validateAllFrames(data.sessionFolder);
          break;

        case "optimize":
          result = await optimizeFramesForEncoding(data.sessionFolder);
          break;

        case "normalize":
          result = await normalizeFramesToPng(
            data.sessionFolder,
            data.forceConvert
          );
          break;

        case "validateSingle":
          result = await validateFrame(data.filepath);
          break;

        case "optimizeBuffer":
          result = await optimizeFrame(data.buffer, data.options);
          break;

        case "detectFormat":
          result = await detectFrameFormat(data.sessionFolder);
          break;

        case "getStats":
          result = await getFrameStats(data.sessionFolder);
          break;

        default:
          result = { error: `Unknown message type: ${type}` };
      }

      parentPort?.postMessage({ type: "result", success: true, result });
    } catch (error) {
      parentPort?.postMessage({
        type: "result",
        success: false,
        error: (error as Error).message,
      });
    }
  });
}

// Signal ready
parentPort?.postMessage({ type: "ready" });

