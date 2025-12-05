/**
 * Keyboard Activity Monitor
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - KeyboardMonitor
 * 
 * Tracks keyboard activity patterns using system-wide hooks via uiohook-napi.
 * Captures accurate WPM and usage stats without logging actual content.
 * Maps to: handlers/keyboard-monitor.js
 */

import { BrowserWindow } from "electron";

// uIOhook types
interface UiohookEvent {
  type: number;
  keycode?: number;
  rawcode?: number;
  button?: number;
  clicks?: number;
  x?: number;
  y?: number;
  amount?: number;
  rotation?: number;
  direction?: number;
}

// Constants
const TYPING_BURST_THRESHOLD_MS = 2000; // 2 seconds between keystrokes = new burst
const MIN_BURST_LENGTH = 5; // Minimum keystrokes to count as a burst
const WPM_ESTIMATION_CHARS_PER_WORD = 5; // Standard characters per word

/**
 * Typing burst
 */
export interface TypingBurst {
  start: number;
  end: number;
  duration: number;
  keystrokes: number;
  wpm: number;
}

/**
 * Keyboard statistics
 */
export interface KeyboardStats {
  // Keystroke metrics
  estimatedKeystrokes: number;
  keyboardActiveTime: number; // seconds
  estimatedWordsTyped: number;

  // Typing patterns
  typingBurstCount: number;
  averageWPM: number;
  peakWPM: number;
  shortcutEstimate: number;

  // Mouse metrics
  mouseClicks: number;
  mouseDistance: number;
  scrollEvents: number;

  // Combined metrics
  totalInputEvents: number;
  keyboardOnlyPeriods: number;
  
  // Session info
  sessionDuration: number; // seconds
  lastActivityTime: number | null;

  // Typing intensity (keystrokes per active minute)
  typingIntensity: number;
}

/**
 * Keyboard Monitor
 * 
 * Uses uIOhook-napi for system-wide keyboard/mouse hooks.
 * Tracks keystrokes, mouse clicks, scroll events.
 * Calculates WPM (words per minute).
 * Detects typing bursts.
 * Calculates activity score.
 */
export class KeyboardMonitor {
  private mainWindow: BrowserWindow | null;
  private isMonitoring: boolean = false;

  // Tracking state
  private stats = {
    // Keystroke tracking
    estimatedKeystrokes: 0,
    keyboardActiveTime: 0,
    lastKeystrokeTime: 0,

    // Typing bursts
    typingBursts: [] as TypingBurst[],
    currentBurstStart: null as number | null,
    currentBurstKeystrokes: 0,

    // WPM estimation
    estimatedWordsTyped: 0,
    peakWPM: 0,
    averageWPM: 0,

    // Mouse activity
    mouseClicks: 0,
    mouseDistance: 0,
    scrollEvents: 0,

    // Combined activity
    totalInputEvents: 0,
    keyboardOnlyPeriods: 0,
    shortcutEstimate: 0,

    // Session info
    startTime: null as number | null,
    lastActivityTime: null as number | null,
  };

  // For WPM calculation (reserved for future use)
  // private sessionKeystrokes: number = 0;
  private lastWpmUpdate: number = 0;

  // Bound event handlers for proper cleanup
  private boundHandleInput: (e: UiohookEvent) => void;

  constructor(mainWindow: BrowserWindow | null = null) {
    this.mainWindow = mainWindow;
    this.boundHandleInput = this.handleInput.bind(this);
  }

  /**
   * Start monitoring keyboard activity
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.resetStats();
    this.stats.startTime = Date.now();

    // Setup uIOhook listeners - wrap in try/catch to handle native library errors
    try {
      const { uIOhook } = require("uiohook-napi");
      
      uIOhook.on("keydown", this.boundHandleInput);
      uIOhook.on("mousedown", this.boundHandleInput);
      uIOhook.on("wheel", this.boundHandleInput);
      // uIOhook.on('mousemove', this.handleMouseMove); // Optional: too noisy, handled separately or sampled

      uIOhook.start();
      console.log("Keyboard monitoring started (uIOhook)");
    } catch (e: any) {
      console.error("Failed to start uIOhook:", e.message);
      this.isMonitoring = false;
    }
  }

  /**
   * Stop monitoring and return final stats
   */
  stop(): KeyboardStats {
    if (!this.isMonitoring) return this.getStats();

    this.isMonitoring = false;

    // Stop uIOhook - wrap in try/catch to prevent crashes on cleanup
    try {
      const { uIOhook } = require("uiohook-napi");
      
      uIOhook.off("keydown", this.boundHandleInput);
      uIOhook.off("mousedown", this.boundHandleInput);
      uIOhook.off("wheel", this.boundHandleInput);
    } catch (e: any) {
      console.warn("Error removing uIOhook listeners:", e.message);
    }

    try {
      const { uIOhook } = require("uiohook-napi");
      uIOhook.stop();
    } catch (e: any) {
      console.warn("Error stopping uIOhook:", e.message);
    }

    // Close any open typing burst
    this.closeCurrentBurst();

    // Calculate final WPM
    this.calculateFinalWPM();

    const finalStats = this.getStats();
    console.log("Keyboard monitoring stopped", finalStats);
    return finalStats;
  }

  /**
   * Handle any input event
   */
  private handleInput(e: UiohookEvent): void {
    if (!this.isMonitoring) return;

    const now = Date.now();
    this.stats.totalInputEvents++;
    this.stats.lastActivityTime = now;

    // Handle specific event types
    // KeyDown (4) or KeyUp (5) - uIOhook specific
    if (e.type === 4 || e.type === 5) {
      // Only count keydown to avoid double counting
      if (e.type === 4) {
        this.recordKeyboardActivity(now);
      }
    } else if (e.type === 7) { // MouseDown
      this.stats.mouseClicks++;
    } else if (e.type === 11) { // Wheel
      this.stats.scrollEvents++;
    }
  }

  /**
   * Record keyboard activity event
   */
  private recordKeyboardActivity(timestamp: number): void {
    const timeSinceLastKeystroke =
      this.stats.lastKeystrokeTime > 0
        ? timestamp - this.stats.lastKeystrokeTime
        : TYPING_BURST_THRESHOLD_MS + 1;

    // Increment keystroke count
    this.stats.estimatedKeystrokes++;
    
    // Add time to active time (approx 200ms per keystroke as "active" time)
    this.stats.keyboardActiveTime += 200; 

    // Handle typing bursts
    if (timeSinceLastKeystroke <= TYPING_BURST_THRESHOLD_MS) {
      // Continue current burst
      if (this.stats.currentBurstStart === null) {
        this.stats.currentBurstStart = this.stats.lastKeystrokeTime || timestamp;
      }
      this.stats.currentBurstKeystrokes++;
    } else {
      // New burst - close previous if exists
      this.closeCurrentBurst();

      // Start new burst
      this.stats.currentBurstStart = timestamp;
      this.stats.currentBurstKeystrokes = 1;
    }

    // Detect shortcuts (rapid keystroke followed by long pause)
    // Not implemented perfectly with raw hooks without logic, but can estimate:
    if (timeSinceLastKeystroke < 150 && timeSinceLastKeystroke > 20) {
      // Very quick successive keystrokes might be combos
      this.stats.shortcutEstimate++;
    }

    this.stats.lastKeystrokeTime = timestamp;

    // Live WPM calculation (throttle updates)
    if (timestamp - this.lastWpmUpdate > 2000) {
      this.updateLiveStats(timestamp);
      this.lastWpmUpdate = timestamp;
    }
  }

  private updateLiveStats(now: number): void {
    // Calculate live WPM for current burst
    if (this.stats.currentBurstStart && this.stats.currentBurstKeystrokes > 5) {
      const burstDuration = now - this.stats.currentBurstStart;
      if (burstDuration > 2000) {
        const burstWPM = this.calculateWPM(
          this.stats.currentBurstKeystrokes,
          burstDuration
        );
        if (burstWPM > this.stats.peakWPM && burstWPM < 200) { // Sanity check < 200 WPM
          this.stats.peakWPM = burstWPM;
        }
      }
    }

    // Notify renderer
    this.sendActivityUpdate();
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.stats = {
      estimatedKeystrokes: 0,
      keyboardActiveTime: 0,
      lastKeystrokeTime: 0,
      typingBursts: [],
      currentBurstStart: null,
      currentBurstKeystrokes: 0,
      estimatedWordsTyped: 0,
      peakWPM: 0,
      averageWPM: 0,
      mouseClicks: 0,
      mouseDistance: 0,
      scrollEvents: 0,
      totalInputEvents: 0,
      keyboardOnlyPeriods: 0,
      shortcutEstimate: 0,
      startTime: null,
      lastActivityTime: null,
    };
    // this.sessionKeystrokes = 0; // Reserved for future use
  }

  /**
   * Close current typing burst and add to history
   */
  private closeCurrentBurst(): void {
    if (
      this.stats.currentBurstStart !== null &&
      this.stats.currentBurstKeystrokes >= MIN_BURST_LENGTH
    ) {
      const burstEnd = this.stats.lastKeystrokeTime;
      const burstDuration = burstEnd - this.stats.currentBurstStart;

      if (burstDuration > 0) {
        const burst: TypingBurst = {
          start: this.stats.currentBurstStart,
          end: burstEnd,
          duration: burstDuration,
          keystrokes: this.stats.currentBurstKeystrokes,
          wpm: this.calculateWPM(this.stats.currentBurstKeystrokes, burstDuration),
        };

        this.stats.typingBursts.push(burst);

        // Update estimated words typed
        this.stats.estimatedWordsTyped +=
          this.stats.currentBurstKeystrokes / WPM_ESTIMATION_CHARS_PER_WORD;
      }
    }

    this.stats.currentBurstStart = null;
    this.stats.currentBurstKeystrokes = 0;
  }

  /**
   * Calculate WPM from keystrokes and duration
   */
  private calculateWPM(keystrokes: number, durationMs: number): number {
    if (durationMs < 1000) return 0; // Need at least 1 second
    const minutes = durationMs / 60000;
    const words = keystrokes / WPM_ESTIMATION_CHARS_PER_WORD;
    return Math.round(words / minutes);
  }

  /**
   * Calculate final WPM statistics
   */
  private calculateFinalWPM(): void {
    if (this.stats.typingBursts.length === 0) {
      this.stats.averageWPM = 0;
      return;
    }

    // Calculate weighted average WPM based on burst durations
    let totalWeightedWPM = 0;
    let totalDuration = 0;

    for (const burst of this.stats.typingBursts) {
      totalWeightedWPM += burst.wpm * burst.duration;
      totalDuration += burst.duration;
    }

    if (totalDuration > 0) {
      this.stats.averageWPM = Math.round(totalWeightedWPM / totalDuration);
    }

    // Update words typed estimate
    this.stats.estimatedWordsTyped = Math.round(
      this.stats.estimatedKeystrokes / WPM_ESTIMATION_CHARS_PER_WORD
    );
  }

  /**
   * Send activity update to renderer
   */
  private sendActivityUpdate(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("keyboard:activity-update", {
        estimatedKeystrokes: this.stats.estimatedKeystrokes,
        currentBurstKeystrokes: this.stats.currentBurstKeystrokes,
        peakWPM: this.stats.peakWPM,
      });
    }
  }

  /**
   * Get current statistics
   */
  getStats(): KeyboardStats {
    const now = Date.now();
    const sessionDuration = this.stats.startTime
      ? (now - this.stats.startTime) / 1000
      : 0;

    return {
      // Keystroke metrics
      estimatedKeystrokes: this.stats.estimatedKeystrokes,
      keyboardActiveTime: Math.round(this.stats.keyboardActiveTime / 1000), // seconds
      estimatedWordsTyped: Math.round(this.stats.estimatedWordsTyped),

      // Typing patterns
      typingBurstCount: this.stats.typingBursts.length,
      averageWPM: this.stats.averageWPM,
      peakWPM: this.stats.peakWPM,
      shortcutEstimate: this.stats.shortcutEstimate,

      // Mouse metrics
      mouseClicks: this.stats.mouseClicks,
      mouseDistance: Math.round(this.stats.mouseDistance),
      scrollEvents: this.stats.scrollEvents,

      // Combined metrics
      totalInputEvents: this.stats.totalInputEvents,
      keyboardOnlyPeriods: this.stats.keyboardOnlyPeriods,
      
      // Session info
      sessionDuration: Math.round(sessionDuration),
      lastActivityTime: this.stats.lastActivityTime,

      // Typing intensity (keystrokes per active minute)
      typingIntensity:
        this.stats.keyboardActiveTime > 0
          ? Math.round(
              (this.stats.estimatedKeystrokes /
                (this.stats.keyboardActiveTime / 60000)) *
                10,
            ) / 10
          : 0,
    };
  }

  /**
   * Get activity score for verification
   */
  getActivityScore(): number {
    const stats = this.getStats();
    let score = 100;

    // Penalize very low keystroke counts for long sessions
    if (stats.sessionDuration > 600) {
      const expectedMinKeystrokes = stats.sessionDuration * 0.5;
      if (stats.estimatedKeystrokes < expectedMinKeystrokes * 0.3) {
        score -= 20;
      }
    }

    // Reward natural typing patterns
    if (stats.typingBurstCount > 0) {
      score += Math.min(10, stats.typingBurstCount);
    }

    // Penalize suspicious WPM
    if (stats.peakWPM > 200) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }
}
