/**
 * FFmpeg Arguments Builder
 * 
 * Builds FFmpeg command-line arguments for HLS streaming encoder.
 * Extracted from encoder-process.ts to keep file sizes under 300 lines.
 */

import * as path from "path";
import { EncoderProcessOptions } from "./encoder-process";
import {
  buildPixelFormatArgs,
  buildStreamingEncodingArgs,
} from "../video/ffmpeg-args-shared";

/**
 * Build FFmpeg arguments for HLS streaming encoder
 */
export function buildHLSEncoderArgs(
  options: EncoderProcessOptions
): string[] {
  const encoderArgs = buildStreamingEncodingArgs();
  const segmentPattern = path.join(options.outputDir, "seg_%05d.ts");
  const playlistPath = path.join(options.outputDir, "recording.m3u8");

  return [
    // Input: PNG images from stdin at specified framerate
    "-f",
    "image2pipe",
    "-framerate",
    String(options.frameRate),
    "-i",
    "-",

    // Video encoding
    ...encoderArgs,

    // Force keyframes at segment boundaries for clean cuts
    "-force_key_frames",
    `expr:gte(t,n_forced*${options.segmentDuration})`,
    "-g",
    String(options.frameRate * options.segmentDuration), // GOP size

    // Pixel format for compatibility
    ...buildPixelFormatArgs({ enableFastStart: false }),

    // HLS output settings
    "-f",
    "hls",
    "-hls_time",
    String(options.segmentDuration),
    "-hls_segment_filename",
    segmentPattern,
    "-hls_flags",
    "append_list+independent_segments",
    "-hls_list_size",
    "0", // Keep all segments in playlist
    "-hls_playlist_type",
    "event", // Growing playlist

    // Output playlist
    playlistPath,
  ];
}

