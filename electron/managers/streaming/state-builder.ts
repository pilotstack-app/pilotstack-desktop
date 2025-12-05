/**
 * State Builder
 * 
 * Builds encoder state objects.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { EncoderProcess } from "./encoder-process";
import { FrameBufferProcessor } from "./frame-buffer";

/**
 * Encoder state
 */
export interface EncoderState {
  isStarted: boolean;
  isFinalized: boolean;
  frameCount: number;
  currentSegmentIndex: number;
  bufferSize: number;
  duration: number;
  useHardwareEncoding: boolean;
}

/**
 * Build encoder state
 */
export function buildEncoderState(
  isStarted: boolean,
  isFinalized: boolean,
  startTime: number | null,
  frameBufferProcessor: FrameBufferProcessor,
  encoderProcess: EncoderProcess | null
): EncoderState {
  return {
    isStarted,
    isFinalized,
    frameCount: frameBufferProcessor.getFrameCount(),
    currentSegmentIndex: encoderProcess?.getCurrentSegmentIndex() || 0,
    bufferSize: frameBufferProcessor.getBufferSize(),
    duration: startTime ? (Date.now() - startTime) / 1000 : 0,
    useHardwareEncoding: encoderProcess?.isUsingHardwareEncoding() || false,
  };
}

