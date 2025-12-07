/**
 * FFmpeg Pipeline
 *
 * Manages the native FFmpeg process for screen capture.
 * Outputs HLS stream for the main recording and periodic snapshots for verification.
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture System
 */

import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import { getFFmpegPath } from "../../utils/ffmpeg/path-resolver";
import {
  buildInputArgs,
  buildHLSOutputArgs,
  getRecommendedFrameRate,
  isNativeCaptureSupported,
} from "./platform-utils";

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  outputDir: string;
  displayIndex?: number;
  frameRate?: number;
  segmentDuration?: number;
  snapshotInterval?: number;
  useHardwareCodec?: boolean;
  maxRestarts?: number;
}

/**
 * Pipeline state
 */
export interface PipelineState {
  isRunning: boolean;
  startTime: number | null;
  segmentCount: number;
  snapshotCount: number;
  lastSegmentTime: number | null;
  lastSnapshotTime: number | null;
  restartCount: number;
  error: string | null;
}

/**
 * Pipeline events
 */
export interface PipelineEvents {
  started: () => void;
  stopped: (state: PipelineState) => void;
  error: (error: Error) => void;
  segment: (segmentPath: string, index: number) => void;
  snapshot: (snapshotPath: string, index: number) => void;
  progress: (duration: number, frameCount: number) => void;
}

/**
 * FFmpeg Pipeline
 *
 * Manages FFmpeg process for native screen capture with automatic restart.
 */
export class FFmpegPipeline extends EventEmitter {
  private config: Required<PipelineConfig>;
  private ffmpegProcess: ChildProcess | null = null;
  private state: PipelineState;
  private watchInterval: NodeJS.Timeout | null = null;
  private progressInterval: NodeJS.Timeout | null = null;
  private lastSegmentIndex: number = 0;

  constructor(config: PipelineConfig) {
    super();

    // Apply defaults
    this.config = {
      outputDir: config.outputDir,
      displayIndex: config.displayIndex ?? 0,
      frameRate: config.frameRate ?? getRecommendedFrameRate(),
      segmentDuration: config.segmentDuration ?? 6,
      snapshotInterval: config.snapshotInterval ?? 5,
      useHardwareCodec: config.useHardwareCodec ?? false,
      maxRestarts: config.maxRestarts ?? 3,
    };

    // Initialize state
    this.state = {
      isRunning: false,
      startTime: null,
      segmentCount: 0,
      snapshotCount: 0,
      lastSegmentTime: null,
      lastSnapshotTime: null,
      restartCount: 0,
      error: null,
    };
  }

  /**
   * Start the capture pipeline
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      throw new Error("Pipeline is already running");
    }

    if (!isNativeCaptureSupported()) {
      throw new Error(`Native capture not supported on ${process.platform}`);
    }

    // Ensure output directory exists
    await this.ensureDirectories();

    // Start FFmpeg process
    await this.spawnFFmpeg();

    // Start file watchers
    this.startWatchers();

    // Start progress reporting
    this.startProgressReporting();

    this.state.isRunning = true;
    this.state.startTime = Date.now();
    this.state.error = null;

    logger.info("FFmpegPipeline started", {
      outputDir: this.config.outputDir,
      frameRate: this.config.frameRate,
    });

    this.emit("started");
  }

  /**
   * Stop the capture pipeline
   */
  async stop(): Promise<PipelineState> {
    if (!this.state.isRunning) {
      return this.state;
    }

    this.state.isRunning = false;

    // Stop watchers
    this.stopWatchers();

    // Stop progress reporting
    this.stopProgressReporting();

    // Gracefully stop FFmpeg
    await this.stopFFmpeg();

    logger.info("FFmpegPipeline stopped", {
      segmentCount: this.state.segmentCount,
      snapshotCount: this.state.snapshotCount,
      duration: this.getDuration(),
    });

    const finalState = { ...this.state };
    this.emit("stopped", finalState);

    return finalState;
  }

  /**
   * Force stop the pipeline (emergency stop)
   */
  async forceStop(): Promise<void> {
    this.state.isRunning = false;
    this.stopWatchers();
    this.stopProgressReporting();

    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGKILL");
      this.ffmpegProcess = null;
    }

    logger.warn("FFmpegPipeline force stopped");
  }

  /**
   * Get current state
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Get recording duration in seconds
   */
  getDuration(): number {
    if (!this.state.startTime) return 0;
    return Math.floor((Date.now() - this.state.startTime) / 1000);
  }

  /**
   * Ensure output directories exist
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.config.outputDir,
      path.join(this.config.outputDir, "snapshots"),
    ];

    for (const dir of dirs) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Spawn FFmpeg process
   */
  private async spawnFFmpeg(): Promise<void> {
    const ffmpegPath = getFFmpegPath();

    // Build command arguments
    const args = this.buildFFmpegArgs();

    logger.debug("Spawning FFmpeg", {
      path: ffmpegPath,
      args: args.join(" "),
    });

    return new Promise((resolve, reject) => {
      try {
        this.ffmpegProcess = spawn(ffmpegPath, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        // Handle stdout
        this.ffmpegProcess.stdout?.on("data", (data) => {
          logger.debug("FFmpeg stdout", { data: data.toString() });
        });

        // Handle stderr (FFmpeg logs go here)
        this.ffmpegProcess.stderr?.on("data", (data) => {
          const output = data.toString();
          // Parse progress from stderr
          this.parseProgress(output);
        });

        // Handle process exit
        this.ffmpegProcess.on("exit", (code, signal) => {
          logger.info("FFmpeg process exited", { code, signal });

          if (this.state.isRunning && code !== 0) {
            this.handleProcessExit(code, signal);
          }
        });

        // Handle errors
        this.ffmpegProcess.on("error", (error) => {
          logger.error("FFmpeg process error", { error: error.message });
          this.state.error = error.message;
          this.emit("error", error);
          reject(error);
        });

        // Give FFmpeg a moment to start
        setTimeout(() => {
          if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
            resolve();
          } else {
            reject(new Error("FFmpeg process failed to start"));
          }
        }, 500);
      } catch (error: any) {
        logger.error("Failed to spawn FFmpeg", { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Build FFmpeg command arguments
   */
  private buildFFmpegArgs(): string[] {
    const { outputDir, displayIndex, frameRate, segmentDuration, useHardwareCodec } = this.config;

    // Input arguments
    const inputArgs = buildInputArgs(displayIndex, frameRate);

    // We need to use tee muxer or split for dual output
    // For simplicity, we'll use a single output (HLS) and watch the segments for snapshots
    // This is more reliable than complex filter graphs
    const outputArgs = buildHLSOutputArgs(outputDir, segmentDuration, useHardwareCodec);

    // If hardware codec fails, fall back to software
    const args = [
      // Global options
      "-y", // Overwrite output
      "-hide_banner",
      "-loglevel", "warning",
      // Input
      ...inputArgs,
      // Output (HLS)
      ...outputArgs,
    ];

    return args;
  }

  /**
   * Stop FFmpeg process gracefully
   */
  private async stopFFmpeg(): Promise<void> {
    const process = this.ffmpegProcess;
    if (!process) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown takes too long
        if (!process.killed) {
          process.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      process.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      // Send quit signal (graceful)
      if (process.stdin) {
        process.stdin.write("q");
        process.stdin.end();
      }

      // Also send SIGTERM
      setTimeout(() => {
        if (!process.killed) {
          process.kill("SIGTERM");
        }
      }, 1000);
    });
  }

  /**
   * Handle FFmpeg process exit (potential restart)
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    logger.warn("FFmpeg process exited unexpectedly", { code, signal });

    if (this.state.restartCount >= this.config.maxRestarts) {
      this.state.error = `FFmpeg crashed ${this.state.restartCount} times, stopping`;
      this.state.isRunning = false;
      this.emit("error", new Error(this.state.error));
      return;
    }

    // Attempt restart
    this.state.restartCount++;
    logger.info("Restarting FFmpeg", { attempt: this.state.restartCount });

    this.spawnFFmpeg().catch((error) => {
      logger.error("Failed to restart FFmpeg", { error: error.message });
      this.state.error = error.message;
      this.state.isRunning = false;
      this.emit("error", error);
    });
  }

  /**
   * Parse FFmpeg progress output
   */
  private parseProgress(output: string): void {
    // Parse frame count and time from FFmpeg output
    const frameMatch = output.match(/frame=\s*(\d+)/);
    const timeMatch = output.match(/time=(\d+):(\d+):(\d+)/);

    if (frameMatch || timeMatch) {
      const frames = frameMatch ? parseInt(frameMatch[1], 10) : 0;
      let duration = 0;

      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        duration = hours * 3600 + minutes * 60 + seconds;
      }

      this.emit("progress", duration, frames);
    }
  }

  /**
   * Start file watchers for segments and snapshots
   */
  private startWatchers(): void {
    // Watch for new HLS segments
    this.watchInterval = setInterval(() => {
      this.checkForNewSegments();
    }, 1000);
  }

  /**
   * Stop file watchers
   */
  private stopWatchers(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  /**
   * Check for new HLS segments
   */
  private async checkForNewSegments(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.config.outputDir);
      const segments = files
        .filter((f) => f.endsWith(".ts") && f.startsWith("segment_"))
        .sort();

      if (segments.length > this.lastSegmentIndex) {
        for (let i = this.lastSegmentIndex; i < segments.length; i++) {
          const segmentPath = path.join(this.config.outputDir, segments[i]);
          this.state.segmentCount++;
          this.state.lastSegmentTime = Date.now();
          this.emit("segment", segmentPath, i);
        }
        this.lastSegmentIndex = segments.length;
      }
    } catch (_error: unknown) {
      // Ignore errors during watch
    }
  }

  /**
   * Start progress reporting interval
   */
  private startProgressReporting(): void {
    this.progressInterval = setInterval(() => {
      if (this.state.isRunning) {
        this.emit("progress", this.getDuration(), this.state.segmentCount);
      }
    }, 1000);
  }

  /**
   * Stop progress reporting
   */
  private stopProgressReporting(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Get HLS playlist path
   */
  getPlaylistPath(): string {
    return path.join(this.config.outputDir, "playlist.m3u8");
  }

  /**
   * Check if HLS output is valid
   */
  async isValidOutput(): Promise<boolean> {
    const playlistPath = this.getPlaylistPath();
    try {
      await fs.promises.access(playlistPath, fs.constants.R_OK);
      const content = await fs.promises.readFile(playlistPath, "utf-8");
      return content.includes("#EXTM3U") && content.includes("#EXT-X-VERSION");
    } catch {
      return false;
    }
  }
}
