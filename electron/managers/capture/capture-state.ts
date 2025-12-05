/**
 * Capture State Management
 *
 * State management and session persistence for capture operations.
 */

import * as fs from "fs";
import * as path from "path";
import { app, BrowserWindow } from "electron";
import { store, sessionStore } from "../../config/store";
import { logger } from "../../utils/logger";

/**
 * Capture state interface
 */
export interface CaptureState {
  isRecording: boolean;
  sessionFolder: string | null;
  sourceId: string | null;
  frameCount: number;
  droppedFrames: number;
  skippedSimilarFrames: number;
  queueSize: number;
  bufferSize: number;
  maxQueueSize: number;
  format: "png";
}

/**
 * Save session state to persistent storage
 */
export function saveSessionState(
  sessionFolder: string,
  sourceId: string | null,
  frameCount: number
): void {
  sessionStore.set("session", {
    sessionFolder,
    sourceId,
    startTime: Date.now(),
    frameCount,
    isActive: true,
    lastHeartbeat: Date.now(),
  });
}

/**
 * Clear session state from persistent storage
 */
export function clearSessionState(): void {
  sessionStore.delete("session");
}

/**
 * Get capture interval from settings
 */
export function getCaptureInterval(
  minInterval: number,
  maxInterval: number
): number {
  const configured = Number(store.get("captureInterval")) || 1000;
  if (Number.isNaN(configured)) return 1000;
  return Math.min(maxInterval, Math.max(minInterval, configured));
}

/**
 * Get output directory, creating if needed
 */
export async function ensureOutputDirectory(): Promise<string> {
  let outputDir = store.get("outputDirectory") || app.getPath("videos");
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const testFile = path.join(outputDir, `.pilotstack_test_${Date.now()}.tmp`);
    try {
      await fs.promises.writeFile(testFile, "test");
      await fs.promises.unlink(testFile);
    } catch {
      outputDir = app.getPath("videos");
      await fs.promises.mkdir(outputDir, { recursive: true });
      store.delete("outputDirectory");
    }
    return outputDir;
  } catch (error) {
    logger.error("Cannot create output directory", {
      error: (error as Error).message,
    });
    throw new Error(
      `Cannot create output directory: ${(error as Error).message}`
    );
  }
}

/**
 * Calculate estimated timelapse duration based on current frame count
 */
export function calculateTimelapseDuration(
  frameCount: number,
  outputFps: number = 30
): number {
  return frameCount / outputFps;
}

/**
 * Send heartbeat to renderer
 */
export function sendHeartbeat(
  mainWindow: BrowserWindow | null,
  frameCount: number,
  sessionFolder: string | null
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("recording:heartbeat", {
      frameCount,
      sessionFolder,
      isActive: true,
      timestamp: Date.now(),
      droppedFrames: 0,
      skippedFrames: 0,
    });
  }
}

/**
 * Safely send event to renderer
 */
export function safeSend(
  mainWindow: BrowserWindow | null,
  channel: string,
  data: any
): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  } catch {
    // Window may have been closed
  }
}

/**
 * Get initial capture state
 */
export function getInitialState(): CaptureState {
  return {
    isRecording: false,
    sessionFolder: null,
    sourceId: null,
    frameCount: 0,
    droppedFrames: 0,
    skippedSimilarFrames: 0,
    queueSize: 0,
    bufferSize: 0,
    maxQueueSize: 0,
    format: "png",
  };
}
