/**
 * FFmpeg Encoding Arguments
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Video Generation System
 *
 * Encoding argument builders for various use cases.
 */

import { PLATFORM } from "../platform";
import { store } from "../../config/store";

/**
 * Get hardware acceleration arguments for FFmpeg
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Performance Optimizations §4 - Hardware Acceleration
 */
export function getHardwareAccelerationArgs(): string[] {
  const useHW = store.get("useHardwareAcceleration");
  if (!useHW) return [];

  if (PLATFORM.IS_MAC) {
    return [
      "-c:v",
      "h264_videotoolbox",
      "-b:v",
      "8M",
      "-profile:v",
      "high",
      "-level",
      "4.2",
    ];
  }

  if (PLATFORM.IS_WINDOWS) {
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p4",
      "-b:v",
      "8M",
      "-profile:v",
      "high",
    ];
  }

  if (PLATFORM.IS_LINUX) {
    return [
      "-vaapi_device",
      "/dev/dri/renderD128",
      "-c:v",
      "h264_vaapi",
      "-b:v",
      "8M",
    ];
  }

  return [];
}

/**
 * Get software encoding arguments for FFmpeg
 */
export function getSoftwareEncodingArgs(): string[] {
  const threads = Math.max(1, PLATFORM.CPU_COUNT - 1);

  // Get compression mode preference
  const compressionMode = store.get("compressionMode") || "quality";

  // CRF values: lower = better quality
  const crfMap: Record<string, string> = {
    speed: "22",
    balanced: "20",
    quality: "18",
  };
  const crf = crfMap[compressionMode] || "20";

  return [
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    crf,
    "-profile:v",
    "high",
    "-level",
    "4.2",
    // Tune for screen content with text (improves sharpness)
    "-tune",
    "stillimage",
    "-threads",
    String(threads),
    "-x264-params",
    `threads=${threads}:lookahead_threads=${Math.ceil(threads / 2)}`,
  ];
}

/**
 * Get hardware-accelerated encoder args optimized for real-time streaming encode
 * These are tuned for good quality while maintaining real-time encoding capability.
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Streaming Encoder
 */
export function getStreamingEncoderArgs(): string[] {
  const useHW = store.get("useHardwareAcceleration");

  // Get user's compression mode preference
  const compressionMode = store.get("compressionMode") || "quality";

  // Bitrate based on compression mode
  const bitrateMap: Record<string, string> = {
    speed: "4M",
    balanced: "6M",
    quality: "8M",
  };
  const bitrate = bitrateMap[compressionMode] || "6M";

  if (useHW && PLATFORM.IS_MAC) {
    // VideoToolbox on macOS - excellent for real-time encoding
    return [
      "-c:v",
      "h264_videotoolbox",
      "-realtime",
      "1",
      "-b:v",
      bitrate,
      "-maxrate",
      `${parseInt(bitrate) * 1.5}M`,
      "-profile:v",
      "high",
      "-level",
      "4.2",
    ];
  }

  if (useHW && PLATFORM.IS_WINDOWS) {
    // NVENC on Windows - use higher quality preset
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p5",
      "-tune",
      "hq",
      "-b:v",
      bitrate,
      "-maxrate",
      `${parseInt(bitrate) * 1.5}M`,
      "-profile:v",
      "high",
    ];
  }

  if (useHW && PLATFORM.IS_LINUX) {
    // VAAPI on Linux
    return [
      "-vaapi_device",
      "/dev/dri/renderD128",
      "-c:v",
      "h264_vaapi",
      "-b:v",
      bitrate,
    ];
  }

  // Software fallback - use better preset for quality
  const threads = Math.max(2, Math.floor(PLATFORM.CPU_COUNT / 2));

  // CRF values: lower = better quality, higher = smaller file
  const crfMap: Record<string, string> = {
    speed: "23",
    balanced: "20",
    quality: "18",
  };
  const crf = crfMap[compressionMode] || "20";

  return [
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-tune",
    "stillimage",
    "-crf",
    crf,
    "-profile:v",
    "high",
    "-level",
    "4.2",
    "-threads",
    String(threads),
  ];
}
