/**
 * Screen Capture Operations
 *
 * Screenshot capture using Electron's desktopCapturer.
 * 
 * Note: desktopCapturer can sometimes return empty thumbnails due to:
 * - macOS screen recording permissions not granted
 * - The thumbnail not being ready yet (race condition)
 * - Display configuration changes
 * - The source being unavailable
 * 
 * This module implements robust retry logic with delays to handle these cases.
 */

import * as fs from "fs";
import * as path from "path";
import { desktopCapturer, screen } from "electron";
import { logger } from "../../utils/logger";

/**
 * Capture result interface
 */
export interface CaptureResult {
  buffer: Buffer;
  captureTime: number;
  width: number;
  height: number;
}

/**
 * Capture configuration
 */
export const CAPTURE_CONFIG = {
  MIN_VALID_IMAGE_SIZE: 50, // bytes - minimum valid PNG/JPEG size
  MAX_CONSECUTIVE_FAILURES: 10,
  MIN_CAPTURE_INTERVAL: 250, // ms
  MAX_CAPTURE_INTERVAL: 5000, // ms
  OUTPUT_FPS: 30,
  // Retry configuration for empty buffer handling
  RETRY_ATTEMPTS: 5,
  RETRY_DELAY_MS: 200,
  // Thumbnail generation timeout
  THUMBNAIL_TIMEOUT_MS: 3000,
};

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate appropriate thumbnail size for the display
 * Preserves aspect ratio and ensures even dimensions
 */
function calculateThumbnailSize(
  displayWidth: number,
  displayHeight: number,
  scaleFactor: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  // Calculate the actual pixel dimensions of the display
  const actualWidth = displayWidth * scaleFactor;
  const actualHeight = displayHeight * scaleFactor;
  const aspectRatio = actualWidth / actualHeight;
  
  let targetWidth = Math.min(actualWidth, maxWidth);
  let targetHeight = Math.min(actualHeight, maxHeight);
  
  // Maintain aspect ratio
  if (targetWidth / targetHeight > aspectRatio) {
    // Height is the limiting factor
    targetWidth = Math.round(targetHeight * aspectRatio);
  } else {
    // Width is the limiting factor
    targetHeight = Math.round(targetWidth / aspectRatio);
  }
  
  // Ensure even dimensions for video encoder compatibility (H.264 requires this)
  targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;
  
  // Ensure minimum dimensions
  targetWidth = Math.max(targetWidth, 640);
  targetHeight = Math.max(targetHeight, 360);
  
  return { width: targetWidth, height: targetHeight };
}

/**
 * Get descending target sizes for capture attempts
 * Starts with the largest sensible size and falls back to smaller ones
 */
function getTargetSizes(
  displayWidth: number,
  displayHeight: number,
  scaleFactor: number
): Array<{ width: number; height: number }> {
  // Target sizes in descending order (max width x max height)
  const maxSizes = [
    { maxW: 1920, maxH: 1080 }, // Full HD
    { maxW: 1600, maxH: 900 },  // Medium
    { maxW: 1280, maxH: 720 },  // HD
    { maxW: 960, maxH: 540 },   // Lower fallback
    { maxW: 640, maxH: 360 },   // Minimum fallback
  ];
  
  return maxSizes.map(({ maxW, maxH }) =>
    calculateThumbnailSize(displayWidth, displayHeight, scaleFactor, maxW, maxH)
  );
}

/**
 * Attempt a single capture with the given size
 */
async function attemptCapture(
  sourceId: string | null,
  size: { width: number; height: number }
): Promise<{ buffer: Buffer | null; source: Electron.DesktopCapturerSource | null }> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: size,
    fetchWindowIcons: false,
  });
  
  // Find the requested source, or fall back to first screen
  let source = sourceId ? sources.find((s) => s.id === sourceId) : null;
  
  if (!source) {
    // Fall back to first screen source, then any source
    source = sources.find((s) => s.id.startsWith("screen:")) || sources[0];
  }
  
  if (!source) {
    return { buffer: null, source: null };
  }
  
  // Get thumbnail - this can sometimes return empty NativeImage
  const thumbnail = source.thumbnail;
  if (!thumbnail || thumbnail.isEmpty()) {
    return { buffer: null, source };
  }
  
  const buffer = thumbnail.toPNG();
  return { buffer, source };
}

/**
 * Capture screen screenshot with robust retry logic.
 * 
 * Implements multiple strategies to handle common capture failures:
 * 1. Multiple thumbnail sizes (descending)
 * 2. Retry with delays between attempts
 * 3. Source refresh between retries
 * 
 * @param sourceId - The desktop capturer source ID (e.g., "screen:0:0")
 * @param isCapturing - Guard flag to prevent concurrent captures
 * @returns Capture result with buffer or error message
 */
export async function captureScreen(
  sourceId: string | null,
  isCapturing: boolean
): Promise<{ result: CaptureResult | null; captureError: string | null }> {
  if (isCapturing) {
    return { result: null, captureError: null };
  }

  const startTime = Date.now();

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: displayWidth, height: displayHeight } = primaryDisplay.workAreaSize;
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    // Get target sizes to try
    const targetSizes = getTargetSizes(displayWidth, displayHeight, scaleFactor);

    let imageBuffer: Buffer | null = null;
    let chosenSize: { width: number; height: number } | null = null;
    let lastError: string | null = null;
    let totalAttempts = 0;

    // Outer loop: try different sizes (labeled for early exit when no source)
    sizeLoop: for (const size of targetSizes) {
      // Inner loop: retry with delays for each size
      for (let retry = 0; retry < CAPTURE_CONFIG.RETRY_ATTEMPTS; retry++) {
        totalAttempts++;
        
        try {
          const { buffer, source } = await attemptCapture(sourceId, size);
          
          if (!source) {
            lastError = "No capture source available";
            // No source found - this is not a transient condition that retries or
            // different thumbnail sizes will resolve, so exit both loops immediately
            break sizeLoop;
          }
          
          if (buffer && buffer.length >= CAPTURE_CONFIG.MIN_VALID_IMAGE_SIZE) {
            // Success!
            imageBuffer = buffer;
            chosenSize = size;
            break;
          }
          
          // Buffer was empty or too small, retry after delay
          if (retry < CAPTURE_CONFIG.RETRY_ATTEMPTS - 1) {
            await sleep(CAPTURE_CONFIG.RETRY_DELAY_MS * (retry + 1)); // Increasing delay
          }
        } catch (attemptError) {
          lastError = (attemptError as Error).message;
          // Continue to next retry
          if (retry < CAPTURE_CONFIG.RETRY_ATTEMPTS - 1) {
            await sleep(CAPTURE_CONFIG.RETRY_DELAY_MS);
          }
        }
      }
      
      // If we got a valid buffer, stop trying sizes
      if (imageBuffer && imageBuffer.length >= CAPTURE_CONFIG.MIN_VALID_IMAGE_SIZE) {
        break;
      }
    }

    // Check if we got a valid capture
    if (!imageBuffer || imageBuffer.length < CAPTURE_CONFIG.MIN_VALID_IMAGE_SIZE) {
      const errorDetails = {
        error: "Invalid capture: buffer too small or empty",
        sourceId,
        totalAttempts,
        sizesAttempted: targetSizes.length,
        bufferLength: imageBuffer?.length ?? 0,
        display: { 
          width: displayWidth, 
          height: displayHeight, 
          scaleFactor,
          actualPixels: `${displayWidth * scaleFactor}x${displayHeight * scaleFactor}`
        },
        lastError,
        hint: "Check screen recording permissions in System Preferences > Privacy & Security > Screen Recording"
      };
      
      logger.error("Capture error", errorDetails);
      
      return {
        result: null,
        captureError: `Invalid capture: buffer too small. ${lastError || "Check screen recording permissions."}`,
      };
    }

    const captureTime = Date.now() - startTime;
    const finalSize = chosenSize ?? targetSizes[0];

    // Log successful capture for debugging
    if (totalAttempts > 1) {
      logger.debug("Capture succeeded after retries", {
        totalAttempts,
        captureTime,
        size: finalSize,
        bufferSize: imageBuffer.length,
      });
    }

    return {
      result: {
        buffer: imageBuffer,
        captureTime,
        width: finalSize.width,
        height: finalSize.height,
      },
      captureError: null,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    logger.error("Capture exception", { 
      error: errorMessage,
      sourceId,
      stack: (error as Error).stack,
    });
    return { result: null, captureError: errorMessage };
  }
}

/**
 * Save frame to disk as PNG
 */
export async function saveFrame(
  buffer: Buffer,
  frameNumber: number,
  sessionFolder: string
): Promise<void> {
  const filepath = path.join(
    sessionFolder,
    `frame_${String(frameNumber).padStart(6, "0")}.png`
  );

  await fs.promises.writeFile(filepath, buffer);
}
