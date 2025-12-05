/**
 * Buffer Flusher
 * 
 * Handles flushing remaining frames from buffer before finalization.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { EncoderProcess } from "./encoder-process";
import { FrameBufferProcessor } from "./frame-buffer";
import { ActivityTracker } from "./activity-tracker";

/**
 * Flush remaining frames from buffer
 */
export async function flushBuffer(
  frameBufferProcessor: FrameBufferProcessor,
  encoderProcess: EncoderProcess | null,
  activityTracker: ActivityTracker | null,
  isFinalized: boolean
): Promise<void> {
  // Process remaining buffered frames before finalizing
  while (
    frameBufferProcessor.getBufferSize() > 0 &&
    encoderProcess?.isRunning()
  ) {
    if (encoderProcess && activityTracker) {
      await frameBufferProcessor.processBuffer(
        encoderProcess,
        activityTracker,
        isFinalized
      );
    }
    if (frameBufferProcessor.getBufferSize() > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

