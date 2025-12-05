/**
 * Process Lifecycle Manager
 * 
 * Handles process lifecycle operations (close, kill, endStdin).
 * Extracted from encoder-process.ts to keep file sizes under 300 lines.
 */

import { ChildProcess } from "child_process";
import { logger } from "../../utils/logger";

/**
 * End stdin stream (signal end of input)
 */
export function endStdin(process: ChildProcess | null): void {
  if (process?.stdin && !process.stdin.destroyed) {
    try {
      process.stdin.end();
    } catch (error: any) {
      logger.warn("Error ending FFmpeg stdin", {
        error: error.message,
      });
    }
  }
}

/**
 * Close process gracefully
 */
export async function closeProcess(process: ChildProcess | null): Promise<void> {
  if (!process) {
    return;
  }

  // End stdin first
  endStdin(process);

  // Wait for process to close naturally
  return new Promise((resolve) => {
    if (!process) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      if (process && !process.killed) {
        logger.warn("FFmpeg process did not close, force killing");
        try {
          process.kill("SIGKILL");
        } catch (e) {
          // Ignore errors
        }
      }
      resolve();
    }, 5000);

    process.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/**
 * Kill process forcefully
 */
export function killProcess(process: ChildProcess | null): void {
  if (!process) {
    return;
  }

  try {
    // Close stdin first
    if (process.stdin && !process.stdin.destroyed) {
      process.stdin.destroy();
    }

    // Remove all listeners
    process.removeAllListeners();
    if (process.stdin) {
      process.stdin.removeAllListeners();
    }
    if (process.stderr) {
      process.stderr.removeAllListeners();
    }

    // Kill the process
    if (!process.killed) {
      process.kill("SIGTERM");
      setTimeout(() => {
        if (process && !process.killed) {
          process.kill("SIGKILL");
        }
      }, 2000);
    }
  } catch (e: any) {
    logger.warn("Error killing FFmpeg process", { error: e.message });
  }
}

