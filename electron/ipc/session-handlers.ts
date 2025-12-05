/**
 * Session IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Session Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
 *
 * Handles all session recovery-related IPC requests.
 * Maps to: main.js session IPC handlers section
 */

import { AppContext } from "../core/app-context";
import { logger } from "../utils/logger";
import { handleWithValidation, handleNoArgs } from "./validation";
import { sessionRecoverSchema } from "./schemas";

/**
 * Safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}

/**
 * Register session IPC handlers
 */
export function registerSessionHandlers(context: AppContext): void {
  // session:check-recovery - Check for recoverable session
  // Maps to: main.js session:check-recovery handler
  handleNoArgs("session:check-recovery", () => {
    const sessionManager = context.getSessionManager();
    return sessionManager.getRecoverableSession();
  });

  // session:clear-recovery - Clear recovery data
  // Maps to: main.js session:clear-recovery handler
  handleNoArgs("session:clear-recovery", () => {
    const sessionManager = context.getSessionManager();
    sessionManager.clearSession();
    return { success: true };
  });

  // session:recover - Recover interrupted session
  // Maps to: main.js session:recover handler
  handleWithValidation("session:recover", sessionRecoverSchema, async (_event, options) => {
    try {
      const videoManager = context.getVideoManager();
      const sessionManager = context.getSessionManager();

      // Use frame validator directly - accessing private property via type assertion
      // TODO: Add public method to VideoManager for frame validation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frameValidator = (videoManager as any).frameValidator as
        | {
            validateAndRenumberFrames: (
              folder: string,
              onProgress?: (progress: number, message: string) => void
            ) => Promise<{ validFrames: number; dimensions?: { width: number; height: number } }>;
          }
        | undefined;
      if (!frameValidator) {
        logger.error("Frame validator not available");
        return { success: false, error: "Frame validator not available" };
      }

      const validation = await frameValidator.validateAndRenumberFrames(options.sessionFolder);
      if (validation.validFrames === 0) {
        sessionManager.clearSession();
        return { success: false, error: "No valid frames found" };
      }

      sessionManager.clearSession();
      return {
        success: true,
        sessionFolder: options.sessionFolder,
        totalFrames: validation.validFrames,
        dimensions: validation.dimensions,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error("Session recovery failed", { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });
}
