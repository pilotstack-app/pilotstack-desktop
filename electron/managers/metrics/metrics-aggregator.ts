/**
 * Metrics Aggregator
 *
 * Centralized metrics collection from all monitors with disk persistence.
 * Writes metrics.json to session folder every 30s to prevent data loss.
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - Activity Monitoring
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";
import type {
  InputMetrics,
  ActivityStats,
  SessionMetrics,
  KeyboardMetrics,
  MouseMetrics,
  ClipboardMetrics,
} from "../../config/types";
import type { KeyboardStats } from "../../monitors/keyboard-monitor";
import type { ClipboardStats, PasteEvent } from "../../monitors/clipboard-monitor";
import type { ActivityStats as ActivityManagerStats } from "../activity-manager";

// Constants
const METRICS_FILE = "metrics.json";
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const METRICS_VERSION = 1;

// Thresholds for analysis
const SUSPICIOUS_WPM_THRESHOLD = 200;
const EXCESSIVE_PASTE_RATIO = 0.3; // > 30% of content from pastes is suspicious
const NATURAL_TYPING_MIN_BURSTS = 3;

/**
 * Default empty keyboard metrics
 */
function defaultKeyboardMetrics(): KeyboardMetrics {
  return {
    estimatedKeystrokes: 0,
    keyboardActiveTime: 0,
    estimatedWordsTyped: 0,
    typingBurstCount: 0,
    averageWPM: 0,
    peakWPM: 0,
    shortcutEstimate: 0,
    typingIntensity: 0,
  };
}

/**
 * Default empty mouse metrics
 */
function defaultMouseMetrics(): MouseMetrics {
  return {
    mouseClicks: 0,
    mouseDistance: 0,
    scrollEvents: 0,
  };
}

/**
 * Default empty clipboard metrics
 */
function defaultClipboardMetrics(): ClipboardMetrics {
  return {
    pasteEventCount: 0,
    totalPastedCharacters: 0,
    largePasteCount: 0,
    pasteTimestamps: [],
  };
}

/**
 * Default empty input metrics
 */
function defaultInputMetrics(): InputMetrics {
  return {
    keyboard: defaultKeyboardMetrics(),
    mouse: defaultMouseMetrics(),
    clipboard: defaultClipboardMetrics(),
    totalInputEvents: 0,
    sessionDuration: 0,
    lastActivityTime: null,
  };
}


/**
 * Metrics Aggregator
 *
 * Collects and persists all recording metrics.
 */
export class MetricsAggregator {
  private sessionFolder: string | null = null;
  private sessionId: string | null = null;
  private startTime: number | null = null;
  private endTime: number | null = null;
  private flushInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

  // Current metrics state
  private inputMetrics: InputMetrics = defaultInputMetrics();
  private pasteTimestamps: number[] = [];

  /**
   * Start aggregating metrics for a session
   */
  start(sessionFolder: string, sessionId: string): void {
    if (this.isActive) {
      this.stop();
    }

    this.sessionFolder = sessionFolder;
    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.endTime = null;
    this.isActive = true;

    // Reset metrics
    this.inputMetrics = defaultInputMetrics();
    this.pasteTimestamps = [];

    // Start periodic flush
    this.flushInterval = setInterval(() => {
      this.flushToDisk().catch((err) => {
        logger.warn("Failed to flush metrics to disk", { error: err.message });
      });
    }, FLUSH_INTERVAL_MS);

    logger.info("MetricsAggregator started", { sessionFolder, sessionId });
  }

  /**
   * Stop aggregating and perform final flush
   */
  async stop(): Promise<SessionMetrics | null> {
    if (!this.isActive) {
      return null;
    }

    this.isActive = false;
    this.endTime = Date.now();

    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    const metrics = await this.flushToDisk();

    logger.info("MetricsAggregator stopped", {
      sessionId: this.sessionId,
      duration: metrics?.activity.totalDuration,
    });

    return metrics;
  }

  /**
   * Update keyboard metrics from KeyboardMonitor
   */
  updateKeyboardMetrics(stats: KeyboardStats): void {
    if (!this.isActive) return;

    this.inputMetrics.keyboard = {
      estimatedKeystrokes: stats.estimatedKeystrokes,
      keyboardActiveTime: stats.keyboardActiveTime,
      estimatedWordsTyped: stats.estimatedWordsTyped,
      typingBurstCount: stats.typingBurstCount,
      averageWPM: stats.averageWPM,
      peakWPM: stats.peakWPM,
      shortcutEstimate: stats.shortcutEstimate,
      typingIntensity: stats.typingIntensity,
    };

    this.inputMetrics.mouse = {
      mouseClicks: stats.mouseClicks,
      mouseDistance: stats.mouseDistance,
      scrollEvents: stats.scrollEvents,
    };

    this.inputMetrics.totalInputEvents = stats.totalInputEvents;
    this.inputMetrics.sessionDuration = stats.sessionDuration;
    this.inputMetrics.lastActivityTime = stats.lastActivityTime;
  }

  /**
   * Update clipboard metrics from ClipboardMonitor
   */
  updateClipboardMetrics(stats: ClipboardStats, events: PasteEvent[]): void {
    if (!this.isActive) return;

    this.inputMetrics.clipboard = {
      pasteEventCount: stats.totalEvents,
      totalPastedCharacters: stats.totalSize,
      largePasteCount: stats.largeEvents,
      pasteTimestamps: events.map((e) => e.timestamp),
    };

    this.pasteTimestamps = events.map((e) => e.timestamp);
  }

  /**
   * Record a single paste event (incremental update)
   */
  recordPasteEvent(size: number, isLarge: boolean): void {
    if (!this.isActive) return;

    const now = Date.now();
    this.inputMetrics.clipboard.pasteEventCount++;
    this.inputMetrics.clipboard.totalPastedCharacters += size;
    if (isLarge) {
      this.inputMetrics.clipboard.largePasteCount++;
    }
    this.pasteTimestamps.push(now);
    this.inputMetrics.clipboard.pasteTimestamps = this.pasteTimestamps;
  }

  /**
   * Update activity metrics from ActivityManager
   */
  updateActivityMetrics(stats: ActivityManagerStats): void {
    if (!this.isActive) return;

    // Activity metrics are computed in buildActivityStats
    // We just need the raw duration values
    this.inputMetrics.sessionDuration = stats.totalDuration;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): SessionMetrics {
    return this.buildSessionMetrics();
  }

  /**
   * Get input metrics for upload
   */
  getInputMetrics(): InputMetrics {
    return { ...this.inputMetrics };
  }

  /**
   * Flush metrics to disk
   */
  async flushToDisk(): Promise<SessionMetrics | null> {
    if (!this.sessionFolder) {
      return null;
    }

    const metrics = this.buildSessionMetrics();
    const filePath = path.join(this.sessionFolder, METRICS_FILE);

    try {
      await fs.promises.writeFile(filePath, JSON.stringify(metrics, null, 2), "utf-8");
      logger.debug("Metrics flushed to disk", { filePath });
      return metrics;
    } catch (error: any) {
      logger.error("Failed to write metrics file", {
        error: error.message,
        filePath,
      });
      return null;
    }
  }

  /**
   * Load metrics from disk (for recovery)
   */
  static async loadFromDisk(sessionFolder: string): Promise<SessionMetrics | null> {
    const filePath = path.join(sessionFolder, METRICS_FILE);

    try {
      const data = await fs.promises.readFile(filePath, "utf-8");
      const metrics = JSON.parse(data) as SessionMetrics;

      // Validate version
      if (metrics.version !== METRICS_VERSION) {
        logger.warn("Metrics version mismatch", {
          expected: METRICS_VERSION,
          found: metrics.version,
        });
      }

      return metrics;
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        logger.warn("Failed to load metrics file", {
          error: error.message,
          filePath,
        });
      }
      return null;
    }
  }

  /**
   * Build complete session metrics
   */
  private buildSessionMetrics(): SessionMetrics {
    const now = Date.now();
    const totalDuration = this.startTime
      ? Math.round((this.endTime || now) - this.startTime) / 1000
      : 0;

    return {
      version: METRICS_VERSION,
      sessionId: this.sessionId || "",
      startTime: this.startTime || 0,
      endTime: this.endTime,
      lastUpdated: now,
      input: { ...this.inputMetrics },
      activity: this.buildActivityStats(totalDuration),
    };
  }

  /**
   * Build activity stats from input metrics
   */
  private buildActivityStats(totalDuration: number): ActivityStats {
    const { keyboard, mouse, clipboard, totalInputEvents } = this.inputMetrics;

    // Calculate active duration (approximate from keyboard active time)
    const activeDuration = Math.min(keyboard.keyboardActiveTime, totalDuration);
    const idleDuration = totalDuration - activeDuration;
    const activityRatio = totalDuration > 0 ? activeDuration / totalDuration : 0;

    // Calculate per-minute rates
    const activeMinutes = activeDuration / 60;
    const keystrokesPerMinute =
      activeMinutes > 0 ? Math.round(keyboard.estimatedKeystrokes / activeMinutes) : 0;
    const clicksPerMinute =
      activeMinutes > 0 ? Math.round(mouse.mouseClicks / activeMinutes) : 0;
    const inputEventsPerMinute =
      activeMinutes > 0 ? Math.round(totalInputEvents / activeMinutes) : 0;

    // Verification indicators
    const hasNaturalTypingPattern = keyboard.typingBurstCount >= NATURAL_TYPING_MIN_BURSTS;
    const hasSuspiciousWPM = keyboard.peakWPM > SUSPICIOUS_WPM_THRESHOLD;

    // Check for excessive pasting relative to typing
    const totalTypedChars = keyboard.estimatedKeystrokes;
    const totalPastedChars = clipboard.totalPastedCharacters;
    const totalChars = totalTypedChars + totalPastedChars;
    const hasExcessivePasting =
      totalChars > 100 && totalPastedChars / totalChars > EXCESSIVE_PASTE_RATIO;

    // Calculate activity score
    let activityScore = 100;

    // Penalize low activity ratio
    if (activityRatio < 0.2 && totalDuration > 600) {
      activityScore -= 20;
    }

    // Penalize suspicious WPM
    if (hasSuspiciousWPM) {
      activityScore -= 15;
    }

    // Penalize excessive pasting
    if (hasExcessivePasting) {
      activityScore -= 20;
    }

    // Reward natural typing patterns
    if (hasNaturalTypingPattern) {
      activityScore += 10;
    }

    // Clamp score
    activityScore = Math.max(0, Math.min(100, activityScore));

    return {
      totalDuration: Math.round(totalDuration),
      activeDuration: Math.round(activeDuration),
      idleDuration: Math.round(idleDuration),
      activityRatio: Math.round(activityRatio * 100) / 100,
      keystrokesPerMinute,
      clicksPerMinute,
      inputEventsPerMinute,
      hasNaturalTypingPattern,
      hasSuspiciousWPM,
      hasExcessivePasting,
      activityScore,
    };
  }

  /**
   * Check if aggregator is currently active
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Get session folder path
   */
  getSessionFolder(): string | null {
    return this.sessionFolder;
  }
}

/**
 * Singleton metrics aggregator instance
 */
export const metricsAggregator = new MetricsAggregator();
