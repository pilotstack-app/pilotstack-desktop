/**
 * Simplified Capture Manager
 *
 * Simple approach: Take screenshots at intervals and save them as files.
 * No streaming encoder, no adaptive quality, no frame similarity, no workers.
 * Just reliable screenshot capture that works on all devices.
 */

import * as fs from "fs";
import * as path from "path";
import { BrowserWindow } from "electron";
import type { AppContext } from "../../core/app-context";
import { logger } from "../../utils/logger";
import { CaptureLoop } from "./capture-loop";
import {
  saveSessionState,
  clearSessionState,
  getCaptureInterval,
  ensureOutputDirectory,
  calculateTimelapseDuration,
  safeSend,
  type CaptureState,
} from "./capture-state";
import {
  captureScreen,
  saveFrame,
  CAPTURE_CONFIG,
  type CaptureResult,
} from "./screen-capture";

type StartResult =
  | { success: true; sessionFolder: string; format: "png" }
  | { success: false; error: string };

type StopResult = {
  success: true;
  sessionFolder: string | null;
  totalFrames: number;
  droppedFrames: number;
  skippedSimilarFrames: number;
  format: "png";
  error?: string;
};

/**
 * Simplified Capture Manager
 *
 * Takes screenshots at configured intervals and saves them as files.
 */
export class CaptureManager {
  private context: AppContext;
  private isRecordingActive: boolean = false;
  private sessionFolder: string | null = null;
  private sourceId: string | null = null;
  private frameCount: number = 0;
  private captureLoop: CaptureLoop;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private consecutiveCaptureFailures: number = 0;
  private isCapturing: boolean = false;

  constructor(context: AppContext) {
    this.context = context;
    this.captureLoop = new CaptureLoop();
  }

  /**
   * Set activity monitors for verification data collection
   */
  setActivityMonitors(monitors: {
    activityManager?: any;
    keyboardMonitor?: any;
    clipboardMonitor?: any;
  }): void {
    void monitors;
  }

  private getMainWindow(): BrowserWindow | null {
    try {
      return this.context.getWindowManager().getMainWindow();
    } catch {
      return null;
    }
  }

  private async doCaptureScreen(): Promise<CaptureResult | null> {
    if (this.isCapturing) return null;
    this.isCapturing = true;

    try {
      const { result, captureError } = await captureScreen(
        this.sourceId,
        false
      );
      if (captureError) {
        this.consecutiveCaptureFailures++;
        throw new Error(captureError);
      }
      this.consecutiveCaptureFailures = 0;
      return result;
    } finally {
      this.isCapturing = false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.isRecordingActive && this.sessionFolder) {
        saveSessionState(this.sessionFolder, this.sourceId, this.frameCount);
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("recording:heartbeat", {
            frameCount: this.frameCount,
            sessionFolder: this.sessionFolder,
            isActive: true,
            timestamp: Date.now(),
            droppedFrames: 0,
            skippedFrames: 0,
          });
        }
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async runCaptureIteration(): Promise<void> {
    if (!this.isRecordingActive) return;

    if (
      this.consecutiveCaptureFailures >= CAPTURE_CONFIG.MAX_CONSECUTIVE_FAILURES
    ) {
      await this.handleFatalCaptureError(
        "Capture source unavailable. Try selecting a different window or screen."
      );
      return;
    }

    try {
      const capture = await this.doCaptureScreen();
      if (capture && capture.buffer && capture.buffer.length > 0) {
        this.frameCount++;

        await saveFrame(capture.buffer, this.frameCount, this.sessionFolder!);

        const captureInterval = getCaptureInterval(
          CAPTURE_CONFIG.MIN_CAPTURE_INTERVAL,
          CAPTURE_CONFIG.MAX_CAPTURE_INTERVAL
        );
        const timelapseDuration = calculateTimelapseDuration(
          this.frameCount,
          CAPTURE_CONFIG.OUTPUT_FPS
        );
        const realTimeDuration = this.frameCount * (captureInterval / 1000);

        safeSend(this.getMainWindow(), "capture:frame-update", {
          frameCount: this.frameCount,
          estimatedDuration: timelapseDuration,
          realTimeDuration: realTimeDuration,
          queueSize: 0,
          bufferSize: 0,
          droppedFrames: 0,
          skippedFrames: 0,
          captureTime: capture.captureTime,
          avgFrameSize: Math.round(capture.buffer.length / 1024) + "KB",
        });
      }
    } catch (error) {
      if (
        this.consecutiveCaptureFailures < 3 ||
        this.consecutiveCaptureFailures === CAPTURE_CONFIG.MAX_CONSECUTIVE_FAILURES
      ) {
        logger.error("Capture iteration error", {
          error: (error as Error).message,
        });
      }
      this.consecutiveCaptureFailures++;
      if (
        this.consecutiveCaptureFailures >= CAPTURE_CONFIG.MAX_CONSECUTIVE_FAILURES
      ) {
        await this.handleFatalCaptureError(
          "Capture failed repeatedly. Check screen recording permissions."
        );
      }
    }
  }

  private async handleFatalCaptureError(message: string): Promise<void> {
    this.isRecordingActive = false;
    this.captureLoop.stop();
    this.stopHeartbeat();
    clearSessionState();
    this.consecutiveCaptureFailures = 0;
    safeSend(this.getMainWindow(), "capture:error", { message });
  }

  async start(sourceId: string): Promise<StartResult> {
    try {
      if (this.isRecordingActive) {
        await this.stop();
      }

      const outputDir = await ensureOutputDirectory();

      const sessionName = `pilotstack_${Date.now()}`;
      this.sessionFolder = path.join(outputDir, sessionName);
      this.sourceId = sourceId;
      await fs.promises.mkdir(this.sessionFolder, { recursive: true });

      logger.info("Recording session started", {
        sessionFolder: this.sessionFolder,
        sourceId,
      });

      this.frameCount = 0;
      this.consecutiveCaptureFailures = 0;
      this.isRecordingActive = true;

      this.startHeartbeat();
      saveSessionState(this.sessionFolder, this.sourceId, this.frameCount);

      // Test capture
      let testCapture: CaptureResult | null = null;
      for (let i = 0; i < 3 && !testCapture; i++) {
        try {
          testCapture = await this.doCaptureScreen();
          if (!testCapture) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (!testCapture) {
        logger.error("All initial capture attempts failed");
        this.cleanup();
        return { success: false, error: "Failed to capture from selected source" };
      }

      // Save first frame
      this.frameCount++;
      await saveFrame(testCapture.buffer, this.frameCount, this.sessionFolder);

      const captureInterval = getCaptureInterval(
        CAPTURE_CONFIG.MIN_CAPTURE_INTERVAL,
        CAPTURE_CONFIG.MAX_CAPTURE_INTERVAL
      );
      const timelapseDuration = calculateTimelapseDuration(
        this.frameCount,
        CAPTURE_CONFIG.OUTPUT_FPS
      );
      const realTimeDuration = this.frameCount * (captureInterval / 1000);

      safeSend(this.getMainWindow(), "capture:frame-update", {
        frameCount: this.frameCount,
        estimatedDuration: timelapseDuration,
        realTimeDuration: realTimeDuration,
        captureTime: testCapture.captureTime,
      });

      this.captureLoop.start(captureInterval, () => this.runCaptureIteration());

      logger.info("Recording started", {
        sessionFolder: this.sessionFolder,
        format: "png",
        interval: captureInterval,
      });

      return {
        success: true,
        sessionFolder: this.sessionFolder,
        format: "png",
      };
    } catch (error) {
      logger.error("Start capture error", { error: (error as Error).message });
      this.cleanup();
      return { success: false, error: (error as Error).message };
    }
  }

  async stop(): Promise<StopResult> {
    const sessionFolder = this.sessionFolder;
    const frameCount = this.frameCount;

    try {
      this.captureLoop.stop();
      this.isRecordingActive = false;
      this.stopHeartbeat();

      while (this.isCapturing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      clearSessionState();

      logger.info("Recording stopped", { totalFrames: frameCount });

      return {
        success: true,
        sessionFolder,
        totalFrames: frameCount,
        droppedFrames: 0,
        skippedSimilarFrames: 0,
        format: "png",
      };
    } catch (error) {
      logger.error("Stop capture error", { error: (error as Error).message });
      this.cleanup();
      return {
        success: true,
        sessionFolder,
        totalFrames: frameCount,
        droppedFrames: 0,
        skippedSimilarFrames: 0,
        format: "png",
        error: (error as Error).message,
      };
    }
  }

  pause(): { success: boolean; paused: boolean } {
    this.captureLoop.stop();
    logger.debug("Recording paused", { frameCount: this.frameCount });
    return { success: true, paused: true };
  }

  async resume(sourceId: string): Promise<{ success: boolean; resumed: boolean }> {
    if (!this.isRecordingActive) return { success: false, resumed: false };
    this.sourceId = sourceId;
    const baseInterval = getCaptureInterval(
      CAPTURE_CONFIG.MIN_CAPTURE_INTERVAL,
      CAPTURE_CONFIG.MAX_CAPTURE_INTERVAL
    );
    this.captureLoop.start(baseInterval, () => this.runCaptureIteration());
    return { success: true, resumed: true };
  }

  async emergencyStop(): Promise<void> {
    await this.stop();
  }

  getState(): CaptureState {
    return {
      isRecording: this.isRecordingActive,
      sessionFolder: this.sessionFolder,
      frameCount: this.frameCount,
      sourceId: this.sourceId,
      droppedFrames: 0,
      skippedSimilarFrames: 0,
      queueSize: 0,
      bufferSize: 0,
      maxQueueSize: 0,
      format: "png",
    };
  }

  async cleanup(): Promise<void> {
    this.isRecordingActive = false;
    this.captureLoop.stop();
    this.stopHeartbeat();
    clearSessionState();
  }
}
