/**
 * Compression Service
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Compression
 * 
 * Compresses videos for upload.
 * Maps to: main.js compression section
 */

import {
  compressForUpload,
  type CompressionResult,
  UPLOAD_SIZE_THRESHOLD,
} from "../../utils/ffmpeg";

/**
 * Compression service
 * 
 * Wraps FFmpeg compression utilities for upload optimization.
 */
export class CompressionService {
  /**
   * Compress video for upload
   * 
   * Compresses video if it exceeds the upload threshold.
   * Uses FFmpeg with CRF encoding optimized for web playback.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Compression
   * 
   * @param videoPath - Path to video file
   * @param onProgress - Optional progress callback (0-100)
   * @returns Compression result with output path and metadata
   */
  async compressForUpload(
    videoPath: string,
    onProgress?: (progress: number) => void
  ): Promise<CompressionResult> {
    return compressForUpload(videoPath, onProgress);
  }

  /**
   * Check if compression is needed based on file size
   * 
   * @param fileSize - File size in bytes
   * @returns True if file exceeds upload threshold
   */
  needsCompression(fileSize: number): boolean {
    return fileSize >= UPLOAD_SIZE_THRESHOLD;
  }

  /**
   * Get upload size threshold
   * 
   * @returns Threshold in bytes (100MB default)
   */
  getUploadThreshold(): number {
    return UPLOAD_SIZE_THRESHOLD;
  }
}

