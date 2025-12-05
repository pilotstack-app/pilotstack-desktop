/**
 * FFmpeg Stderr Handler
 * 
 * Handles parsing and error detection from FFmpeg stderr output.
 * Extracted from encoder-process.ts to keep file sizes under 300 lines.
 */

import { logger } from "../../utils/logger";

/**
 * Stderr handler for FFmpeg process
 */
export class StderrHandler {
  private stderrBuffer: string[] = [];
  private currentSegmentIndex: number = 0;
  private onSegmentCreated?: (segmentIndex: number) => void;
  private onEncoderInitError?: () => void;
  private useHardwareEncoding: boolean = true;
  private fallbackToSoftware: boolean = false;

  /**
   * Process stderr chunk
   */
  processChunk(chunk: string, _fullStderr: string): void {
    // Keep last 20 chunks for error reporting
    this.stderrBuffer.push(chunk);
    if (this.stderrBuffer.length > 20) {
      this.stderrBuffer.shift();
    }

    // Check for encoder initialization errors that require fallback
    const encoderInitErrors = [
      "cannot prepare encoder",
      "Error initializing output stream",
      "Error while opening encoder",
      "h264_videotoolbox",
      "h264_nvenc",
      "h264_vaapi",
    ];

    const isEncoderInitError = encoderInitErrors.some(
      (indicator) =>
        chunk.includes(indicator) &&
        (chunk.includes("Error") ||
          chunk.includes("error") ||
          chunk.includes("failed"))
    );

    if (
      isEncoderInitError &&
      this.useHardwareEncoding &&
      !this.fallbackToSoftware
    ) {
      logger.error(
        "Hardware encoder initialization failed, attempting software fallback",
        {
          chunk: chunk.trim().slice(0, 500),
        }
      );

      if (this.onEncoderInitError) {
        this.onEncoderInitError();
      }
      return; // Don't process this chunk further
    }

    // Check for other errors in stderr and log immediately
    const errorIndicators = [
      "Error",
      "error",
      "failed",
      "Failed",
      "Invalid",
      "invalid",
      "Cannot",
      "cannot",
      "Permission denied",
      "No such file",
    ];

    const hasError = errorIndicators.some((indicator) =>
      chunk.includes(indicator)
    );
    if (hasError && !chunk.includes("frame=") && !isEncoderInitError) {
      // This looks like an error, log it
      logger.error("FFmpeg stderr error detected", {
        chunk: chunk.trim().slice(0, 500),
      });
    }

    // Check for segment creation
    const segmentMatch = chunk.match(/Opening '.*seg_(\d+)\.ts'/);
    if (segmentMatch) {
      this.currentSegmentIndex = parseInt(segmentMatch[1], 10);
      if (this.onSegmentCreated) {
        this.onSegmentCreated(this.currentSegmentIndex);
      }
      logger.debug("New segment created", {
        segmentIndex: this.currentSegmentIndex,
      });
    }
  }

  /**
   * Get current segment index
   */
  getCurrentSegmentIndex(): number {
    return this.currentSegmentIndex;
  }

  /**
   * Get recent stderr buffer
   */
  getRecentStderr(): string {
    return this.stderrBuffer.join("").trim();
  }

  /**
   * Set callback for segment creation
   */
  setOnSegmentCreated(callback: (segmentIndex: number) => void): void {
    this.onSegmentCreated = callback;
  }

  /**
   * Set callback for encoder init errors
   */
  setOnEncoderInitError(callback: () => void): void {
    this.onEncoderInitError = callback;
  }

  /**
   * Set hardware encoding flag
   */
  setUseHardwareEncoding(use: boolean): void {
    this.useHardwareEncoding = use;
  }

  /**
   * Mark fallback to software
   */
  markFallbackToSoftware(): void {
    this.fallbackToSoftware = true;
    this.useHardwareEncoding = false;
  }

  /**
   * Reset handler
   */
  reset(): void {
    this.stderrBuffer = [];
    this.currentSegmentIndex = 0;
  }
}

