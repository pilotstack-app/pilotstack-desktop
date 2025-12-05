/**
 * Tray Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §6 - Tray Menu
 * 
 * Manages system tray menu.
 * Maps to: main.js tray menu section
 */

import { app, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import { AppContext } from "../../core/app-context";
import { logger } from "../../utils/logger";

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Tray Manager
 * 
 * Manages system tray icon and context menu.
 */
export class TrayManager {
  private context: AppContext;
  private tray: Tray | null = null;

  constructor(context: AppContext) {
    this.context = context;
  }

  /**
   * Create tray menu
   * 
   * Creates the system tray icon and initializes the context menu.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §6 - Tray Menu
   */
  createTray(): void {
    if (this.tray) {
      return; // Already created
    }

    const iconPath = path.join(__dirname, "../../../assets/icon.png");
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip("pilotstack");

    // Handle tray click - show window
    this.tray.on("click", () => {
      const windowManager = this.context.getWindowManager();
      windowManager.showWindow();
    });

    // Initial menu update
    this.updateTray();

    logger.info("Tray menu created");
  }

  /**
   * Update tray menu
   * 
   * Updates the tray context menu based on current application state.
   */
  updateTray(): void {
    if (!this.tray) return;

    const windowManager = this.context.getWindowManager();
    const captureManager = this.context.getCaptureManager();
    const activityManager = this.context.getActivityManager();
    const sessionManager = this.context.getSessionManager();
    const clipboardMonitor = this.context.getClipboardMonitor();
    const mainWindow = windowManager.getMainWindow();

    const captureState = captureManager.getState();
    const isRecording = captureState.isRecording;
    const frames = captureState.frameCount || 0;
    const activityStats = activityManager.getStats();
    const isPaused = activityStats.isPaused || false;

    const isGhostMode = windowManager.isInGhostMode();

    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // Ghost mode toggle
    menuItems.push({
      label: isGhostMode ? "👻 Ghost Mode (Active)" : "👁 Show Window",
      click: () => {
        if (isGhostMode) {
          windowManager.exitGhostMode();
        } else {
          windowManager.showWindow();
        }
      },
    });

    menuItems.push({ type: "separator" });

    if (isRecording) {
      menuItems.push({
        label: isPaused
          ? `⏸ Paused (${frames} frames)`
          : `🔴 Recording (${frames} frames)`,
        enabled: false,
      });

      if (isPaused) {
        menuItems.push({
          label: "▶️ Resume Recording",
          click: async () => {
            activityManager.resume();
            this.updateTray();
          },
        });
      } else {
        menuItems.push({
          label: "⏸ Pause Recording",
          click: async () => {
            activityManager.pause();
            this.updateTray();
          },
        });
      }

      menuItems.push({
        label: "⏹ Stop Recording",
        click: async () => {
          const result = await captureManager.stop();
          clipboardMonitor.stop();
          activityManager.stop();

          if (mainWindow) {
            mainWindow.webContents.send("recording:emergency-stopped", result);
          }
          this.updateTray();
        },
      });

      menuItems.push({ type: "separator" });

      // Activity stats
      const stats = activityManager.getStats();
      menuItems.push({
        label: `📊 Active: ${formatDuration(stats.activeDuration)}`,
        enabled: false,
      });

      const pasteCount = clipboardMonitor.getPasteEvents().length;
      if (pasteCount > 0) {
        menuItems.push({
          label: `📋 Pastes: ${pasteCount}`,
          enabled: false,
        });
      }

      menuItems.push({ type: "separator" });
    }

    // Session recovery
    const recoverable = sessionManager.getRecoverableSession();
    if (recoverable && !isRecording) {
      menuItems.push({
        label: `🔄 Recover Session (${recoverable.actualFrameCount} frames)`,
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send("session:recovery-available", recoverable);
          } else {
            windowManager.createWindow();
          }
        },
      });
      menuItems.push({ type: "separator" });
    }

    // Enter ghost mode option
    if (!isGhostMode && mainWindow) {
      menuItems.push({
        label: "👻 Enter Ghost Mode",
        click: () => {
          windowManager.enterGhostMode();
        },
      });
      menuItems.push({ type: "separator" });
    }

    menuItems.push({
      label: "Quit pilotstack",
      click: () => {
        windowManager.setQuitting(true);
        app.quit();
      },
    });

    this.tray.setContextMenu(Menu.buildFromTemplate(menuItems));

    // Update tooltip
    let tooltip = "pilotstack";
    if (isRecording) {
      tooltip = isPaused
        ? `pilotstack - Paused (${frames} frames)`
        : `pilotstack - Recording (${frames} frames)`;
    }
    if (isGhostMode) {
      tooltip += " 👻";
    }
    this.tray.setToolTip(tooltip);

    // Update dock badge on macOS
    this.updateDockBadge(isRecording, isPaused);
  }

  /**
   * Update dock badge to show recording status (macOS only)
   * Shows a red dot when recording, clears when stopped
   */
  private updateDockBadge(isRecording: boolean, isPaused: boolean = false): void {
    if (process.platform !== "darwin") {
      return; // Dock badge is macOS only
    }

    try {
      if (isRecording) {
        // Show recording indicator - use "●" for recording, "❙❙" for paused
        app.dock.setBadge(isPaused ? "❙❙" : "●");
      } else {
        // Clear badge when not recording
        app.dock.setBadge("");
      }
    } catch (error) {
      // Dock may not be available (e.g., in ghost mode when dock is hidden)
      // This is fine, just ignore the error
    }
  }

  /**
   * Get tray instance
   * 
   * @returns Tray instance or null
   */
  getTray(): Tray | null {
    return this.tray;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

