/**
 * Drain Handler
 * 
 * Handles stdin drain waiting for FFmpeg process.
 * Extracted from encoder-process.ts to keep file sizes under 300 lines.
 */

import { ChildProcess } from "child_process";
import { VideoError } from "../../core/app-error";

/**
 * Wait for stdin drain (buffer to empty)
 * 
 * @param process - Child process with stdin stream
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Promise that resolves when drain occurs or rejects on timeout
 */
export async function waitForDrain(
  process: ChildProcess,
  timeoutMs: number = 2000
): Promise<void> {
  if (!process || !process.stdin || process.killed) {
    throw new VideoError("Process not available for drain wait");
  }

  return new Promise((resolve, reject) => {
    if (!process || !process.stdin || process.killed) {
      reject(new VideoError("Stream not writable"));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      if (!process || process.killed) {
        reject(new VideoError("Process closed during drain wait"));
      } else {
        reject(new VideoError("Drain timeout"));
      }
    }, timeoutMs);

    const drainHandler = () => {
      cleanup();
      resolve();
    };

    const closeHandler = () => {
      cleanup();
      reject(new VideoError("Process closed during drain wait"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      if (process && process.stdin) {
        process.stdin.removeListener("drain", drainHandler);
      }
      if (process) {
        process.removeListener("close", closeHandler);
      }
    };

    process.once("close", closeHandler);
    process.stdin.once("drain", drainHandler);
  });
}

