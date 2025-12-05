/**
 * Metadata Builder
 * 
 * Builds metadata objects for streaming encoder.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { ActivityTracker } from "./activity-tracker";
import { FrameBufferProcessor } from "./frame-buffer";
import { StreamingEncoderMetadata } from "./types";
import { HLSWriter } from "./hls-writer";
import { EncoderProcess } from "./encoder-process";

/**
 * Build metadata object for streaming encoder
 */
export function buildMetadata(
  outputDir: string,
  frameRate: number,
  segmentDuration: number,
  width: number,
  height: number,
  maxBufferSize: number,
  startTime: number | null,
  frameBufferProcessor: FrameBufferProcessor,
  activityTracker: ActivityTracker | null,
  hlsWriter: HLSWriter | null,
  encoderProcess: EncoderProcess | null
): StreamingEncoderMetadata {
  const frameCount = frameBufferProcessor.getFrameCount();
  const lastFrameTime = frameBufferProcessor.getLastFrameTime();
  const endTime = lastFrameTime || Date.now();
  const duration = startTime ? (endTime - startTime) / 1000 : 0;

  const aggregates = activityTracker?.getAggregates() || {
    totalKeystrokes: 0,
    pasteCount: 0,
    idleFrameCount: 0,
    activeFrameCount: 0,
  };

  const sampledMarkers =
    activityTracker?.getSampledMarkersForMetadata(1000) || [];

  return {
    playlistPath: hlsWriter?.getPlaylistPath() || "",
    segmentPattern: hlsWriter?.getSegmentPattern() || "",
    outputDir,
    frameCount,
    frameRate,
    segmentCount: (encoderProcess?.getCurrentSegmentIndex() || 0) + 1,
    segmentDuration,
    duration,
    startTime,
    endTime,
    width,
    height,
    droppedFrameCount: frameBufferProcessor.getDroppedFrameCount(),
    maxBufferSize,
    totalKeystrokes: aggregates.totalKeystrokes,
    pasteCount: aggregates.pasteCount,
    idleFrameCount: aggregates.idleFrameCount,
    activeFrameCount: aggregates.activeFrameCount,
    totalActivityMarkers: frameCount,
    markersInMemory: activityTracker?.getMarkers().length || 0,
    activityMarkers: sampledMarkers,
  };
}

