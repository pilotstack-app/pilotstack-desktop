/**
 * IPC Handler Registration
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - IPC Handlers
 * 
 * Registers all IPC handlers with the main process.
 * Maps to: main.js IPC handler registration section
 */

import { ipcMain } from "electron";
import { AppContext } from "../core/app-context";
import { registerCaptureHandlers } from "./capture-handlers";
import { registerVideoHandlers } from "./video-handlers";
import { registerSessionHandlers } from "./session-handlers";
import { registerActivityHandlers } from "./activity-handlers";
import { registerAuthHandlers } from "./auth-handlers";
import { registerRecordingsHandlers } from "./recordings-handlers";
import { registerCloudHandlers } from "./cloud-handlers";
import { registerAppHandlers } from "./app-handlers";

/**
 * Register all IPC handlers
 */
export function registerAllHandlers(context: AppContext): void {
  registerCaptureHandlers(context);
  registerVideoHandlers(context);
  registerSessionHandlers(context);
  registerActivityHandlers(context);
  registerAuthHandlers(context);
  registerRecordingsHandlers(context);
  registerCloudHandlers(context);
  registerAppHandlers(context);
}

/**
 * Unregister all IPC handlers
 */
export function unregisterAllHandlers(): void {
  // Remove all IPC handlers
  // This is useful for cleanup during testing or shutdown
  ipcMain.removeAllListeners();
}

