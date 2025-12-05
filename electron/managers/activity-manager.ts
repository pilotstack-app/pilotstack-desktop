/**
 * Activity Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - Activity Monitoring
 * 
 * Monitors system idle time and calculates active vs idle duration.
 * Maps to: handlers/activity.js ActivityManager class
 */

import { powerMonitor, screen, BrowserWindow } from "electron";
import { AppContext } from "../core/app-context";
import { logger } from "../utils/logger";

// Constants
const IDLE_THRESHOLD_SECONDS = 30;
const CHECK_INTERVAL_MS = 1000;
const MIN_MOUSE_MOVEMENT = 5;

/**
 * Idle period
 */
export interface IdlePeriod {
  start: number;
  end: number;
  duration: number;
}

/**
 * Activity statistics
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ActivityManager
 */
export interface ActivityStats {
  totalDuration: number;
  activeDuration: number;
  idlePeriods: IdlePeriod[];
  idleCount: number;
  isCurrentlyIdle: boolean;
  isPaused: boolean;
}

/**
 * Activity Manager
 * 
 * Monitors user activity and detects idle periods.
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ActivityManager
 */
export class ActivityManager {
  private context: AppContext;
  private isMonitoring: boolean = false;
  private isPaused: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  // Stats
  private startTime: number | null = null;
  private activeDuration: number = 0;
  private lastActiveTime: number | null = null;
  private idlePeriods: IdlePeriod[] = [];
  private currentIdleStart: number | null = null;

  // Mouse tracking
  private lastMousePosition: { x: number; y: number } | null = null;

  constructor(context: AppContext) {
    this.context = context;
  }

  /**
   * Get main window for IPC communication
   */
  private getMainWindow(): BrowserWindow | null {
    try {
      return this.context.getWindowManager().getMainWindow();
    } catch (error) {
      logger.warn("Failed to get main window for activity manager", error);
      return null;
    }
  }

  /**
   * Start monitoring activity
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ActivityManager
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.lastActiveTime = Date.now();
    this.activeDuration = 0;
    this.idlePeriods = [];
    this.currentIdleStart = null;

    // Get initial mouse position
    try {
      const mousePos = screen.getCursorScreenPoint();
      this.lastMousePosition = { x: mousePos.x, y: mousePos.y };
    } catch (_e) {
      this.lastMousePosition = { x: 0, y: 0 };
    }

    // Start periodic check
    this.checkInterval = setInterval(
      () => this.checkActivity(),
      CHECK_INTERVAL_MS
    );

    logger.info("Activity monitoring started");
  }

  /**
   * Stop monitoring and return final stats
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ActivityManager
   */
  stop(): ActivityStats {
    if (!this.isMonitoring) return this.getStats();

    this.isMonitoring = false;

    // Clear interval - wrap in try/catch for safety
    try {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    } catch (e) {
      logger.warn("Error clearing activity check interval", e);
    }

    // Close any open idle period
    try {
      if (this.currentIdleStart !== null) {
        this.idlePeriods.push({
          start: this.currentIdleStart,
          end: Date.now(),
          duration: (Date.now() - this.currentIdleStart) / 1000,
        });
        this.currentIdleStart = null;
      }
    } catch (e) {
      logger.warn("Error closing idle period", e);
    }

    logger.info("Activity monitoring stopped");
    return this.getStats();
  }

  /**
   * Pause monitoring (but keep tracking time)
   */
  pause(): void {
    this.isPaused = true;

    // Start an idle period if not already in one
    if (this.currentIdleStart === null) {
      this.currentIdleStart = Date.now();
    }
  }

  /**
   * Resume monitoring
   */
  resume(): void {
    this.isPaused = false;

    // End any idle period from pause
    if (this.currentIdleStart !== null) {
      this.idlePeriods.push({
        start: this.currentIdleStart,
        end: Date.now(),
        duration: (Date.now() - this.currentIdleStart) / 1000,
      });
      this.currentIdleStart = null;
    }

    this.lastActiveTime = Date.now();
  }

  /**
   * Check current activity level
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ActivityManager
   */
  private checkActivity(): void {
    if (!this.isMonitoring || this.isPaused) return;

    const now = Date.now();

    // Get system idle time
    const systemIdleSeconds = powerMonitor.getSystemIdleTime();

    // Check mouse movement
    let mouseActive = false;
    try {
      const mousePos = screen.getCursorScreenPoint();
      if (this.lastMousePosition) {
        const dx = Math.abs(mousePos.x - this.lastMousePosition.x);
        const dy = Math.abs(mousePos.y - this.lastMousePosition.y);
        mouseActive = dx > MIN_MOUSE_MOVEMENT || dy > MIN_MOUSE_MOVEMENT;
      }
      this.lastMousePosition = { x: mousePos.x, y: mousePos.y };
    } catch (_e) {
      // Ignore mouse tracking errors
    }

    // Determine if user is idle
    const isIdle = systemIdleSeconds >= IDLE_THRESHOLD_SECONDS && !mouseActive;

    if (isIdle) {
      // User is idle
      if (this.currentIdleStart === null) {
        // Start new idle period
        this.currentIdleStart = now - systemIdleSeconds * 1000;

        // Notify renderer of idle detection
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("activity:idle-start", {
            timestamp: this.currentIdleStart,
            idleSeconds: systemIdleSeconds,
          });
        }
      }
    } else {
      // User is active
      if (this.currentIdleStart !== null) {
        // End idle period
        this.idlePeriods.push({
          start: this.currentIdleStart,
          end: now,
          duration: (now - this.currentIdleStart) / 1000,
        });

        // Notify renderer of idle end
        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("activity:idle-end", {
            duration: (now - this.currentIdleStart) / 1000,
          });
        }

        this.currentIdleStart = null;
      }

      // Update active duration
      if (this.lastActiveTime) {
        const timeSinceLastActive = (now - this.lastActiveTime) / 1000;
        if (timeSinceLastActive < IDLE_THRESHOLD_SECONDS) {
          this.activeDuration += CHECK_INTERVAL_MS / 1000;
        }
      }

      this.lastActiveTime = now;
    }
  }

  /**
   * Get current activity stats
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ActivityManager
   */
  getStats(): ActivityStats {
    const now = Date.now();
    const totalDuration = this.startTime ? (now - this.startTime) / 1000 : 0;

    // Use the tracked activeDuration that's incremented during checkActivity()
    // Add any uncounted active time since the last check (if not currently idle)
    let finalActiveDuration = this.activeDuration;
    if (this.currentIdleStart === null && this.lastActiveTime !== null && !this.isPaused) {
      // User is currently active - add time since last check interval
      const timeSinceLastCheck = (now - this.lastActiveTime) / 1000;
      if (timeSinceLastCheck < IDLE_THRESHOLD_SECONDS) {
        finalActiveDuration += timeSinceLastCheck;
      }
    }

    // Ensure active duration doesn't exceed total duration
    finalActiveDuration = Math.min(finalActiveDuration, totalDuration);

    return {
      totalDuration: Math.round(totalDuration),
      activeDuration: Math.round(Math.max(0, finalActiveDuration)),
      idlePeriods: this.idlePeriods.map((p) => ({
        start: p.start,
        end: p.end,
        duration: Math.round(p.duration),
      })),
      idleCount: this.idlePeriods.length,
      isCurrentlyIdle: this.currentIdleStart !== null,
      isPaused: this.isPaused,
    };
  }

  /**
   * Check if currently idle
   */
  isIdle(): boolean {
    return this.currentIdleStart !== null;
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.startTime = null;
    this.activeDuration = 0;
    this.lastActiveTime = null;
    this.idlePeriods = [];
    this.currentIdleStart = null;
    this.lastMousePosition = null;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();
    this.reset();
  }
}

