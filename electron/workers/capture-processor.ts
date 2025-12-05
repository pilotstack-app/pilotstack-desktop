/**
 * Capture Processor Worker
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Performance Optimizations §1 - Worker Threads
 * 
 * Image compression worker using Sharp.
 * Maps to: workers/capture-processor.js
 * 
 * Handles CPU-intensive image compression in a separate thread
 * with aggressive optimizations for real-time capture.
 */

import { parentPort } from "worker_threads";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

// Initialize Sharp with maximum performance settings
try {
  // Disable cache for lower memory usage in worker
  sharp.cache(false);
  // Enable SIMD for faster processing
  sharp.simd(true);
  // Limited concurrency to avoid overwhelming
  sharp.concurrency(2);
} catch (e) {
  console.error("Sharp not available in worker:", (e as Error).message);
}

// Quality-optimized configuration for screen recording
// Screen content (text, UI elements) needs higher quality to remain readable
const CONFIG = {
  // JPEG quality levels - optimized for screen recording readability
  JPEG_QUALITY: {
    ultra_low: 50,
    low: 65,
    medium: 75,
    high: 85,
    max: 95,
  },
  // PNG compression levels (0-9, lower = faster)
  PNG_COMPRESSION: {
    ultra_low: 0,
    low: 1,
    medium: 2,
    high: 3,
    max: 4,
  },
  // Target file sizes in bytes (for adaptive quality)
  // Higher targets allow better quality captures
  TARGET_SIZES: {
    ultra_low: 80000, // 80KB
    low: 150000, // 150KB
    medium: 300000, // 300KB
    high: 500000, // 500KB
    max: 800000, // 800KB
  },
  // Minimum valid image size
  MIN_VALID_SIZE: 200,
  // Maximum concurrent operations
  MAX_CONCURRENT: 3,
};

type QualityPreset = "ultra_low" | "low" | "medium" | "high" | "max";

interface CompressionOptions {
  quality?: QualityPreset;
  jpegQuality?: number;
  targetSize?: number;
  scale?: number;
}

interface FrameData {
  buffer: Buffer;
  sessionFolder: string;
  frameNumber: number;
  format?: "jpeg" | "png";
  quality?: QualityPreset;
  jpegQuality?: number;
  targetSize?: number;
  scale?: number;
}

interface ProcessResult {
  success: boolean;
  filepath?: string;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: string;
  error?: string;
  frameNumber?: number;
  result?: Buffer;
}

/**
 * Ultra-fast JPEG compression with size targeting
 */
async function compressToJpeg(
  buffer: Buffer,
  options: CompressionOptions = {}
): Promise<Buffer> {
  const { quality = "medium", jpegQuality, targetSize, scale = 1.0 } = options;

  // Use explicit jpegQuality if provided, otherwise use preset
  let effectiveQuality =
    jpegQuality || CONFIG.JPEG_QUALITY[quality] || CONFIG.JPEG_QUALITY.medium;
  const maxTargetSize =
    targetSize || CONFIG.TARGET_SIZES[quality] || CONFIG.TARGET_SIZES.medium;

  try {
    let pipeline = sharp(buffer, {
      limitInputPixels: 100000000,
      sequentialRead: true,
      failOnError: false,
    });

    const metadata = await pipeline.metadata();

    // Apply scaling if needed
    if (scale < 1.0 && metadata.width && metadata.height) {
      const newWidth = Math.max(320, Math.round(metadata.width * scale));
      const newHeight = Math.max(180, Math.round(metadata.height * scale));
      pipeline = pipeline.resize(newWidth, newHeight, {
        fit: "fill",
        kernel: "nearest", // Fastest kernel
        fastShrinkOnLoad: true,
      });
    }

    // Ensure even dimensions for video encoding
    const targetWidth = Math.ceil((metadata.width! * scale) / 2) * 2;
    const targetHeight = Math.ceil((metadata.height! * scale) / 2) * 2;

    // First compression attempt
    let result = await pipeline
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .jpeg({
        quality: effectiveQuality,
        mozjpeg: false,
        chromaSubsampling: "4:2:0",
        trellisQuantisation: false,
        overshootDeringing: false,
        optimizeScans: false,
        force: true,
      })
      .toBuffer();

    // If result is too large, reduce quality
    let attempts = 0;
    while (
      result.length > maxTargetSize &&
      effectiveQuality > 25 &&
      attempts < 3
    ) {
      effectiveQuality -= 15;
      attempts++;

      result = await sharp(buffer, {
        sequentialRead: true,
        failOnError: false,
      })
        .resize(targetWidth, targetHeight, {
          fit: "fill",
          kernel: "nearest",
        })
        .jpeg({
          quality: effectiveQuality,
          mozjpeg: false,
          chromaSubsampling: "4:2:0",
          force: true,
        })
        .toBuffer();
    }

    return result;
  } catch (error) {
    console.error("JPEG compression failed:", (error as Error).message);
    return buffer;
  }
}

/**
 * Fast PNG compression
 */
async function compressToPng(
  buffer: Buffer,
  options: CompressionOptions = {}
): Promise<Buffer> {
  const { quality = "medium", scale = 1.0 } = options;
  const compressionLevel =
    CONFIG.PNG_COMPRESSION[quality] || CONFIG.PNG_COMPRESSION.medium;

  try {
    let pipeline = sharp(buffer, {
      limitInputPixels: 100000000,
      sequentialRead: true,
      failOnError: false,
    });

    const metadata = await pipeline.metadata();

    if (scale < 1.0 && metadata.width && metadata.height) {
      const newWidth = Math.max(320, Math.round(metadata.width * scale));
      const newHeight = Math.max(180, Math.round(metadata.height * scale));
      pipeline = pipeline.resize(newWidth, newHeight, {
        fit: "fill",
        kernel: "nearest",
      });
    }

    const targetWidth = Math.ceil((metadata.width! * scale) / 2) * 2;
    const targetHeight = Math.ceil((metadata.height! * scale) / 2) * 2;

    return await pipeline
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .png({
        compressionLevel,
        effort: 1,
        adaptiveFiltering: false,
        palette: false,
      })
      .toBuffer();
  } catch (error) {
    console.error("PNG compression failed:", (error as Error).message);
    return buffer;
  }
}

/**
 * Quick validation without full decode
 */
async function quickValidate(buffer: Buffer): Promise<{
  valid: boolean;
  reason?: string;
  width?: number;
  height?: number;
  size?: number;
  format?: string;
}> {
  if (!buffer || buffer.length < CONFIG.MIN_VALID_SIZE) {
    return { valid: false, reason: "too_small" };
  }

  try {
    const metadata = await sharp(buffer, {
      sequentialRead: true,
      failOnError: false,
    }).metadata();

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
      size: buffer.length,
      format: metadata.format,
    };
  } catch (error) {
    // Fallback validation
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);

    if (buffer.subarray(0, 8).equals(pngSignature)) {
      return { valid: true };
    }

    if (buffer.subarray(0, 3).equals(jpegSignature)) {
      return { valid: true };
    }

    return { valid: false, reason: (error as Error).message || "unknown_format" };
  }
}

/**
 * Process and save a single frame with aggressive compression
 */
async function processAndSaveFrame(frameData: FrameData): Promise<ProcessResult> {
  const {
    buffer,
    sessionFolder,
    frameNumber,
    format = "jpeg",
    quality = "medium",
    jpegQuality,
    targetSize,
    scale = 1.0,
  } = frameData;

  try {
    let compressedBuffer: Buffer;
    const extension = format === "jpeg" ? "jpg" : "png";

    if (format === "jpeg") {
      compressedBuffer = await compressToJpeg(buffer, {
        quality,
        jpegQuality,
        targetSize,
        scale,
      });
    } else {
      compressedBuffer = await compressToPng(buffer, { quality, scale });
    }

    const filename = `frame_${String(frameNumber).padStart(6, "0")}.${extension}`;
    const filepath = path.join(sessionFolder, filename);

    // Async write
    await fs.promises.writeFile(filepath, compressedBuffer);

    const compressionRatio = (buffer.length / compressedBuffer.length).toFixed(2);

    return {
      success: true,
      filepath,
      originalSize: buffer.length,
      compressedSize: compressedBuffer.length,
      compressionRatio,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      frameNumber,
    };
  }
}

/**
 * Process multiple frames in parallel batch
 */
async function processBatch(frames: FrameData[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  for (let i = 0; i < frames.length; i += CONFIG.MAX_CONCURRENT) {
    const batch = frames.slice(i, i + CONFIG.MAX_CONCURRENT);
    const batchResults = await Promise.all(batch.map(processAndSaveFrame));
    results.push(...batchResults);

    parentPort?.postMessage({
      type: "batch_progress",
      processed: Math.min(i + CONFIG.MAX_CONCURRENT, frames.length),
      total: frames.length,
    });
  }

  return results;
}

/**
 * Convert existing PNG frames to optimized JPEG
 */
async function convertPngsToJpeg(
  sessionFolder: string,
  quality: QualityPreset = "medium"
): Promise<{ converted: number; failed: number; total: number }> {
  const files = await fs.promises.readdir(sessionFolder);
  const pngFiles = files.filter((f) => f.endsWith(".png")).sort();

  let converted = 0;
  let failed = 0;
  const total = pngFiles.length;

  for (let i = 0; i < pngFiles.length; i += CONFIG.MAX_CONCURRENT) {
    const batch = pngFiles.slice(i, i + CONFIG.MAX_CONCURRENT);

    await Promise.all(
      batch.map(async (file) => {
        const pngPath = path.join(sessionFolder, file);
        const jpgPath = pngPath.replace(".png", ".jpg");

        try {
          const buffer = await fs.promises.readFile(pngPath);
          const jpegBuffer = await compressToJpeg(buffer, { quality });
          await fs.promises.writeFile(jpgPath, jpegBuffer);
          await fs.promises.unlink(pngPath);
          converted++;
        } catch (error) {
          console.error(`Failed to convert ${file}:`, (error as Error).message);
          failed++;
        }
      })
    );

    parentPort?.postMessage({
      type: "conversion_progress",
      converted,
      failed,
      total,
    });
  }

  return { converted, failed, total };
}

/**
 * Get optimal settings based on system load
 * Maintains reasonable quality even under pressure for readable output
 */
function getAdaptiveSettings(
  queueSize: number,
  maxQueueSize: number
): { quality: QualityPreset; scale: number; skipValidation: boolean } {
  const pressure = queueSize / maxQueueSize;

  if (pressure > 0.8) {
    // Critical pressure: still maintain readable quality
    return { quality: "low", scale: 0.65, skipValidation: true };
  } else if (pressure > 0.6) {
    return { quality: "medium", scale: 0.8, skipValidation: true };
  } else if (pressure > 0.4) {
    return { quality: "high", scale: 1.0, skipValidation: false };
  } else {
    // Low pressure: full quality
    return { quality: "high", scale: 1.0, skipValidation: false };
  }
}

// Message handler
if (parentPort) {
  parentPort.on("message", async (message: {
    type: string;
    data?: any;
    id?: string;
  }) => {
    const { type, data, id } = message;

    try {
      let result: any;

      switch (type) {
        case "compress":
          if (data.format === "jpeg") {
            result = await compressToJpeg(data.buffer, data.options);
          } else {
            result = await compressToPng(data.buffer, data.options);
          }
          parentPort?.postMessage({
            type: "result",
            id,
            success: true,
            result,
          });
          break;

        case "validate":
          result = await quickValidate(data.buffer);
          parentPort?.postMessage({ type: "result", id, success: true, result });
          break;

        case "processFrame":
          result = await processAndSaveFrame(data);
          parentPort?.postMessage({ type: "result", id, success: true, result });
          break;

        case "processBatch":
          result = await processBatch(data.frames);
          parentPort?.postMessage({ type: "result", id, success: true, result });
          break;

        case "convertToJpeg":
          result = await convertPngsToJpeg(data.sessionFolder, data.quality);
          parentPort?.postMessage({ type: "result", id, success: true, result });
          break;

        case "getAdaptiveSettings":
          result = getAdaptiveSettings(data.queueSize, data.maxQueueSize);
          parentPort?.postMessage({ type: "result", id, success: true, result });
          break;

        default:
          parentPort?.postMessage({
            type: "result",
            id,
            success: false,
            error: `Unknown message type: ${type}`,
          });
      }
    } catch (error) {
      parentPort?.postMessage({
        type: "result",
        id,
        success: false,
        error: (error as Error).message,
      });
    }
  });
}

// Signal ready
parentPort?.postMessage({ type: "ready" });

