/**
 * Upload Service
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
 *
 * Main upload service orchestrating cloud uploads.
 */

import * as fs from "fs";
import { BrowserWindow } from "electron";
import type { AppContext } from "../../core/app-context";
import type { Recording } from "../../config/types";
import { logger } from "../../utils/logger";
import { secureAuthManager } from "../../config/store";
import {
  cleanupCompressedFile,
  UPLOAD_SIZE_THRESHOLD,
  type CompressionResult,
} from "../../utils/ffmpeg";
import { MultipartUpload } from "./multipart-upload";
import { CompressionService } from "./compression-service";
import { UploadError } from "../../core/app-error";
import { getValidAccessToken } from "./auth-helpers";
import { performDirectUpload } from "./presigned-upload";
import { finalizeRecording, type UploadResult } from "./finalize-upload";

/**
 * Upload Service
 *
 * Orchestrates smart upload flow with compression and multipart support.
 */
export class UploadService {
  private context: AppContext;
  private multipartUpload: MultipartUpload;
  private compressionService: CompressionService;

  constructor(context: AppContext) {
    this.context = context;
    this.multipartUpload = new MultipartUpload(context);
    this.compressionService = new CompressionService();
  }

  /**
   * Upload recording to cloud
   *
   * Smart upload flow:
   * 1. Check file size
   * 2. If >= 100MB: Compress video first
   * 3. If >= 100MB: Use multipart upload
   * 4. Otherwise: Direct presigned URL upload
   */
  async uploadRecording(
    recordingId: string,
    onProgress?: (progress: number) => void,
    mainWindow?: BrowserWindow | null
  ): Promise<UploadResult> {
    const recordingsManager = this.context.getRecordingsManager();
    const recording = recordingsManager.get(recordingId);

    if (!recording) {
      throw new UploadError(`Recording not found: ${recordingId}`);
    }

    if (!fs.existsSync(recording.videoPath)) {
      recordingsManager.markUploadFailed(recordingId, "Video file not found");
      throw new UploadError("Video file not found");
    }

    const token = await getValidAccessToken();
    if (!token) {
      recordingsManager.update(recordingId, { status: "upload_queued" });
      throw new UploadError("Not authenticated");
    }

    try {
      const result = await this.performCloudUpload(
        recording,
        token,
        onProgress,
        mainWindow
      );

      if (result.success) {
        recordingsManager.markUploadComplete(
          recordingId,
          result.recordingId!,
          result.videoUrl!,
          secureAuthManager.getUserProfile()?.id || null
        );
      } else {
        recordingsManager.markUploadFailed(
          recordingId,
          result.error || "Upload failed"
        );
      }

      return result;
    } catch (error: any) {
      recordingsManager.markUploadFailed(recordingId, error.message);
      throw error;
    }
  }

  /**
   * Perform the actual cloud upload for a recording
   */
  private async performCloudUpload(
    recording: Recording,
    token: string,
    onProgress?: (progress: number) => void,
    mainWindow?: BrowserWindow | null
  ): Promise<UploadResult> {
    const videoPath = recording.videoPath;
    const metadata = {
      totalDuration: recording.duration || 0,
      activeDuration: recording.activeDuration || 0,
      pasteEventCount: recording.pasteEventCount || 0,
      verificationScore: recording.verificationScore || 0,
      isVerified: recording.isVerified || false,
      keyboardStats: (recording as any).keyboardStats || null,
    };

    logger.info("performCloudUpload started", {
      recordingId: recording.id,
      videoPath,
      hasToken: !!token,
    });

    if (!fs.existsSync(videoPath)) {
      return { success: false, error: "Video file not found" };
    }

    const videoStats = await fs.promises.stat(videoPath);
    const fileSizeMB = (videoStats.size / (1024 * 1024)).toFixed(2);

    logger.info("Starting smart upload for recording", {
      recordingId: recording.id,
      fileSizeMB,
      threshold: UPLOAD_SIZE_THRESHOLD / (1024 * 1024),
    });

    const uploadResult = await this.smartUpload(
      videoPath,
      token,
      (progress) => {
        if (onProgress) onProgress(Math.round(progress * 0.8));
      },
      recording.id,
      mainWindow
    );

    if (!uploadResult.success) {
      logger.error("Smart upload failed", {
        recordingId: recording.id,
        error: uploadResult.error,
        wasCompressed: uploadResult.wasCompressed,
      });
      return {
        success: false,
        error: uploadResult.error,
        localOnly: uploadResult.localOnly,
      };
    }

    logger.info("Smart upload completed", {
      recordingId: recording.id,
      wasCompressed: uploadResult.wasCompressed,
      originalSizeMB: uploadResult.originalSize
        ? (uploadResult.originalSize / 1024 / 1024).toFixed(2)
        : fileSizeMB,
      uploadedSizeMB: uploadResult.uploadedSize
        ? (uploadResult.uploadedSize / 1024 / 1024).toFixed(2)
        : fileSizeMB,
    });

    if (onProgress) onProgress(85);

    return finalizeRecording(
      recording,
      uploadResult,
      token,
      metadata,
      onProgress
    );
  }

  /**
   * Smart upload - handles compression and multipart automatically
   */
  private async smartUpload(
    videoPath: string,
    token: string,
    onProgress?: (progress: number) => void,
    recordingId?: string,
    mainWindow?: BrowserWindow | null
  ): Promise<{
    success: boolean;
    publicUrl?: string;
    key?: string;
    error?: string;
    localOnly?: boolean;
    wasCompressed?: boolean;
    originalSize?: number;
    uploadedSize?: number;
  }> {
    const videoStats = await fs.promises.stat(videoPath);
    const originalSize = videoStats.size;

    let uploadPath = videoPath;
    let wasCompressed = false;
    let compressionResult: CompressionResult | null = null;

    try {
      if (originalSize >= UPLOAD_SIZE_THRESHOLD) {
        if (mainWindow) {
          mainWindow.webContents.send("upload:status", {
            phase: "compressing",
            message: "Optimizing video for upload...",
          });
        }

        compressionResult = await this.compressionService.compressForUpload(
          videoPath,
          (progress) => {
            if (onProgress) onProgress(Math.round(progress * 0.4));
            if (mainWindow) {
              mainWindow.webContents.send("upload:compression-progress", {
                progress,
              });
            }
          }
        );

        if (compressionResult?.success && compressionResult.wasCompressed) {
          uploadPath = compressionResult.outputPath!;
          wasCompressed = true;
        }
      }

      const uploadStats = await fs.promises.stat(uploadPath);
      const uploadSize = uploadStats.size;

      if (mainWindow) {
        mainWindow.webContents.send("upload:status", {
          phase: "uploading",
          message:
            uploadSize >= UPLOAD_SIZE_THRESHOLD
              ? "Uploading in chunks..."
              : "Uploading to cloud...",
          fileSizeMB: (uploadSize / 1024 / 1024).toFixed(1),
        });
      }

      const uploadProgressOffset = wasCompressed ? 40 : 0;
      const uploadProgressScale = wasCompressed ? 0.6 : 1.0;

      const uploadProgressCallback = (progress: number) => {
        const adjusted =
          uploadProgressOffset + Math.round(progress * uploadProgressScale);
        if (onProgress) onProgress(adjusted);
      };

      let uploadResult;
      if (uploadSize >= UPLOAD_SIZE_THRESHOLD) {
        uploadResult = await this.multipartUpload.upload(
          uploadPath,
          uploadSize,
          token,
          uploadProgressCallback,
          recordingId
        );
      } else {
        uploadResult = await performDirectUpload(
          uploadPath,
          uploadSize,
          token,
          uploadProgressCallback,
          this.multipartUpload
        );
      }

      return {
        ...uploadResult,
        wasCompressed,
        originalSize,
        uploadedSize: uploadSize,
      };
    } finally {
      if (wasCompressed && compressionResult?.outputPath) {
        await cleanupCompressedFile(compressionResult.outputPath, videoPath);
      }
    }
  }
}

// Re-export types
export type { UploadResult };
