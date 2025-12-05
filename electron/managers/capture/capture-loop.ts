/**
 * Capture Loop
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture Flow
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Data Flow §Recording Flow
 * 
 * Handles the main capture loop timing and iteration.
 * Maps to: handlers/capture.js capture loop section
 */

/**
 * Capture loop callback function type
 */
export type CaptureLoopCallback = () => Promise<void>;

/**
 * Capture loop manager
 * 
 * Manages the timing and execution of the capture loop.
 * The actual capture logic is handled by the callback function.
 */
export class CaptureLoop {
  private captureInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private baseInterval: number = 1000;
  private dynamicInterval: number = 1000;
  private callback: CaptureLoopCallback | null = null;

  /**
   * Start capture loop
   * 
   * Runs the callback at the configured interval with smart scheduling
   * that accounts for capture time to maintain consistent frame rate.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture Flow
   * Maps to: handlers/capture.js capture loop implementation
   */
  start(interval: number, callback: CaptureLoopCallback): void {
    if (this.isActive) {
      this.stop();
    }

    this.baseInterval = interval;
    this.dynamicInterval = interval;
    this.callback = callback;
    this.isActive = true;

    // Start the loop with a small initial delay
    this.captureInterval = setTimeout(() => this.runLoop(), 100);
  }

  /**
   * Run capture loop iteration
   * 
   * Executes the callback and schedules the next iteration,
   * accounting for capture time to maintain consistent frame rate.
   */
  private async runLoop(): Promise<void> {
    if (!this.isActive || !this.callback) {
      return;
    }

    const loopStart = Date.now();

    try {
      await this.callback();
    } catch (_error) {
      // Errors are handled by the callback
    }

    // Schedule next capture - use longer delay if having issues
    const elapsed = Date.now() - loopStart;
    const nextDelay = Math.max(100, this.dynamicInterval - elapsed);

    if (this.isActive) {
      this.captureInterval = setTimeout(() => this.runLoop(), nextDelay);
    }
  }

  /**
   * Stop capture loop
   */
  stop(): void {
    this.isActive = false;
    if (this.captureInterval) {
      clearTimeout(this.captureInterval);
      this.captureInterval = null;
    }
    this.callback = null;
  }

  /**
   * Update dynamic interval (for adaptive interval adjustment)
   */
  setDynamicInterval(interval: number): void {
    this.dynamicInterval = interval;
  }

  /**
   * Get current dynamic interval
   */
  getDynamicInterval(): number {
    return this.dynamicInterval;
  }

  /**
   * Get base interval
   */
  getBaseInterval(): number {
    return this.baseInterval;
  }

  /**
   * Check if loop is active
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Reset interval to base
   */
  resetInterval(): void {
    this.dynamicInterval = this.baseInterval;
  }
}

