/**
 * Capture Service
 *
 * High-level orchestrator for native screen capture.
 * Manages FFmpegPipeline, MetricsAggregator, and activity monitors.
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture System
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type { AppContext } from "../../core/app-context";
import { logger } from "../../utils/logger";
import { store } from "../../config/store";
import { FFmpegPipeline, PipelineState } from "./ffmpeg-pipeline";
import { MetricsAggregator } from "../metrics/metrics-aggregator";
import { isNativeCaptureSupported, getPrimaryDisplay } from "./platform-utils";
import type { KeyboardMonitor } from "../../monitors/keyboard-monitor";
import type { ClipboardMonitor } from "../../monitors/clipboard-monitor";
import type { ActivityManager } from "../activity-manager";

/**
 * Capture service configuration
 */
export interface CaptureConfig {
  displayIndex?: number;
  frameRate?: number;
  segmentDuration?: number;
}

/**
 * Capture service state
 */
export interface CaptureServiceState {
  isRecording: boolean;
  isPaused: boolean;
  sessionFolder: string | null;
  sessionId: string | null;
  duration: number;
  segmentCount: number;
  startTime: number | null;
  error: string | null;
}

/**
 * Start result
 */
export interface StartResult {
  success: boolean;
  sessionFolder?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Stop result
 */
export interface StopResult {
  success: boolean;
  sessionFolder: string | null;
  sessionId: string | null;
  duration: number;
  segmentCount: number;
  metricsPath: string | null;
  error?: string;
}

/**
 * Capture Service
 *
 * Main entry point for screen capture functionality.
 */
export class CaptureService {
  private context: AppContext;
  private pipeline: FFmpegPipeline | null = null;
  private metricsAggregator: MetricsAggregator;
  private sessionFolder: string | null = null;
  private sessionId: string | null = null;
  private isPaused: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Activity monitors (injected)
  private keyboardMonitor: KeyboardMonitor | null = null;
  private clipboardMonitor: ClipboardMonitor | null = null;
  private activityManager: ActivityManager | null = null;

  // Metrics update interval
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(context: AppContext) {
    this.context = context;
    this.metricsAggregator = new MetricsAggregator();
  }

  /**
   * Set activity monitors for metrics collection
   */
  setActivityMonitors(monitors: {
    keyboardMonitor?: KeyboardMonitor;
    clipboardMonitor?: ClipboardMonitor;
    activityManager?: ActivityManager;
  }): void {
    this.keyboardMonitor = monitors.keyboardMonitor || null;
    this.clipboardMonitor = monitors.clipboardMonitor || null;
    this.activityManager = monitors.activityManager || null;

    logger.debug("Activity monitors configured", {
      hasKeyboard: !!this.keyboardMonitor,
      hasClipboard: !!this.clipboardMonitor,
      hasActivity: !!this.activityManager,
    });
  }

  /**
   * Start screen capture
   */
  async start(config: CaptureConfig = {}): Promise<StartResult> {
    try {
      // Check if already recording
      if (this.pipeline) {
        await this.stop();
      }

      // Check platform support
      if (!isNativeCaptureSupported()) {
        return {
          success: false,
          error: `Native capture not supported on ${process.platform}`,
        };
      }

      // Create session
      const outputDir = await this.ensureOutputDirectory();
      this.sessionId = `session_${Date.now()}`;
      this.sessionFolder = path.join(outputDir, `pilotstack_${Date.now()}`);

      await fs.promises.mkdir(this.sessionFolder, { recursive: true });

      logger.info("Starting capture session", {
        sessionId: this.sessionId,
        sessionFolder: this.sessionFolder,
      });

      // Get display info
      const display = getPrimaryDisplay();
      const displayIndex = config.displayIndex ?? 0;

      // Create and start pipeline
      this.pipeline = new FFmpegPipeline({
        outputDir: this.sessionFolder,
        displayIndex,
        frameRate: config.frameRate ?? 1,
        segmentDuration: config.segmentDuration ?? 6,
        snapshotInterval: 5,
        useHardwareCodec: store.get("useHardwareAcceleration") ?? false,
        maxRestarts: 3,
      });

      // Set up pipeline events
      this.setupPipelineEvents();

      // Start the pipeline
      await this.pipeline.start();

      // Start metrics aggregation
      this.metricsAggregator.start(this.sessionFolder, this.sessionId);

      // Start activity monitors
      this.startActivityMonitors();

      // Start metrics collection interval
      this.startMetricsCollection();

      // Start heartbeat
      this.startHeartbeat();

      this.isPaused = false;

      logger.info("Capture session started successfully", {
        sessionId: this.sessionId,
        display: display.name,
        resolution: `${display.width}x${display.height}`,
      });

      return {
        success: true,
        sessionFolder: this.sessionFolder,
        sessionId: this.sessionId,
      };
    } catch (error: any) {
      logger.error("Failed to start capture", { error: error.message });
      await this.cleanup();
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Stop screen capture
   */
  async stop(): Promise<StopResult> {
    const sessionFolder = this.sessionFolder;
    const sessionId = this.sessionId;

    try {
      // Stop heartbeat
      this.stopHeartbeat();

      // Stop metrics collection
      this.stopMetricsCollection();

      // Collect final metrics from monitors
      this.collectFinalMetrics();

      // Stop activity monitors
      this.stopActivityMonitors();

      // Stop and finalize metrics
      await this.metricsAggregator.stop();

      // Stop the pipeline
      let pipelineState: PipelineState | null = null;
      if (this.pipeline) {
        pipelineState = await this.pipeline.stop();
        this.pipeline = null;
      }

      const duration = pipelineState?.startTime
        ? Math.floor((Date.now() - pipelineState.startTime) / 1000)
        : 0;

      logger.info("Capture session stopped", {
        sessionId,
        duration,
        segmentCount: pipelineState?.segmentCount ?? 0,
      });

      // Clear state
      this.sessionFolder = null;
      this.sessionId = null;
      this.isPaused = false;

      return {
        success: true,
        sessionFolder,
        sessionId,
        duration,
        segmentCount: pipelineState?.segmentCount ?? 0,
        metricsPath: sessionFolder
          ? path.join(sessionFolder, "metrics.json")
          : null,
      };
    } catch (error: any) {
      logger.error("Error stopping capture", { error: error.message });
      await this.cleanup();
      return {
        success: true, // Still return success since recording data is saved
        sessionFolder,
        sessionId,
        duration: 0,
        segmentCount: 0,
        metricsPath: null,
        error: error.message,
      };
    }
  }

  /**
   * Pause capture
   */
  pause(): { success: boolean; paused: boolean } {
    // Note: FFmpeg native capture can't truly pause - we'd need to stop and restart
    // For now, we just mark as paused for metrics purposes
    this.isPaused = true;

    if (this.activityManager) {
      this.activityManager.pause();
    }

    logger.debug("Capture paused (activity tracking paused)");
    return { success: true, paused: true };
  }

  /**
   * Resume capture
   */
  resume(): { success: boolean; resumed: boolean } {
    this.isPaused = false;

    if (this.activityManager) {
      this.activityManager.resume();
    }

    logger.debug("Capture resumed");
    return { success: true, resumed: true };
  }

  /**
   * Emergency stop - force kill everything
   */
  async emergencyStop(): Promise<void> {
    logger.warn("Emergency stop triggered");

    this.stopHeartbeat();
    this.stopMetricsCollection();

    if (this.pipeline) {
      await this.pipeline.forceStop();
      this.pipeline = null;
    }

    this.stopActivityMonitors();
    await this.metricsAggregator.stop();

    this.sessionFolder = null;
    this.sessionId = null;
    this.isPaused = false;
  }

  /**
   * Get current state
   */
  getState(): CaptureServiceState {
    const pipelineState = this.pipeline?.getState();

    return {
      isRecording: !!this.pipeline && (pipelineState?.isRunning ?? false),
      isPaused: this.isPaused,
      sessionFolder: this.sessionFolder,
      sessionId: this.sessionId,
      duration: this.pipeline?.getDuration() ?? 0,
      segmentCount: pipelineState?.segmentCount ?? 0,
      startTime: pipelineState?.startTime ?? null,
      error: pipelineState?.error ?? null,
    };
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return !!this.pipeline && this.pipeline.getState().isRunning;
  }

  /**
   * Set up pipeline event handlers
   */
  private setupPipelineEvents(): void {
    if (!this.pipeline) return;

    this.pipeline.on("error", (error: Error) => {
      logger.error("Pipeline error", { error: error.message });
      this.sendToRenderer("capture:error", { message: error.message });
    });

    this.pipeline.on("progress", (duration: number, frameCount: number) => {
      this.sendToRenderer("capture:progress", {
        duration,
        frameCount,
        segmentCount: this.pipeline?.getState().segmentCount ?? 0,
      });
    });

    this.pipeline.on("segment", (segmentPath: string, index: number) => {
      logger.debug("New segment created", { segmentPath, index });
    });

    this.pipeline.on("stopped", (state: PipelineState) => {
      logger.info("Pipeline stopped", {
        segmentCount: state.segmentCount,
        restartCount: state.restartCount,
      });
    });
  }

  /**
   * Start activity monitors
   */
  private startActivityMonitors(): void {
    try {
      if (this.keyboardMonitor) {
        this.keyboardMonitor.start();
      }
      if (this.clipboardMonitor) {
        this.clipboardMonitor.start();
      }
      if (this.activityManager) {
        this.activityManager.start();
      }
    } catch (error: any) {
      logger.warn("Failed to start activity monitors", { error: error.message });
    }
  }

  /**
   * Stop activity monitors
   */
  private stopActivityMonitors(): void {
    try {
      if (this.keyboardMonitor) {
        this.keyboardMonitor.stop();
      }
      if (this.clipboardMonitor) {
        this.clipboardMonitor.stop();
      }
      if (this.activityManager) {
        this.activityManager.stop();
      }
    } catch (error: any) {
      logger.warn("Failed to stop activity monitors", { error: error.message });
    }
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    // Collect metrics every 5 seconds
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 5000);
  }

  /**
   * Stop metrics collection
   */
  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  /**
   * Collect current metrics from monitors
   */
  private collectMetrics(): void {
    if (!this.metricsAggregator.isRunning()) return;

    try {
      // Keyboard/mouse metrics
      if (this.keyboardMonitor) {
        const stats = this.keyboardMonitor.getStats();
        this.metricsAggregator.updateKeyboardMetrics(stats);
      }

      // Clipboard metrics
      if (this.clipboardMonitor) {
        const stats = this.clipboardMonitor.getStats();
        const events = this.clipboardMonitor.getPasteEvents();
        this.metricsAggregator.updateClipboardMetrics(stats, events);
      }

      // Activity metrics
      if (this.activityManager) {
        const stats = this.activityManager.getStats();
        this.metricsAggregator.updateActivityMetrics(stats);
      }
    } catch (error: any) {
      logger.debug("Error collecting metrics", { error: error.message });
    }
  }

  /**
   * Collect final metrics before stopping
   */
  private collectFinalMetrics(): void {
    this.collectMetrics();
  }

  /**
   * Start heartbeat for session state
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isRecording() && this.sessionFolder) {
        const state = this.getState();
        this.sendToRenderer("recording:heartbeat", {
          sessionFolder: this.sessionFolder,
          sessionId: this.sessionId,
          duration: state.duration,
          segmentCount: state.segmentCount,
          isActive: true,
          timestamp: Date.now(),
        });
      }
    }, 5000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory(): Promise<string> {
    const customDir = store.get("outputDirectory") as string | undefined;
    const defaultDir = path.join(app.getPath("videos"), "PilotStack");
    const outputDir = customDir || defaultDir;

    await fs.promises.mkdir(outputDir, { recursive: true });
    return outputDir;
  }

  /**
   * Send message to renderer
   */
  private sendToRenderer(channel: string, data: any): void {
    try {
      const mainWindow = this.context.getWindowManager().getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    } catch {
      // Ignore errors when window is not available
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    this.stopHeartbeat();
    this.stopMetricsCollection();
    this.stopActivityMonitors();

    if (this.pipeline) {
      try {
        await this.pipeline.forceStop();
      } catch {
        // Ignore
      }
      this.pipeline = null;
    }

    if (this.metricsAggregator.isRunning()) {
      try {
        await this.metricsAggregator.stop();
      } catch {
        // Ignore
      }
    }

    this.sessionFolder = null;
    this.sessionId = null;
    this.isPaused = false;
  }

  /**
   * Get HLS playlist path for current session
   */
  getPlaylistPath(): string | null {
    return this.pipeline?.getPlaylistPath() ?? null;
  }

  /**
   * Get metrics for current session
   */
  getCurrentMetrics() {
    return this.metricsAggregator.getMetrics();
  }
}
