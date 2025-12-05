/**
 * Progress Tracker
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §2 - Code Duplication
 * 
 * Shared utility for progress tracking (extracts duplicated code).
 */

import { EventEmitter } from "events";

/**
 * Progress tracker
 */
export class ProgressTracker extends EventEmitter {
  private progress: number = 0;

  /**
   * Update progress (0-100)
   */
  update(progress: number): void {
    this.progress = Math.max(0, Math.min(100, progress));
    this.emit("progress", this.progress);
  }

  /**
   * Get current progress
   */
  getProgress(): number {
    return this.progress;
  }

  /**
   * Reset progress
   */
  reset(): void {
    this.progress = 0;
    this.emit("progress", 0);
  }
}

