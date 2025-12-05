/**
 * Window Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §1 - Window Management
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §7 - Ghost Mode
 * 
 * Manages window lifecycle and ghost mode.
 * Maps to: main.js window management section
 */

import { app, BrowserWindow } from "electron";
import * as path from "path";
import { AppContext } from "../../core/app-context";
import { logger } from "../../utils/logger";

/**
 * Window Manager
 * 
 * Handles window creation, lifecycle, and ghost mode functionality.
 */
export class WindowManager {
  private context: AppContext;
  private mainWindow: BrowserWindow | null = null;
  private isGhostMode: boolean = false;
  private isQuitting: boolean = false;
  private trayUpdateInterval: NodeJS.Timeout | null = null;

  constructor(context: AppContext) {
    this.context = context;
  }

  /**
   * Create main window
   * 
   * Creates the main application window with proper configuration.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §1 - Window Management
   * 
   * @returns Created BrowserWindow instance
   */
  createWindow(): BrowserWindow {
    if (this.mainWindow) {
      return this.mainWindow;
    }

    const isDev = !app.isPackaged;

    this.mainWindow = new BrowserWindow({
      width: 420,
      height: 680,
      minWidth: 380,
      minHeight: 600,
      frame: false,
      transparent: false,
      backgroundColor: "#0a0a0f",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, "../../preload.js"),
        backgroundThrottling: false,
      },
      icon: path.join(__dirname, "../../../assets/icon.png"),
    });

    // Setup window event handlers
    this.setupWindowHandlers();

    // Load content
    if (isDev) {
      this.mainWindow.loadURL("http://localhost:5173");
      this.mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      this.mainWindow.loadFile(path.join(__dirname, "../../../dist/index.html"));
    }

    // Setup periodic updates during recording
    this.setupPeriodicUpdates();

    logger.info("Main window created");

    return this.mainWindow;
  }

  /**
   * Setup window event handlers
   */
  private setupWindowHandlers(): void {
    if (!this.mainWindow) return;

    // Handle window close - minimize to tray instead of closing (unless quitting)
    this.mainWindow.on("close", (event) => {
      if (!this.isQuitting) {
        event.preventDefault();

        const captureManager = this.context.getCaptureManager();
        const state = captureManager.getState();
        // If recording, enter ghost mode
        if (state.isRecording) {
          this.enterGhostMode();
        } else {
          this.mainWindow?.hide();
        }
      }
    });

    // Handle window closed
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    // Handle window ready
    this.mainWindow.webContents.on("did-finish-load", () => {
      this.onWindowReady();
    });
  }

  /**
   * Handle window ready event
   */
  private onWindowReady(): void {
    if (!this.mainWindow) return;

    const sessionManager = this.context.getSessionManager();
    const captureManager = this.context.getCaptureManager();
    const store = require("../../config/store").store;

    // Check for recoverable session
    const recoverable = sessionManager.getRecoverableSession();
    if (recoverable) {
      this.mainWindow.webContents.send("session:recovery-available", recoverable);
    }

    // Sync recording state if active
    const captureState = captureManager.getState();
    if (captureState.isRecording) {
      this.mainWindow.webContents.send("recording:state-sync", captureState);
    }

    // Send auth status
    const deviceToken = store.get("deviceToken");
    if (deviceToken) {
      this.mainWindow.webContents.send("auth:status", {
        isConnected: true,
        tokenTimestamp: store.get("deviceTokenTimestamp"),
      });
    }
  }

  /**
   * Setup periodic updates during recording
   */
  private setupPeriodicUpdates(): void {
    // Clear existing interval if any
    if (this.trayUpdateInterval) {
      clearInterval(this.trayUpdateInterval);
    }

    // Setup periodic tray updates during recording
    this.trayUpdateInterval = setInterval(() => {
      const captureManager = this.context.getCaptureManager();
      const state = captureManager.getState();
      if (state.isRecording) {
        const trayManager = this.context.getTrayManager();
        trayManager.updateTray();
      }
    }, 5000);
  }

  /**
   * Enter ghost mode - hide window, continue running in background
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §7 - Ghost Mode
   */
  enterGhostMode(): void {
    this.isGhostMode = true;

    if (this.mainWindow) {
      this.mainWindow.hide();
    }

    // Hide dock icon on macOS
    if (process.platform === "darwin") {
      app.dock.hide();
    }

    // Update tray menu
    const trayManager = this.context.getTrayManager();
    trayManager.updateTray();

    logger.info("Entered ghost mode");
  }

  /**
   * Exit ghost mode - show window
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §7 - Ghost Mode
   */
  exitGhostMode(): void {
    this.isGhostMode = false;

    // Show dock icon on macOS
    if (process.platform === "darwin") {
      app.dock.show();
    }

    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      this.createWindow();
    }

    // Update tray menu
    const trayManager = this.context.getTrayManager();
    trayManager.updateTray();

    logger.info("Exited ghost mode");
  }

  /**
   * Toggle ghost mode
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §7 - Ghost Mode
   */
  toggleGhostMode(): void {
    if (this.isGhostMode) {
      this.exitGhostMode();
    } else {
      this.enterGhostMode();
    }
  }

  /**
   * Show window
   */
  showWindow(): void {
    if (this.isGhostMode) {
      this.exitGhostMode();
    } else if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      this.createWindow();
    }
  }

  /**
   * Hide window
   */
  hideWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * Get main window
   * 
   * @returns Main BrowserWindow instance or null
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Check if in ghost mode
   * 
   * @returns True if in ghost mode
   */
  isInGhostMode(): boolean {
    return this.isGhostMode;
  }

  /**
   * Set quitting flag
   * 
   * @param quitting - Whether app is quitting
   */
  setQuitting(quitting: boolean): void {
    this.isQuitting = quitting;
  }

  /**
   * Check if app is quitting
   * 
   * @returns True if app is quitting
   */
  isQuittingApp(): boolean {
    return this.isQuitting;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.trayUpdateInterval) {
      clearInterval(this.trayUpdateInterval);
      this.trayUpdateInterval = null;
    }

    if (this.mainWindow) {
      this.mainWindow = null;
    }
  }
}

