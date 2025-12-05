/**
 * Streaming Encoder Types
 * 
 * Type definitions for streaming encoder.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { ActivityMarker } from "./activity-tracker";

/**
 * Streaming encoder options
 */
export interface StreamingEncoderOptions {
  frameRate?: number;
  segmentDuration?: number;
  width?: number;
  height?: number;
}

/**
 * Streaming encoder metadata
 */
export interface StreamingEncoderMetadata {
  playlistPath: string;
  segmentPattern: string;
  outputDir: string;
  frameCount: number;
  frameRate: number;
  segmentCount: number;
  segmentDuration: number;
  duration: number;
  startTime: number | null;
  endTime: number | null;
  width: number;
  height: number;
  droppedFrameCount: number;
  maxBufferSize: number;
  totalKeystrokes: number;
  pasteCount: number;
  idleFrameCount: number;
  activeFrameCount: number;
  totalActivityMarkers: number;
  markersInMemory: number;
  activityMarkers: ActivityMarker[];
}

