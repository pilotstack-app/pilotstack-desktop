/**
 * Activity IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Activity Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - Activity Monitoring
 *
 * Handles all activity monitoring-related IPC requests.
 * Maps to: main.js activity IPC handlers section
 */

import { AppContext } from "../core/app-context";
import { sanitizeForIPC } from "../utils/ipc-sanitizer";
import { handleNoArgs } from "./validation";

/**
 * Register activity IPC handlers
 */
export function registerActivityHandlers(context: AppContext): void {
  // activity:get-stats - Get activity statistics
  // Maps to: main.js activity:get-stats handler
  handleNoArgs("activity:get-stats", () => {
    const activityManager = context.getActivityManager();
    return sanitizeForIPC(activityManager?.getStats() || null);
  });

  // clipboard:get-events - Get paste events
  // Maps to: main.js clipboard:get-events handler
  handleNoArgs("clipboard:get-events", () => {
    const clipboardMonitor = context.getClipboardMonitor();
    return sanitizeForIPC(clipboardMonitor?.getPasteEvents() || []);
  });

  // keyboard:get-stats - Get keyboard statistics
  // Maps to: main.js keyboard:get-stats handler
  handleNoArgs("keyboard:get-stats", () => {
    const keyboardMonitor = context.getKeyboardMonitor();
    return sanitizeForIPC(keyboardMonitor?.getStats() || null);
  });

  // keyboard:get-activity-score - Get keyboard activity score
  // Maps to: main.js keyboard:get-activity-score handler
  handleNoArgs("keyboard:get-activity-score", () => {
    const keyboardMonitor = context.getKeyboardMonitor();
    return keyboardMonitor?.getActivityScore() || 0;
  });
}
