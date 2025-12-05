/**
 * Upload Checkpoint Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Multipart Upload
 * 
 * Manages upload checkpoints for resumable uploads.
 * Maps to: main.js checkpoint management
 */

import { AppContext } from "../../core/app-context";
import { UploadCheckpoint } from "../../config/types";

/**
 * Upload checkpoint manager
 * 
 * Wraps RecordingsManager checkpoint methods for upload service use.
 */
export class UploadCheckpointManager {
  private context: AppContext;

  constructor(context: AppContext) {
    this.context = context;
  }

  /**
   * Save checkpoint
   * 
   * Saves checkpoint to recording for resumable uploads.
   */
  async saveCheckpoint(recordingId: string, checkpoint: UploadCheckpoint): Promise<void> {
    const recordingsManager = this.context.getRecordingsManager();
    const updated = recordingsManager.saveUploadCheckpoint(recordingId, checkpoint);
    
    if (!updated) {
      throw new Error(`Failed to save checkpoint for recording ${recordingId}`);
    }
  }

  /**
   * Load checkpoint
   * 
   * Loads checkpoint from recording if it exists and is valid.
   */
  async loadCheckpoint(recordingId: string): Promise<UploadCheckpoint | null> {
    const recordingsManager = this.context.getRecordingsManager();
    
    // Check if recording has a resumable upload
    if (!recordingsManager.hasResumableUpload(recordingId)) {
      return null;
    }
    
    return recordingsManager.getUploadCheckpoint(recordingId);
  }

  /**
   * Clear checkpoint
   * 
   * Clears checkpoint after successful upload or abort.
   */
  async clearCheckpoint(recordingId: string): Promise<void> {
    const recordingsManager = this.context.getRecordingsManager();
    recordingsManager.clearUploadCheckpoint(recordingId);
  }
}

