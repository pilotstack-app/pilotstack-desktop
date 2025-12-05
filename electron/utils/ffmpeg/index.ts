/**
 * FFmpeg Utilities
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Video Generation System
 *
 * Re-exports all FFmpeg utilities for easy imports.
 */

// Path resolver
export { getFFmpegPath } from "./path-resolver";

// Encoding arguments
export {
  getHardwareAccelerationArgs,
  getSoftwareEncodingArgs,
  getStreamingEncoderArgs,
} from "./encoding-args";

// Compression utilities
export {
  UPLOAD_SIZE_THRESHOLD,
  getUploadCompressionSettings,
  getUploadCompressionArgs,
  getVideoDuration,
  compressForUpload,
  cleanupCompressedFile,
} from "./compression";

// Types
export type {
  UploadCompressionSettings,
  CompressionResult,
} from "./compression";
