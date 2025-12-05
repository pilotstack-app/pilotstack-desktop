/**
 * Frame Buffer Processor
 * 
 * Handles frame buffering and processing for streaming encoder.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { logger } from "../../utils/logger";
import { EncoderProcess } from "./encoder-process";
import { ActivityTracker } from "./activity-tracker";

/**
 * Frame buffer entry
 */
export interface FrameBufferEntry {
  buffer: Buffer;
  activityData: {
    isIdle?: boolean;
    keystrokesDelta?: number;
    hadPaste?: boolean;
  };
  timestamp: number;
}

/**
 * Frame buffer processor
 */
export class FrameBufferProcessor {
  private frameBuffer: FrameBufferEntry[] = [];
  private isWriting: boolean = false;
  private readonly maxBufferSize: number;
  private droppedFrameCount: number = 0;
  private frameCount: number = 0;
  private startTime: number | null = null;
  private readonly dropWatermark: number;
  private readonly warnWatermark: number;

  constructor(maxBufferSize: number) {
    this.maxBufferSize = maxBufferSize;
    // Warn at 80%, drop at 120% to avoid unbounded growth
    this.warnWatermark = Math.floor(this.maxBufferSize * 0.8);
    this.dropWatermark = Math.floor(this.maxBufferSize * 1.2);
  }

  /**
   * Set start time for diagnostics
   */
  setStartTime(startTime: number): void {
    this.startTime = startTime;
  }

  /**
   * Add frame to buffer
   */
  addFrame(
    pngBuffer: Buffer,
    activityData: {
      isIdle?: boolean;
      keystrokesDelta?: number;
      hadPaste?: boolean;
    } = {}
  ): boolean {
    if (this.frameBuffer.length >= this.dropWatermark) {
      this.droppedFrameCount++;
      if (this.droppedFrameCount <= 3 || this.droppedFrameCount % 50 === 0) {
        logger.warn("Frame dropped due to buffer overflow", {
          bufferSize: this.frameBuffer.length,
          maxBufferSize: this.maxBufferSize,
          droppedFrameCount: this.droppedFrameCount,
        });
      }
      return false;
    }

    if (this.frameBuffer.length >= this.warnWatermark && this.frameCount % 60 === 0) {
      logger.info("Frame buffer nearing capacity", {
        bufferSize: this.frameBuffer.length,
        maxBufferSize: this.maxBufferSize,
      });
    }

    // Add frame to buffer
    this.frameBuffer.push({
      buffer: pngBuffer,
      activityData,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Process buffered frames
   */
  async processBuffer(
    encoderProcess: EncoderProcess,
    activityTracker: ActivityTracker | null,
    isFinalized: boolean
  ): Promise<number> {
    if (this.isWriting) {
      // Another processBuffer call is already running, skip
      return this.frameCount;
    }

    if (this.frameBuffer.length === 0) {
      return this.frameCount;
    }

    this.isWriting = true;
    let processedCount = 0;

    try {
      while (
        this.frameBuffer.length > 0 &&
        encoderProcess.isRunning() &&
        !isFinalized
      ) {
        const frame = this.frameBuffer.shift();
        if (!frame) break;

        // Write frame to FFmpeg stdin
        const written = encoderProcess.writeFrame(frame.buffer);
        
        // Log first few write attempts for debugging
        if (this.frameCount === 0 && processedCount < 5) {
          logger.debug("Attempting to write frame", {
            attempt: processedCount + 1,
            written,
            bufferSize: frame.buffer.length,
            isRunning: encoderProcess.isRunning(),
            frameBufferLength: this.frameBuffer.length,
          });
        }

        if (!written) {
          // Check if process is still running
          if (isFinalized || !encoderProcess.isRunning()) {
            // Re-buffer the frame if we can't write and process is dead
            logger.debug("Cannot write frame - process not running", {
              isFinalized,
              isRunning: encoderProcess.isRunning(),
              frameCount: this.frameCount,
              bufferSize: this.frameBuffer.length,
            });
            this.frameBuffer.unshift(frame);
            break;
          }

          // Backpressure - the frame was buffered by Node.js, but we need to wait for drain
          // Don't re-buffer the frame, it's already in Node's internal buffer
          // Just wait for drain and continue with next frame
          try {
            await encoderProcess.waitForDrain(2000);
            // After drain, the frame was successfully written, so count it
            this.frameCount++;
            processedCount++;
            
            if (this.frameCount <= 3) {
              logger.debug("Frame written after drain", {
                frameCount: this.frameCount,
              });
            }
          } catch (error: any) {
            logger.debug("Drain wait interrupted", {
              error: error.message,
              frameCount: this.frameCount,
              bufferSize: this.frameBuffer.length,
            });
            if (!encoderProcess.isRunning()) {
              // Process died, re-buffer the frame
              this.frameBuffer.unshift(frame);
              break;
            }
            // If drain failed but process is still running, the frame might still be buffered
            // Count it anyway to avoid losing frames
            this.frameCount++;
            processedCount++;
          }
          continue;
        }

        // Frame written successfully (immediately, no backpressure)
        this.frameCount++;
        processedCount++;
        
        // Log first few frames for debugging
        if (this.frameCount <= 3) {
          logger.debug("Frame written successfully", {
            frameCount: this.frameCount,
            bufferSize: this.frameBuffer.length,
          });
        }

        // Record activity marker
        if (activityTracker) {
          activityTracker.addMarker(
            this.frameCount,
            frame.timestamp,
            frame.activityData,
            encoderProcess.getCurrentSegmentIndex()
          );
        }

        // Log diagnostics periodically for long recordings (every 1000 frames)
        if (this.frameCount > 0 && this.frameCount % 1000 === 0) {
          const elapsedMinutes = this.startTime
            ? (Date.now() - this.startTime) / 60000
            : 0;
          logger.info("Streaming encoder progress", {
            frameCount: this.frameCount,
            segmentCount: encoderProcess.getCurrentSegmentIndex() + 1,
            bufferSize: this.frameBuffer.length,
            droppedFrames: this.droppedFrameCount,
            elapsedMinutes: elapsedMinutes.toFixed(1),
          });
        }
      }
    } catch (error: any) {
      logger.error("Error processing frame buffer", {
        error: error.message,
        frameCount: this.frameCount,
      });
    } finally {
      this.isWriting = false;
    }

    return this.frameCount;
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.frameBuffer.length;
  }

  /**
   * Get frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Get dropped frame count
   */
  getDroppedFrameCount(): number {
    return this.droppedFrameCount;
  }

  /**
   * Reset buffer state (for fresh sessions)
   */
  reset(): void {
    this.frameBuffer = [];
    this.isWriting = false;
    this.droppedFrameCount = 0;
    this.frameCount = 0;
    this.startTime = null;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.frameBuffer = [];
  }

  /**
   * Get last frame time
   */
  getLastFrameTime(): number | null {
    if (this.frameBuffer.length === 0) {
      return null;
    }
    return this.frameBuffer[this.frameBuffer.length - 1].timestamp;
  }
}

