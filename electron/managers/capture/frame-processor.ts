/**
 * Frame Processor
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture Flow
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §2 - Frame Similarity Detection
 * 
 * Handles frame similarity detection and frame processing logic.
 * Maps to: handlers/capture.js frame processing section
 */

import * as crypto from "crypto";

/**
 * Frame processor for similarity detection and processing
 * 
 * Purpose: Skip duplicate frames to save storage
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §2 - Frame Similarity Detection
 */
export class FrameProcessor {
  private previousFrameHash: string | null = null;
  private enabled: boolean = true;

  /**
   * Enable or disable frame similarity detection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if frame similarity detection is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Calculate a fast hash for frame similarity detection
   * 
   * Samples the buffer at regular intervals for fast hashing.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §2 - Implementation
   */
  calculateFrameHash(buffer: Buffer): string {
    // Guard against tiny buffers
    if (buffer.length === 0) {
      return "";
    }

    // Sample the buffer at regular intervals for fast hashing
    const safeSampleSize = Math.max(
      1,
      Math.min(1000, Math.floor(buffer.length / 100) || buffer.length),
    );
    const step = Math.max(1, Math.floor(buffer.length / safeSampleSize));
    const sample = Buffer.allocUnsafe(safeSampleSize);

    for (let i = 0; i < safeSampleSize; i++) {
      const idx = Math.min(buffer.length - 1, i * step);
      sample[i] = buffer[idx];
    }

    return crypto.createHash("md5").update(sample).digest("hex");
  }

  /**
   * Check if frame is similar to previous frame
   * 
   * Calculates MD5 hash of frame buffer sample and compares with previous frame hash.
   * Skips frame if identical (within threshold).
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §2 - Implementation
   */
  isSimilarFrame(frameBuffer: Buffer): boolean {
    if (!this.enabled || !this.previousFrameHash) {
      // Update hash even if disabled, so we can enable later
      if (frameBuffer) {
        this.previousFrameHash = this.calculateFrameHash(frameBuffer);
      }
      return false;
    }

    const currentHash = this.calculateFrameHash(frameBuffer);
    const isSimilar = currentHash === this.previousFrameHash;
    this.previousFrameHash = currentHash;

    return isSimilar;
  }

  /**
   * Process frame and update hash
   * 
   * Checks similarity and updates internal state.
   */
  processFrame(frameBuffer: Buffer): { isSimilar: boolean; hash: string } {
    const isSimilar = this.isSimilarFrame(frameBuffer);
    const hash = this.previousFrameHash || this.calculateFrameHash(frameBuffer);
    return { isSimilar, hash };
  }

  /**
   * Reset frame processor state
   */
  reset(): void {
    this.previousFrameHash = null;
  }

  /**
   * Get current frame hash
   */
  getCurrentHash(): string | null {
    return this.previousFrameHash;
  }
}

