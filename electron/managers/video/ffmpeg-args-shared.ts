/**
 * Shared FFmpeg argument helpers
 *
 * Centralizes common FFmpeg argument building so both the frame-based
 * generator and the streaming encoder use the same encoding and overlay
 * helpers. This avoids drift between HLS finalization and streaming paths.
 */

import { store } from "../../config/store";
import {
  getHardwareAccelerationArgs,
  getSoftwareEncodingArgs,
  getStreamingEncoderArgs,
} from "../../utils/ffmpeg";

export interface PixelFormatOptions {
  pixelFormat?: string;
  enableFastStart?: boolean;
}

export interface AudioOptions {
  musicPath?: string;
  audioBitrate?: string;
}

/**
 * Build optional audio input mapping for background music.
 */
export function buildAudioInputArgs(musicPath?: string): string[] {
  if (!musicPath) return [];
  return ["-i", musicPath, "-map", "0:v", "-map", "1:a"];
}

/**
 * Build optional audio encoding args when background music is present.
 */
export function buildAudioEncodingArgs(options: AudioOptions = {}): string[] {
  if (!options.musicPath) return [];
  const bitrate = options.audioBitrate || "192k";
  return ["-c:a", "aac", "-b:a", bitrate, "-shortest"];
}

/**
 * Build video filter args (watermarks/overlays).
 */
export function buildFilterArgs(filters?: string): string[] {
  return filters ? ["-vf", filters] : [];
}

/**
 * Build pixel format and container fast-start args.
 */
export function buildPixelFormatArgs(
  options: PixelFormatOptions = {}
): string[] {
  const pixelFormat = options.pixelFormat || "yuv420p";
  const enableFastStart = options.enableFastStart !== false;
  const args = ["-pix_fmt", pixelFormat];
  if (enableFastStart) {
    args.push("-movflags", "+faststart");
  }
  return args;
}

/**
 * Build encoding args for standard (non-streaming) outputs.
 * Uses hardware acceleration when enabled and available, otherwise falls back
 * to software encoding.
 */
export function buildStandardEncodingArgs(
  allowHardware: boolean = true
): string[] {
  const shouldUseHW = allowHardware && store.get("useHardwareAcceleration");
  const hwArgs = shouldUseHW ? getHardwareAccelerationArgs() : [];
  const swArgs = getSoftwareEncodingArgs();
  return shouldUseHW && hwArgs.length > 0 ? hwArgs : swArgs;
}

/**
 * Build encoding args optimized for streaming (real-time encoder preset).
 * Delegates to getStreamingEncoderArgs for platform-specific tuning.
 */
export function buildStreamingEncodingArgs(): string[] {
  return getStreamingEncoderArgs();
}
