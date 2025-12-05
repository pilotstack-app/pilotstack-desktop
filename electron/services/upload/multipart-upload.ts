/**
 * Multipart Upload
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Multipart Upload
 *
 * Handles multipart uploads with resumability.
 */

import * as fs from "fs";
import * as path from "path";
import type { AppContext } from "../../core/app-context";
import type { UploadCheckpoint } from "../../config/types";
import { buildApiUrl } from "../../config/api";
import { logger } from "../../utils/logger";
import { UploadCheckpointManager } from "./upload-checkpoint";
import {
  MAX_PARALLEL_UPLOADS,
  postJsonWithAuth,
  calculatePartSize,
  uploadPart,
} from "./multipart-parts";

/**
 * Multipart upload result
 */
export interface MultipartUploadResult {
  success: boolean;
  publicUrl?: string;
  key?: string;
  error?: string;
  localOnly?: boolean;
  canResume?: boolean;
}

/**
 * Multipart upload manager
 */
export class MultipartUpload {
  private checkpointManager: UploadCheckpointManager;

  constructor(context: AppContext) {
    this.checkpointManager = new UploadCheckpointManager(context);
  }

  /**
   * Calculate optimal part size based on file size
   */
  calculatePartSize = calculatePartSize;

  /**
   * Perform multipart upload for large files with checkpoint support
   */
  async upload(
    videoPath: string,
    fileSize: number,
    token: string,
    onProgress?: (progress: number) => void,
    recordingId?: string
  ): Promise<MultipartUploadResult> {
    let authToken = token;
    logger.info("Starting multipart upload", {
      videoPath,
      fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
      recordingId,
    });

    const filename = path.basename(videoPath);
    let uploadSession: { uploadId: string; key: string } | null = null;
    let completedParts: Array<{ PartNumber: number; ETag: string }> = [];
    let startPartIndex = 0;
    let isResuming = false;

    // Check for existing checkpoint to resume
    let existingCheckpoint: UploadCheckpoint | null = null;
    if (recordingId) {
      existingCheckpoint = await this.checkpointManager.loadCheckpoint(recordingId);
      if (existingCheckpoint) {
        logger.info("Found resumable upload checkpoint", {
          recordingId,
          uploadId: existingCheckpoint.uploadId,
          completedParts: existingCheckpoint.completedParts?.length || 0,
          totalParts: existingCheckpoint.totalParts,
        });
        isResuming = true;
      }
    }

    try {
      const defaultPartSize = existingCheckpoint?.partSize || this.calculatePartSize(fileSize);
      let partSize = defaultPartSize;
      let totalParts = Math.ceil(fileSize / partSize);

      if (isResuming && existingCheckpoint) {
        // Resume from checkpoint
        const { response: resumeResp, token: refreshedToken } = await postJsonWithAuth(
          buildApiUrl("UPLOAD_MULTIPART"),
          {
            action: "resume",
            key: existingCheckpoint.key,
            uploadId: existingCheckpoint.uploadId,
          },
          authToken
        );
        authToken = refreshedToken;

        if (!resumeResp.ok) {
          const errorText = await resumeResp.text().catch(() => "");
          logger.error("Multipart resume failed", {
            status: resumeResp.status,
            errorText,
          });
          return {
            success: false,
            error: `Failed to resume multipart upload: ${resumeResp.status}`,
            localOnly: true,
            canResume: false,
          };
        }

        const resumeData = (await resumeResp.json()) as {
          uploadId: string;
          key: string;
          partSize?: number;
        };

        partSize = resumeData.partSize || partSize;
        totalParts = Math.ceil(fileSize / partSize);

        uploadSession = {
          uploadId: existingCheckpoint.uploadId,
          key: existingCheckpoint.key,
        };

        completedParts = (existingCheckpoint.completedParts || []).map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        }));

        const completedPartNumbers = new Set(completedParts.map((p) => p.PartNumber));
        for (let i = 0; i < totalParts; i++) {
          if (!completedPartNumbers.has(i + 1)) {
            startPartIndex = i;
            break;
          }
        }

        const resumeProgress = 10 + Math.round((completedParts.length / totalParts) * 70);
        if (onProgress) onProgress(resumeProgress);
      } else {
        // Initialize new multipart upload
        const { response: initResponse, token: refreshedToken } = await postJsonWithAuth(
          buildApiUrl("UPLOAD_MULTIPART"),
          {
            action: "init",
            filename,
            contentType: "video/mp4",
            contentLength: fileSize,
          },
          authToken
        );
        authToken = refreshedToken;

        if (!initResponse.ok) {
          const errorText = await initResponse.text().catch(() => "");
          logger.error("Multipart init failed", {
            status: initResponse.status,
            errorText,
          });
          return {
            success: false,
            error: `Failed to initialize multipart upload: ${initResponse.status}`,
            localOnly: true,
          };
        }

        const initResult = (await initResponse.json()) as {
          uploadId: string;
          key: string;
          partSize?: number;
        };
        uploadSession = {
          uploadId: initResult.uploadId,
          key: initResult.key,
        };

        if (initResult.partSize) {
          partSize = initResult.partSize;
          totalParts = Math.ceil(fileSize / partSize);
        }

        if (onProgress) onProgress(10);

        if (recordingId) {
          await this.checkpointManager.saveCheckpoint(recordingId, {
            uploadId: uploadSession.uploadId,
            key: uploadSession.key,
            completedParts: [],
            totalParts,
            partSize,
            fileSize,
            lastUpdatedAt: Date.now(),
          });
        }
      }

      const videoBuffer = await fs.promises.readFile(videoPath);

      // Upload parts in batches
      for (
        let batchStart = startPartIndex;
        batchStart < totalParts;
        batchStart += MAX_PARALLEL_UPLOADS
      ) {
        const batchEnd = Math.min(batchStart + MAX_PARALLEL_UPLOADS, totalParts);
        const partNumbers: number[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
          const partNum = i + 1;
          if (!completedParts.find((p) => p.PartNumber === partNum)) {
            partNumbers.push(partNum);
          }
        }

        if (partNumbers.length === 0) continue;

        const { response: urlsResponse, token: refreshedToken } = await postJsonWithAuth(
          buildApiUrl("UPLOAD_MULTIPART"),
          {
            action: "get-part-urls",
            key: uploadSession!.key,
            uploadId: uploadSession!.uploadId,
            partNumbers,
          },
          authToken
        );
        authToken = refreshedToken;

        if (!urlsResponse.ok) {
          throw new Error(`Failed to get part URLs: ${urlsResponse.status}`);
        }

        const { partUrls } = (await urlsResponse.json()) as {
          partUrls: Array<{ partNumber: number; uploadUrl: string }>;
        };

        const uploadPromises = partUrls.map(async ({ partNumber, uploadUrl }) => {
          const startByte = (partNumber - 1) * partSize;
          const endByte = Math.min(startByte + partSize, fileSize);
          const partBuffer = videoBuffer.slice(startByte, endByte);

          const result = await uploadPart(uploadUrl, partBuffer, partNumber);
          return result;
        });

        const batchResults = await Promise.all(uploadPromises);
        completedParts.push(...batchResults);

        const uploadProgress = 10 + Math.round((completedParts.length / totalParts) * 70);
        if (onProgress) onProgress(uploadProgress);

        if (recordingId && uploadSession) {
          await this.checkpointManager.saveCheckpoint(recordingId, {
            uploadId: uploadSession.uploadId,
            key: uploadSession.key,
            completedParts: completedParts.map((p) => ({
              partNumber: p.PartNumber,
              etag: p.ETag,
            })),
            totalParts,
            partSize,
            fileSize,
            lastUpdatedAt: Date.now(),
          });
        }
      }

      // Complete multipart upload
      const { response: completeResponse } = await postJsonWithAuth(
        buildApiUrl("UPLOAD_MULTIPART"),
        {
          action: "complete",
          key: uploadSession!.key,
          uploadId: uploadSession!.uploadId,
          parts: completedParts.sort((a, b) => a.PartNumber - b.PartNumber),
        },
        authToken
      );

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text().catch(() => "");
        throw new Error(`Failed to complete multipart upload: ${errorText}`);
      }

      const completeResult = (await completeResponse.json()) as {
        key: string;
        publicUrl: string;
      };

      if (onProgress) onProgress(85);

      if (recordingId) {
        await this.checkpointManager.clearCheckpoint(recordingId);
      }

      logger.info("Multipart upload completed", {
        key: completeResult.key,
        publicUrl: completeResult.publicUrl,
        isResuming,
      });

      return {
        success: true,
        publicUrl: completeResult.publicUrl,
        key: completeResult.key,
      };
    } catch (error: any) {
      logger.error("Multipart upload failed", {
        error: error.message,
        uploadId: uploadSession?.uploadId,
        recordingId,
        completedParts: completedParts.length,
      });

      if (!recordingId && uploadSession?.uploadId) {
        try {
          await postJsonWithAuth(
            buildApiUrl("UPLOAD_MULTIPART"),
            {
              action: "abort",
              key: uploadSession.key,
              uploadId: uploadSession.uploadId,
            },
            authToken
          );
        } catch (abortError: any) {
          logger.warn("Failed to abort multipart upload", {
            error: abortError.message,
          });
        }
      }

      return {
        success: false,
        error: error.message,
        localOnly: true,
        canResume: !!(recordingId && completedParts.length > 0),
      };
    }
  }
}
