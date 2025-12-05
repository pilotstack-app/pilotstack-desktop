/**
 * Encoder Finalizer
 * 
 * Handles finalization logic for streaming encoder.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { logger } from "../../utils/logger";
import { EncoderProcess } from "./encoder-process";
import { FrameBufferProcessor } from "./frame-buffer";
import { StreamingEncoderMetadata } from "./types";

/**
 * Finalize encoder process
 */
export async function finalizeEncoder(
  encoderProcess: EncoderProcess | null,
  frameBufferProcessor: FrameBufferProcessor,
  startTime: number | null,
  calculateTimeout: () => number,
  getMetadata: () => StreamingEncoderMetadata,
  saveMetadata: (metadata: StreamingEncoderMetadata) => Promise<void>
): Promise<StreamingEncoderMetadata> {
  const recordingDurationSeconds = startTime
    ? (Date.now() - startTime) / 1000
    : 0;

  const frameCount = frameBufferProcessor.getFrameCount();
  const bufferSize = frameBufferProcessor.getBufferSize();

  logger.info("Finalizing StreamingEncoder", {
    frameCount,
    bufferedFrames: bufferSize,
    recordingDurationMinutes: (recordingDurationSeconds / 60).toFixed(1),
    segmentCount: (encoderProcess?.getCurrentSegmentIndex() || 0) + 1,
  });

  // Process any remaining buffered frames
  const maxBufferAttempts = Math.max(
    50,
    Math.ceil(recordingDurationSeconds / 60)
  );
  let bufferAttempts = 0;

  while (
    frameBufferProcessor.getBufferSize() > 0 &&
    encoderProcess?.isRunning() &&
    bufferAttempts < maxBufferAttempts
  ) {
    // Note: This requires activityTracker which is handled in the main class
    // For now, we'll just wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));
    bufferAttempts++;

    if (bufferAttempts % 20 === 0) {
      logger.debug("Flushing buffer progress", {
        attempts: bufferAttempts,
        remaining: frameBufferProcessor.getBufferSize(),
      });
    }
  }

  if (
    bufferAttempts >= maxBufferAttempts &&
    frameBufferProcessor.getBufferSize() > 0
  ) {
    logger.warn("Could not flush all buffered frames", {
      remaining: frameBufferProcessor.getBufferSize(),
      attempts: bufferAttempts,
    });
  }

  // Close FFmpeg stdin to signal end of input
  return new Promise((resolve) => {
    const timeoutMs = calculateTimeout();
    const timeoutId = setTimeout(() => {
      logger.warn("FFmpeg finalization timeout, force killing", {
        frameCount,
        timeoutMs,
        recordingDurationMinutes: (recordingDurationSeconds / 60).toFixed(1),
      });
      if (encoderProcess) {
        encoderProcess.kill();
      }
      const metadata = getMetadata();
      saveMetadata(metadata).catch(() => {});
      resolve(metadata);
    }, timeoutMs);

    if (encoderProcess) {
      // End stdin and wait for process to close
      encoderProcess.endStdin();
      encoderProcess.close().then(() => {
        clearTimeout(timeoutId);
        const metadata = getMetadata();
        saveMetadata(metadata)
          .then(() => {
            logger.info("StreamingEncoder finalized", {
              frameCount,
              segmentCount: encoderProcess.getCurrentSegmentIndex() + 1,
              duration: metadata.duration,
              recordingDurationMinutes: (
                recordingDurationSeconds / 60
              ).toFixed(1),
            });
            resolve(metadata);
          })
          .catch((error) => {
            logger.warn("Failed to save metadata, but finalizing anyway", {
              error: error.message,
            });
            resolve(metadata);
          });
      });
    } else {
      clearTimeout(timeoutId);
      const metadata = getMetadata();
      saveMetadata(metadata).catch(() => {});
      resolve(metadata);
    }
  });
}

