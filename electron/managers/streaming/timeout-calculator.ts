/**
 * Timeout Calculator
 * 
 * Calculates dynamic timeouts for encoder finalization.
 * Extracted from streaming-encoder.ts to keep file sizes under 300 lines.
 */

import { logger } from "../../utils/logger";

/**
 * Calculate dynamic timeout based on recording duration
 * 
 * For long recordings (7-8 hours), we need much more time for FFmpeg to finalize.
 * Base timeout: 30 seconds for short recordings
 * Add 30 seconds per hour of recording for longer sessions
 * Minimum 10 seconds, maximum 10 minutes
 */
export function calculateFinalizationTimeout(
  startTime: number | null,
  frameCount: number
): number {
  const recordingDurationSeconds = startTime
    ? (Date.now() - startTime) / 1000
    : 0;
  const recordingDurationHours = recordingDurationSeconds / 3600;

  const baseTimeout = 30000; // 30 seconds
  const perHourTimeout = 30000; // 30 seconds per hour
  const minTimeout = 10000; // 10 seconds
  const maxTimeout = 600000; // 10 minutes

  let timeout = baseTimeout + recordingDurationHours * perHourTimeout;
  timeout = Math.max(minTimeout, Math.min(maxTimeout, timeout));

  logger.debug("Calculated finalization timeout", {
    recordingDurationHours: recordingDurationHours.toFixed(2),
    timeoutMs: timeout,
    frameCount,
  });

  return timeout;
}

