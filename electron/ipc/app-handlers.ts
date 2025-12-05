/**
 * App IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - IPC Handlers
 *
 * Handles general application IPC requests (window, shell, store, logger, etc.).
 * Maps to: main.js app IPC handlers section
 */

import { shell, app } from "electron";
import { AppContext } from "../core/app-context";
import { store } from "../config/store";
import { logger } from "../utils/logger";
import { handleWithValidation, handleNoArgs, handleWithSimpleValidation } from "./validation";
import {
  shellOpenPathSchema,
  storeGetSchema,
  storeSetSchema,
  loggerGetRecentSchema,
} from "./schemas";

/**
 * Register app IPC handlers
 */
export function registerAppHandlers(context: AppContext): void {
  // app:get-performance-info - Get performance information
  // Maps to: main.js app:get-performance-info handler
  handleNoArgs("app:get-performance-info", () => {
    const captureManager = context.getCaptureManager();
    const state = captureManager.getState();
    // droppedFrames may not be in the state interface, so we safely access it
    const droppedFrames =
      "droppedFrames" in state ? (state as { droppedFrames?: number }).droppedFrames : 0;
    return {
      platform: process.platform,
      arch: process.arch,
      droppedFrames: droppedFrames || 0,
      totalFrames: state.frameCount || 0,
    };
  });

  // app:is-packaged - Check if app is packaged
  // Maps to: main.js app:is-packaged handler
  handleNoArgs("app:is-packaged", () => app.isPackaged);

  // window:minimize - Minimize window
  // Maps to: main.js window:minimize handler
  handleNoArgs("window:minimize", () => {
    const windowManager = context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    mainWindow?.minimize();
  });

  // window:maximize - Maximize/unmaximize window
  // Maps to: main.js window:maximize handler
  handleNoArgs("window:maximize", () => {
    const windowManager = context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  // window:close - Close window
  // Maps to: main.js window:close handler
  handleNoArgs("window:close", () => {
    const windowManager = context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    mainWindow?.close();
  });

  // shell:open-path - Open path in file manager
  // Maps to: main.js shell:open-path handler
  handleWithSimpleValidation("shell:open-path", shellOpenPathSchema, (_event, path) => {
    shell.showItemInFolder(path);
  });

  // shell:open-file - Open file
  // Maps to: main.js shell:open-file handler
  handleWithSimpleValidation("shell:open-file", shellOpenPathSchema, (_event, path) => {
    shell.openPath(path);
  });

  // store:get - Get store value
  // Maps to: main.js store:get handler
  handleWithSimpleValidation("store:get", storeGetSchema, (_event, key) => store.get(key));

  // store:set - Set store value
  // Maps to: main.js store:set handler
  handleWithValidation("store:set", storeSetSchema, (_event, { key, value }) => {
    store.set(key, value);
    return true;
  });

  // logger:get-recent - Get recent logs
  // Maps to: main.js logger:get-recent handler
  handleWithSimpleValidation("logger:get-recent", loggerGetRecentSchema, (_event, lines) =>
    logger.getRecentLogs(lines)
  );

  // logger:get-log-file - Get log file path
  // Maps to: main.js logger:get-log-file handler
  handleNoArgs("logger:get-log-file", () => logger.getLogFilePath());

  // logger:get-all-logs - Get all log files
  // Maps to: main.js logger:get-all-logs handler
  handleNoArgs("logger:get-all-logs", () => logger.getAllLogFiles());

  // logger:clear-logs - Clear logs
  // Maps to: main.js logger:clear-logs handler
  handleNoArgs("logger:clear-logs", () => logger.clearLogs());
}
