/**
 * Recordings Manager
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 *
 * Main recordings manager class with event notifications.
 *
 * State machine:
 * [recording] --> [processing] --> [ready]
 *                                     |
 *                    +---connect------+
 *                    |                |
 *                    v                v
 *             [upload_queued] --auth--> [uploading] --> [uploaded]
 *                    ^                       |
 *                    +-------retry------[failed]
 */

import { BrowserWindow } from "electron";
import type { AppContext } from "../../core/app-context";
import type { Recording, RecordingStatus, UploadCheckpoint } from "../../config/types";
import { logger } from "../../utils/logger";

// Import types directly for use in this file
import type { RecordingData, TransitionResult, DeleteResult } from "./types";

// Re-export types
export type { RecordingData, TransitionResult, DeleteResult, DiskUsage } from "./types";
export { VALID_TRANSITIONS } from "./types";

// Import operations
import * as storeOps from "./store-operations";
import * as uploadOps from "./upload-operations";

/**
 * Recordings Manager
 *
 * Manages the recordings library with state machine.
 */
export class RecordingsManager {
  private context: AppContext;

  constructor(context: AppContext) {
    this.context = context;
  }

  /**
   * Get main window for event notifications
   */
  private getMainWindow(): BrowserWindow | null {
    try {
      return this.context.getWindowManager().getMainWindow();
    } catch (error) {
      logger.warn("Failed to get main window for recordings manager", error);
      return null;
    }
  }

  // ============ Store Operations ============

  generateId = storeOps.generateRecordingId;
  getAll = storeOps.getAllRecordings;
  get = storeOps.getRecording;
  getLatest = storeOps.getLatestRecording;
  getByStatus = storeOps.getRecordingsByStatus;
  getPendingUploads = storeOps.getPendingUploads;
  checkVideoExists = storeOps.checkVideoExists;
  getDiskUsage = storeOps.getDiskUsage;
  formatBytes = storeOps.formatBytes;

  async list(): Promise<Recording[]> {
    return this.getAll();
  }

  async getAsync(id: string): Promise<Recording | null> {
    return this.get(id);
  }

  add(recordingData: RecordingData): Recording {
    const recording = storeOps.addRecording(recordingData);
    this.notifyChange();
    return recording;
  }

  async addAsync(recordingData: RecordingData): Promise<Recording> {
    return this.add(recordingData);
  }

  update(id: string, updates: Partial<Recording>): Recording | null {
    const updated = storeOps.updateRecording(id, updates);
    if (updated) {
      this.notifyChange();
    }
    return updated;
  }

  transitionStatus(id: string, newStatus: RecordingStatus): TransitionResult {
    const result = storeOps.transitionRecordingStatus(id, newStatus);
    if (result.success) {
      this.notifyChange();
    }
    return result;
  }

  async updateStatus(id: string, status: RecordingStatus): Promise<void> {
    const result = this.transitionStatus(id, status);
    if (!result.success) {
      throw new Error(result.error || "Failed to update status");
    }
  }

  delete(id: string, deleteFiles: boolean = false): DeleteResult {
    const result = storeOps.deleteRecording(id, deleteFiles);
    if (result.success) {
      this.notifyChange();
    }
    return result;
  }

  async deleteAsync(id: string, deleteFiles: boolean = false): Promise<void> {
    const result = this.delete(id, deleteFiles);
    if (!result.success) {
      throw new Error(result.error || "Failed to delete recording");
    }
  }

  updateTitle(id: string, title: string): Recording | null {
    return this.update(id, { title });
  }

  // ============ Upload Operations ============

  requestUpload(id: string, isConnected: boolean = false): TransitionResult {
    const result = uploadOps.requestUpload(id, isConnected);
    if (result.success) {
      this.notifyChange();
    }
    return result;
  }

  async requestUploadAsync(id: string): Promise<void> {
    await uploadOps.requestUploadAsync(id);
    this.notifyChange();
  }

  updateUploadProgress(id: string, progress: number): void {
    uploadOps.updateUploadProgress(id, progress);
    this.notifyUploadProgress(id, progress);
  }

  markUploadComplete(
    id: string,
    cloudRecordingId: string,
    cloudUrl: string,
    connectedUserId: string | null = null
  ): Recording | null {
    const updated = uploadOps.markUploadComplete(
      id,
      cloudRecordingId,
      cloudUrl,
      connectedUserId
    );
    if (updated) {
      this.notifyUploadComplete(id, cloudUrl);
      this.notifyChange();
    }
    return updated;
  }

  markUploadFailed(id: string, error: string): Recording | null {
    const updated = uploadOps.markUploadFailed(id, error);
    if (updated) {
      this.notifyUploadFailed(id, error);
      this.notifyChange();
    }
    return updated;
  }

  retryUpload(id: string): TransitionResult {
    const result = uploadOps.retryUpload(id);
    if (result.success) {
      this.notifyChange();
    }
    return result;
  }

  async retryUploadAsync(id: string): Promise<void> {
    await uploadOps.retryUploadAsync(id);
    this.notifyChange();
  }

  // ============ Checkpoint Operations ============

  saveUploadCheckpoint(id: string, checkpoint: UploadCheckpoint): Recording | null {
    return uploadOps.saveUploadCheckpoint(id, checkpoint);
  }

  getUploadCheckpoint(id: string): UploadCheckpoint | null {
    return uploadOps.getUploadCheckpoint(id);
  }

  clearUploadCheckpoint(id: string): Recording | null {
    return uploadOps.clearUploadCheckpoint(id);
  }

  getIncompleteUploads(): Recording[] {
    return uploadOps.getIncompleteUploads();
  }

  hasResumableUpload(id: string): boolean {
    return uploadOps.hasResumableUpload(id);
  }

  processPendingUploads(): Recording[] {
    const toUpload = uploadOps.processPendingUploads();
    if (toUpload.length > 0) {
      this.notifyChange();
    }
    return toUpload;
  }

  // ============ Event Notifications ============

  private safeSend(channel: string, data: any): void {
    try {
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    } catch (error) {
      // Window may have been closed
    }
  }

  private notifyChange(): void {
    this.safeSend("recordings:changed", { recordings: this.getAll() });
  }

  private notifyUploadProgress(id: string, progress: number): void {
    this.safeSend("recordings:upload-progress", { id, progress });
  }

  private notifyUploadComplete(id: string, cloudUrl: string): void {
    this.safeSend("recordings:upload-complete", { id, cloudUrl });
  }

  private notifyUploadFailed(id: string, error: string): void {
    this.safeSend("recordings:upload-failed", { id, error });
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Nothing to cleanup for recordings manager
  }
}

// Re-export store operations for direct use
export {
  generateRecordingId,
  getAllRecordings,
  getRecording,
  getLatestRecording,
  getRecordingsByStatus,
  addRecording,
  updateRecording,
  transitionRecordingStatus,
  deleteRecording,
  checkVideoExists,
  getDiskUsage,
  formatBytes,
} from "./store-operations";

// Re-export upload operations for direct use
export {
  requestUpload,
  updateUploadProgress,
  markUploadComplete,
  markUploadFailed,
  retryUpload,
  saveUploadCheckpoint,
  getUploadCheckpoint,
  clearUploadCheckpoint,
  getIncompleteUploads,
  hasResumableUpload,
  processPendingUploads,
} from "./upload-operations";
