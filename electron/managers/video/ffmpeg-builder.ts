/**
 * FFmpeg Command Builder
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Generation Flow
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §2 - Code Duplication
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Performance Optimizations §4 - Hardware Acceleration
 * 
 * Builds FFmpeg commands for video generation.
 * Extracts duplicated FFmpeg argument building code.
 * Maps to: handlers/video.js FFmpeg building sections
 */

import { store } from "../../config/store";
import { getFFmpegPath, getHardwareAccelerationArgs } from "../../utils/ffmpeg";
import {
  buildAudioEncodingArgs,
  buildAudioInputArgs,
  buildFilterArgs,
  buildPixelFormatArgs,
  buildStandardEncodingArgs,
} from "./ffmpeg-args-shared";

/**
 * FFmpeg command building options
 */
export interface FFmpegBuildOptions {
  input: string;
  output: string;
  frameRate: number;
  width?: number;
  height?: number;
  filters?: string;
  musicPath?: string;
  useHardwareAcceleration?: boolean;
  effectiveFrameRate?: number;
}

/**
 * FFmpeg command builder
 */
export class FFmpegBuilder {
  /**
   * Build FFmpeg command for frame-based video generation
   */
  buildFrameBasedCommand(options: FFmpegBuildOptions): string[] {
    const {
      input,
      output,
      frameRate,
      filters,
      musicPath,
      effectiveFrameRate,
    } = options;

    const args = [
      "-y",
      "-probesize",
      "100M",
      "-analyzeduration",
      "100M",
      "-framerate",
      String(effectiveFrameRate || frameRate),
      "-start_number",
      "1",
      "-i",
      input,
    ];

    args.push(...buildAudioInputArgs(musicPath));
    args.push(...buildFilterArgs(filters));

    // Encoding settings
    const allowHW = options.useHardwareAcceleration !== false;
    args.push(...buildStandardEncodingArgs(allowHW));

    args.push(...buildPixelFormatArgs());

    // Output at target frame rate
    args.push("-r", "30");

    args.push(...buildAudioEncodingArgs({ musicPath }));

    args.push(output);

    return args;
  }

  /**
   * Build FFmpeg command for HLS finalization (with overlays)
   */
  buildHLSFinalizationCommand(options: {
    playlistPath: string;
    output: string;
    filters?: string;
    musicPath?: string;
  }): string[] {
    const { playlistPath, output, filters, musicPath } = options;

    const args = ["-y", "-i", playlistPath];

    args.push(...buildAudioInputArgs(musicPath));
    args.push(...buildFilterArgs(filters));

    // Encoding - use medium preset for better quality
    // CRF 18 provides high quality with reasonable file size
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-profile:v",
      "high",
      "-level",
      "4.2",
      "-tune",
      "stillimage",
      ...buildPixelFormatArgs({ enableFastStart: true })
    );

    args.push(...buildAudioEncodingArgs({ musicPath }));

    args.push(output);

    return args;
  }

  /**
   * Build FFmpeg command for fast HLS finalization (stream copy, no re-encoding)
   */
  buildFastHLSFinalizationCommand(options: {
    playlistPath: string;
    output: string;
    musicPath?: string;
  }): string[] {
    const { playlistPath, output, musicPath } = options;

    const args = ["-y", "-i", playlistPath];

    args.push(...buildAudioInputArgs(musicPath));
    args.push("-c:v", "copy"); // Copy video stream
    if (musicPath) {
      args.push("-c:a", "aac", "-b:a", "192k");
      args.push("-shortest");
    }

    args.push(...buildPixelFormatArgs({ enableFastStart: true }), output);

    return args;
  }

  /**
   * Build FFmpeg command for simple HLS remux (fallback, no overlays)
   */
  buildSimpleHLSRemuxCommand(options: {
    playlistPath: string;
    output: string;
  }): string[] {
    const { playlistPath, output } = options;

    return [
      "-y",
      "-i",
      playlistPath,
      "-c:v",
      "copy", // No re-encoding - just remux
      "-movflags",
      "+faststart",
      output,
    ];
  }

  /**
   * Get FFmpeg path
   */
  getFFmpegPath(): string {
    return getFFmpegPath();
  }

  /**
   * Detect hardware acceleration support
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Performance Optimizations §4
   */
  detectHardwareAcceleration(): string | null {
    const useHW = store.get("useHardwareAcceleration");
    if (!useHW) return null;

    const hwArgs = getHardwareAccelerationArgs();
    if (hwArgs.length === 0) return null;

    // Extract encoder name from args
    const encoderIndex = hwArgs.indexOf("-c:v");
    if (encoderIndex !== -1 && encoderIndex + 1 < hwArgs.length) {
      return hwArgs[encoderIndex + 1];
    }

    return null;
  }
}
