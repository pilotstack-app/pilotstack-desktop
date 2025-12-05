/**
 * Session Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
 * 
 * Manages session recovery for interrupted recording sessions.
 * Maps to: handlers/session.js SessionManager class
 */

import * as fs from "fs";
import * as path from "path";
import { AppContext } from "../core/app-context";
import { SessionState } from "../config/types";
import { sessionStore } from "../config/store";
import { logger } from "../utils/logger";

/**
 * Recoverable session with actual frame count
 */
export interface RecoverableSession extends SessionState {
  actualFrameCount: number;
}

/**
 * Session Manager
 * 
 * Purpose: Recover interrupted recording sessions
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
 */
export class SessionManager {
  constructor(_context: AppContext) {
    // Context stored for potential future use
  }

  /**
   * Save session state
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
   */
  saveSession(sessionData: SessionState): void {
    sessionStore.set("session", sessionData);
    logger.debug("Session state saved", { sessionId: sessionData.sessionFolder });
  }

  /**
   * Clear session state
   */
  clearSession(): void {
    sessionStore.delete("session");
    logger.debug("Session state cleared");
  }

  /**
   * Check for recoverable session
   * 
   * Recovery Flow:
   * 1. Check for active session in store
   * 2. Verify session folder exists
   * 3. Count actual frames (supports both PNG and JPEG)
   * 4. Return session state if recoverable
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Recovery Flow
   */
  getRecoverableSession(): RecoverableSession | null {
    const session = sessionStore.get("session");

    if (!session || !session.isActive || !session.sessionFolder) {
      return null;
    }

    try {
      // Verify session folder exists
      if (!fs.existsSync(session.sessionFolder)) {
        this.clearSession();
        logger.warn("Session folder does not exist, clearing session", {
          sessionFolder: session.sessionFolder,
        });
        return null;
      }

      // Count actual frames (supports both PNG and JPEG, and streaming encoder HLS segments)
      const files = fs.readdirSync(session.sessionFolder);
      
      // Check for JPEG files first (new format)
      const jpgFiles = files.filter((f) => f.endsWith(".jpg") && /^frame_\d{6}\.jpg$/.test(f));
      const pngFiles = files.filter((f) => f.endsWith(".png") && /^frame_\d{6}\.png$/.test(f));
      
      const frameFiles = jpgFiles.length > 0 ? jpgFiles : pngFiles;

      // If no frame files, check for streaming encoder output (HLS segments)
      if (frameFiles.length === 0) {
        const playlistPath = path.join(session.sessionFolder, "playlist.m3u8");
        const hasPlaylist = fs.existsSync(playlistPath);
        const segmentFiles = files.filter((f) => f.endsWith(".ts"));
        
        if (hasPlaylist || segmentFiles.length > 0) {
          // Streaming encoder session - estimate from segments or use frameCount from session
          if (segmentFiles.length > 0) {
            const estimatedFrames = segmentFiles.length * 6 * 30; // 6 seconds per segment at 30fps
            return {
              ...session,
              actualFrameCount: session.frameCount || estimatedFrames,
            };
          }
          // Has playlist but no segments yet - use session frameCount if available
          if (session.frameCount && session.frameCount > 0) {
            return {
              ...session,
              actualFrameCount: session.frameCount,
            };
          }
        }
        
        // No frames or segments found
        this.clearSession();
        logger.warn("No frames found in session folder, clearing session", {
          sessionFolder: session.sessionFolder,
        });
        return null;
      }

      return {
        ...session,
        actualFrameCount: frameFiles.length,
      };
    } catch (error) {
      logger.error("Error checking recoverable session", error);
      this.clearSession();
      return null;
    }
  }

  /**
   * Check for recoverable session (async version for consistency)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Recovery Flow
   */
  async checkRecovery(): Promise<SessionState | null> {
    const recoverable = this.getRecoverableSession();
    return recoverable ? {
      sessionFolder: recoverable.sessionFolder,
      sourceId: recoverable.sourceId,
      startTime: recoverable.startTime,
      frameCount: recoverable.actualFrameCount,
      isActive: recoverable.isActive,
      lastHeartbeat: recoverable.lastHeartbeat,
    } : null;
  }

  /**
   * Recover session
   * 
   * Marks the session as active and ready for recovery.
   */
  async recover(sessionFolder: string): Promise<void> {
    const session = sessionStore.get("session");
    
    if (!session || session.sessionFolder !== sessionFolder) {
      throw new Error("Session not found or folder mismatch");
    }

    // Update session to mark as recovered
    const updatedSession: SessionState = {
      ...session,
      isActive: true,
      lastHeartbeat: Date.now(),
    };

    this.saveSession(updatedSession);
    logger.info("Session recovered", { sessionFolder });
  }

  /**
   * Clear recovery data
   */
  async clearRecovery(): Promise<void> {
    this.clearSession();
    logger.info("Recovery data cleared");
  }

  /**
   * Save session state
   * 
   * Alias for saveSession for consistency with async interface
   */
  async saveSessionState(state: SessionState): Promise<void> {
    this.saveSession(state);
  }

  /**
   * Update session heartbeat
   * 
   * Called periodically to keep session alive
   */
  updateHeartbeat(): void {
    const session = sessionStore.get("session");
    if (session && session.isActive) {
      this.saveSession({
        ...session,
        lastHeartbeat: Date.now(),
      });
    }
  }

  /**
   * Get current session state
   */
  getCurrentSession(): SessionState | null {
    return sessionStore.get("session") || null;
  }
}

