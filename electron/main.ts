/**
 * Main Process Entry Point
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §Entry Point
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Refactoring Recommendations §1
 * 
 * Clean entry point that orchestrates all systems.
 * Should be ~100 lines (orchestration only).
 * Maps to: main.js (2772 lines - to be replaced)
 */

import { app } from "electron";
import * as path from "path";
import { AppContext } from "./core/app-context";
import { registerAllHandlers } from "./ipc";
import { logger } from "./utils/logger";

const isDev = !app.isPackaged;
const PROTOCOL_SCHEME = "pilotstack";

// Application context (dependency injection container)
let appContext: AppContext | null = null;

/**
 * Register protocol handler for deep links
 *
 * Ensures the pilotstack:// scheme is bound to THIS app (not a stale/global Electron).
 */
function registerProtocolHandler(): void {
  // Clear any stale registration
  app.removeAsDefaultProtocolClient(PROTOCOL_SCHEME);

  const exe = app.getPath("exe");

  if (process.defaultApp && process.argv.length >= 2) {
    // Dev mode: electron <entry>
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    // Packaged or normal case
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, exe);
  }

  logger.info("Protocol handler registered", {
    scheme: PROTOCOL_SCHEME,
    exe,
    isDefault: app.isDefaultProtocolClient(PROTOCOL_SCHEME),
  });
}

/**
 * Handle deep link passed on first launch (Windows/Linux primary instance)
 */
function handleInitialDeepLink(): void {
  const url = process.argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
  if (url && appContext) {
    const deepLinkHandler = appContext.getDeepLinkHandler();
    deepLinkHandler.handleDeepLink(url).catch((error) => {
      logger.error("Failed to handle initial deep link", { error: error.message, url });
    });
  }
}

/**
 * Initialize application
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §Entry Point
 */
async function initializeApp(): Promise<void> {
  // Log startup info
  logger.info("pilotstack starting", {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
  });

  // Create application context
  appContext = new AppContext();

  // Register IPC handlers
  registerAllHandlers(appContext);

  // Initialize window manager and create window
  const windowManager = appContext.getWindowManager();
  windowManager.createWindow();

  // Initialize tray manager
  const trayManager = appContext.getTrayManager();
  trayManager.createTray();

  // Initialize deep link handler and register protocol
  appContext.getDeepLinkHandler(); // Initialize handler
  registerProtocolHandler();
  handleInitialDeepLink();

  // Start token refresh timer
  const authService = appContext.getAuthService();
  authService.startTokenRefreshTimer();

  // Initialize auto-updater (only in production)
  if (!isDev) {
    const updateManager = appContext.getUpdateManager();
    updateManager.initialize();
  }
}

/**
 * Handle app ready
 */
app.whenReady().then(() => {
  initializeApp().catch((error) => {
    logger.error("Failed to initialize app", { error: error.message });
    console.error("Failed to initialize app:", error);
  });
});

/**
 * Log current protocol binding state early so we can diagnose "wrong app opens" issues.
 */
logger.info("Protocol client status on startup", {
  scheme: PROTOCOL_SCHEME,
  exe: app.getPath("exe"),
  isDefault: app.isDefaultProtocolClient(PROTOCOL_SCHEME),
  argv: process.argv.slice(0, 4),
});

/**
 * Handle app window all closed
 * 
 * On macOS, keep app running even when all windows are closed.
 * On other platforms, keep running in tray (don't quit).
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §Entry Point
 */
app.on("window-all-closed", () => {
  // On macOS, keep app running even when all windows are closed
  // On other platforms, keep running in tray (don't quit)
  if (process.platform !== "darwin") {
    // Don't quit - keep running in tray
    // Only quit if explicitly requested via quit menu
  }
});

/**
 * Handle app activate (macOS)
 * 
 * Recreate window on macOS when dock icon is clicked.
 * Handles ghost mode exit if active.
 */
app.on("activate", () => {
  if (!appContext) {
    initializeApp().catch((error) => {
      logger.error("Failed to initialize app on activate", { error: error.message });
    });
    return;
  }

  const windowManager = appContext.getWindowManager();
  const mainWindow = windowManager.getMainWindow();

  // Exit ghost mode if active
  if (windowManager.isInGhostMode()) {
    windowManager.exitGhostMode();
  } else if (!mainWindow) {
    // Recreate window if it doesn't exist
    windowManager.createWindow();
  } else {
    // Show and focus existing window
    windowManager.showWindow();
  }
});

/**
 * Handle app before quit
 * 
 * Cleanup all resources before app quits.
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §8 - Memory Leaks
 */
app.on("before-quit", async () => {
  // Mark as quitting to prevent window close handlers from interfering
  if (appContext) {
    const windowManager = appContext.getWindowManager();
    windowManager.setQuitting(true);
  }

  // Cleanup resources
  if (appContext) {
    await appContext.cleanup();
  }
});

/**
 * Handle deep link (OAuth callback) - macOS
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §4 - Deep Linking (OAuth)
 */
app.on("open-url", (event, url) => {
  event.preventDefault();
  logger.info("open-url event received", {
    url,
    exe: app.getPath("exe"),
    isDefault: app.isDefaultProtocolClient(PROTOCOL_SCHEME),
  });
  if (appContext) {
    const deepLinkHandler = appContext.getDeepLinkHandler();
    deepLinkHandler.handleDeepLink(url).catch((error) => {
      logger.error("Failed to handle deep link", { error: error.message, url });
    });
  }
});

/**
 * Handle single instance lock and deep links - Windows/Linux
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §4 - Deep Linking (OAuth)
 */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // Windows/Linux: deep link URL is in commandLine
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (url && appContext) {
      const deepLinkHandler = appContext.getDeepLinkHandler();
      deepLinkHandler.handleDeepLink(url).catch((error) => {
        logger.error("Failed to handle deep link", { error: error.message, url });
      });
    }

    // Focus main window if it exists
    if (appContext) {
      const windowManager = appContext.getWindowManager();
      const mainWindow = windowManager.getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        windowManager.showWindow();
      }
    }
  });
}

