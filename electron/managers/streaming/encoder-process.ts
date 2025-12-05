/**
 * Encoder Process Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Encoding Flow
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Error Handling
 * 
 * Manages FFmpeg process for streaming encoder.
 * Maps to: utils/streaming-encoder.js process management section (lines 88-431)
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import { getFFmpegPath } from "../../utils/ffmpeg";
import { store } from "../../config/store";
import { logger } from "../../utils/logger";
import { VideoError } from "../../core/app-error";
import { StderrHandler } from "./stderr-handler";
import { waitForDrain } from "./drain-handler";
import { endStdin as endStdinHelper, closeProcess, killProcess } from "./process-lifecycle";
import { buildHLSEncoderArgs } from "./ffmpeg-args-builder";

/**
 * Encoder process options
 */
export interface EncoderProcessOptions {
  outputDir: string;
  frameRate: number;
  segmentDuration: number;
  width: number;
  height: number;
}

/**
 * Encoder process manager
 * 
 * Manages FFmpeg process lifecycle, error handling, and hardware fallback.
 */
export class EncoderProcess {
  private process: ChildProcess | null = null;
  private useHardwareEncoding: boolean = true;
  private fallbackToSoftware: boolean = false;
  private stderrHandler: StderrHandler;
  private onError?: (error: Error) => void;
  private readyTimeoutMs = 5000;

  constructor() {
    this.stderrHandler = new StderrHandler();
    this.stderrHandler.setOnEncoderInitError(() => {
      if (this.onError) {
        this.onError(
          new VideoError(
            "Hardware encoder failed, fallback to software required"
          )
        );
      }
    });
  }

  /**
   * Spawn FFmpeg process for HLS encoding
   * 
   * Spawns FFmpeg with HLS muxer and image2pipe input.
   * Handles hardware encoder initialization errors with software fallback.
   */
  async spawn(options: EncoderProcessOptions): Promise<ChildProcess> {
    if (this.process && !this.process.killed) {
      throw new VideoError("Encoder process already running");
    }

    // Ensure output directory exists
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    const ffmpegPath = getFFmpegPath();

    if (!fs.existsSync(ffmpegPath)) {
      throw new VideoError(`FFmpeg binary not found at ${ffmpegPath}`);
    }

    // Get encoder args - will use hardware if available and enabled
    this.useHardwareEncoding = store.get("useHardwareAcceleration") !== false;

    // Build FFmpeg arguments for HLS streaming output
    const args = buildHLSEncoderArgs(options);

    logger.info("Starting FFmpeg streaming encoder", {
      ffmpegPath,
      args: args.join(" "),
    });

    return new Promise((resolve, reject) => {
      this.process = spawn(ffmpegPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      this.stderrHandler.reset();
      this.stderrHandler.setUseHardwareEncoding(this.useHardwareEncoding);

      if (this.process.stderr) {
        this.process.stderr.on("data", (data) => {
          const chunk = data.toString();
          stderr += chunk;
          this.stderrHandler.processChunk(chunk, stderr);
        });
      }

      this.process.on("error", (err) => {
        logger.error("FFmpeg process error", {
          error: err.message,
        });

        if (this.onError) {
          this.onError(err);
        }

        if (!this.process) {
          reject(err);
        }
      });

      // Increase max listeners to prevent warnings
      if (this.process.stdin) {
        this.process.stdin.setMaxListeners(20);

        // Handle stdin errors (EPIPE, etc.)
        this.process.stdin.on("error", (err: any) => {
          // EPIPE is expected when FFmpeg closes stdin
          if (err.code === "EPIPE") {
            logger.debug("FFmpeg stdin closed (EPIPE)");
          } else {
            logger.error("FFmpeg stdin error", {
              error: err.message,
              code: err.code,
            });
            if (this.onError) {
              this.onError(err);
            }
          }
        });
      }

      // Wait for FFmpeg to be ready (stdin writable)
      if (this.process.stdin) {
        this.process.stdin.once("drain", () => {
          logger.debug("FFmpeg stdin ready for writing");
        });
        
        // Check if stdin is immediately writable
        if (this.process.stdin.writable) {
          logger.debug("FFmpeg stdin is writable immediately");
        } else {
          logger.debug("FFmpeg stdin not immediately writable, will wait for drain");
        }
      }

      this.process.on("close", (code) => {
        logger.info("FFmpeg process closed", {
          code,
          segmentCount: this.stderrHandler.getCurrentSegmentIndex() + 1,
        });

        if (code !== 0) {
          const errorStderr = stderr.trim();
          const recentStderr = this.stderrHandler.getRecentStderr();

          logger.error("FFmpeg process failed unexpectedly", {
            code,
            useHardwareEncoding: this.useHardwareEncoding,
            fallbackToSoftware: this.fallbackToSoftware,
            stderr:
              errorStderr.length > 0
                ? errorStderr.slice(-2000)
                : "(no stderr output)",
            recentStderr:
              recentStderr.length > 0
                ? recentStderr.slice(-1000)
                : "(no recent stderr)",
          });
        }
      });

      // Wait for FFmpeg to be ready - check stdin is writable with timeout
      const onReady = () => {
        if (this.process && !this.process.killed && this.process.stdin?.writable) {
          clearTimeout(timeoutId);
          logger.debug("FFmpeg stdin is ready for writing");
          resolve(this.process);
        } else if (this.process && !this.process.killed) {
          setTimeout(onReady, 100);
        } else {
          clearTimeout(timeoutId);
          reject(new VideoError("FFmpeg process failed to start"));
        }
      };

      const timeoutId = setTimeout(() => {
        logger.error("FFmpeg process did not become ready in time, killing");
        this.kill();
        reject(new VideoError("FFmpeg process readiness timeout"));
      }, this.readyTimeoutMs);

      // Initial delay to let FFmpeg start
      setTimeout(onReady, 300);
    });
  }

  /**
   * Write frame to process stdin
   * 
   * @returns true if frame was written immediately, false if buffer is full (backpressure)
   */
  writeFrame(frameBuffer: Buffer): boolean {
    if (!this.process) {
      logger.debug("Cannot write frame - process is null");
      return false;
    }
    
    if (this.process.killed) {
      logger.debug("Cannot write frame - process is killed");
      return false;
    }
    
    if (!this.process.stdin?.writable) {
      logger.debug("Cannot write frame - stdin is not writable", {
        destroyed: this.process.stdin?.destroyed,
        writable: this.process.stdin?.writable,
      });
      return false;
    }

    try {
      const result = this.process.stdin.write(frameBuffer);
      // write() returns false if the buffer is full (backpressure)
      // In this case, the data is still buffered, but we need to wait for drain
      // We return false to indicate backpressure, but the frame IS in the buffer
      if (result === false) {
        logger.debug("FFmpeg stdin backpressure - frame buffered, waiting for drain");
      }
      // Return true if written immediately, false if backpressure (but still buffered)
      return result !== false;
    } catch (error: any) {
      if (error.code === "EPIPE") {
        logger.debug("EPIPE error writing to FFmpeg stdin - process may have closed");
        return false;
      }
      logger.error("Error writing frame to FFmpeg", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Wait for stdin drain (buffer to empty)
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns Promise that resolves when drain occurs or rejects on timeout
   */
  async waitForDrain(timeoutMs: number = 2000): Promise<void> {
    if (!this.process) {
      throw new VideoError("Process not available for drain wait");
    }
    return waitForDrain(this.process, timeoutMs);
  }


  /**
   * End stdin stream (signal end of input)
   */
  endStdin(): void {
    endStdinHelper(this.process);
  }

  /**
   * Gracefully stop the process with a timeout, then force kill.
   */
  async shutdown(): Promise<void> {
    if (!this.process) {
      return;
    }
    try {
      endStdinHelper(this.process);
      await waitForDrain(this.process, 1000).catch(() => {});
    } catch {
      // ignore
    } finally {
      await closeProcess(this.process);
      this.process = null;
    }
  }

  /**
   * Close process gracefully
   */
  async close(): Promise<void> {
    await closeProcess(this.process);
    this.process = null;
  }

  /**
   * Kill process forcefully
   */
  kill(): void {
    killProcess(this.process);
    this.process = null;
  }

  /**
   * Get current segment index
   */
  getCurrentSegmentIndex(): number {
    return this.stderrHandler.getCurrentSegmentIndex();
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return !!this.process && !this.process.killed;
  }

  /**
   * Set callback for segment creation
   */
  setOnSegmentCreated(callback: (segmentIndex: number) => void): void {
    this.onSegmentCreated = callback;
    this.stderrHandler.setOnSegmentCreated((segmentIndex) => {
      if (this.onSegmentCreated) {
        this.onSegmentCreated(segmentIndex);
      }
    });
  }

  private onSegmentCreated?: (segmentIndex: number) => void;

  /**
   * Set callback for errors
   */
  setOnError(callback: (error: Error) => void): void {
    this.onError = callback;
  }

  /**
   * Mark that fallback to software encoding is in progress
   */
  markFallbackToSoftware(): void {
    this.fallbackToSoftware = true;
    this.useHardwareEncoding = false;
    this.stderrHandler.markFallbackToSoftware();
  }

  /**
   * Check if hardware encoding is being used
   */
  isUsingHardwareEncoding(): boolean {
    return this.useHardwareEncoding;
  }
}
