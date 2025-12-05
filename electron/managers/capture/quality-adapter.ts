/**
 * Quality Adapter - Adaptive Quality System
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §1 - Adaptive Quality System
 * 
 * Monitors system load and adjusts capture quality automatically.
 * Maps to: handlers/capture.js adaptive quality section
 * 
 * Purpose: Maintains performance under system load
 */

import { QualityPreset } from "../../config/types";

/**
 * Quality preset configuration
 */
export interface QualityPresetConfig {
  scale: number;
  jpegQuality: number;
  targetSize: number;
}

/**
 * Quality adapter for adaptive quality system
 * 
 * Monitors queue pressure and memory pressure, adjusts quality preset based on thresholds.
 * Uses hysteresis to prevent oscillation.
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §1 - Adaptive Quality System
 */
export class QualityAdapter {
  private currentQuality: QualityPreset = "high";
  private baseQuality: QualityPreset = "high";
  private lastQualityChangeTime: number = 0;
  private consecutiveSlowCaptures: number = 0;
  private readonly QUALITY_COOLDOWN = 5000; // 5 seconds between quality changes
  private enabled: boolean = true;

  /**
   * Quality presets
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Quality Presets
   */
  private readonly QUALITY_PRESETS: Record<QualityPreset, QualityPresetConfig> = {
    ultra_low: { scale: 0.5, jpegQuality: 50, targetSize: 80000 },
    low: { scale: 0.65, jpegQuality: 65, targetSize: 150000 },
    medium: { scale: 0.8, jpegQuality: 75, targetSize: 300000 },
    high: { scale: 1.0, jpegQuality: 85, targetSize: 500000 },
    max: { scale: 1.0, jpegQuality: 95, targetSize: 800000 },
  };

  /**
   * Pressure thresholds
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §1 - Thresholds
   */
  private readonly ADAPTIVE_THRESHOLDS = {
    LOW_PRESSURE: 0.2, // 20% queue full
    MEDIUM_PRESSURE: 0.4,
    HIGH_PRESSURE: 0.6,
    CRITICAL_PRESSURE: 0.75,
  };

  /**
   * Quality levels in order (for gradual changes)
   */
  private readonly QUALITY_LEVELS: QualityPreset[] = [
    "ultra_low",
    "low",
    "medium",
    "high",
    "max",
  ];

  private clampQuality(preset: QualityPreset): QualityPreset {
    return this.QUALITY_LEVELS.includes(preset) ? preset : "high";
  }

  /**
   * Set base quality (target quality when system is not under pressure)
   */
  setBaseQuality(quality: QualityPreset): void {
    this.baseQuality = this.clampQuality(quality);
  }

  /**
   * Set current quality (for initialization)
   */
  setCurrentQuality(quality: QualityPreset): void {
    this.currentQuality = this.clampQuality(quality);
  }

  /**
   * Enable or disable adaptive quality
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Adjust quality based on system pressure
   * 
   * Monitors queue pressure and memory pressure, adjusts quality preset based on thresholds.
   * Uses hysteresis to prevent oscillation.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §1 - Implementation
   */
  adjustQualityBasedOnPressure(
    queuePressure: number,
    memoryPressure: number
  ): void {
    if (!this.enabled) {
      return;
    }

    // Ensure we never operate on an invalid preset
    this.currentQuality = this.clampQuality(this.currentQuality);
    this.baseQuality = this.clampQuality(this.baseQuality);

    const pressure = Math.max(queuePressure, memoryPressure);
    const now = Date.now();
    const timeSinceChange = now - this.lastQualityChangeTime;
    const canChangeQuality = timeSinceChange > this.QUALITY_COOLDOWN;

    let newQuality = this.currentQuality;

    if (pressure >= this.ADAPTIVE_THRESHOLDS.CRITICAL_PRESSURE) {
      newQuality = "ultra_low";
    } else if (pressure >= this.ADAPTIVE_THRESHOLDS.HIGH_PRESSURE) {
      newQuality = "low";
    } else if (pressure >= this.ADAPTIVE_THRESHOLDS.MEDIUM_PRESSURE) {
      newQuality = "medium";
    } else if (pressure < this.ADAPTIVE_THRESHOLDS.LOW_PRESSURE && canChangeQuality) {
      const currentIdx = this.QUALITY_LEVELS.indexOf(this.currentQuality);
      const baseIdx = this.QUALITY_LEVELS.indexOf(this.baseQuality);
      if (currentIdx < baseIdx) {
        newQuality = this.QUALITY_LEVELS[currentIdx + 1];
      }
    }

    // Always allow immediate downgrade under critical pressure, otherwise respect cooldown
    const canApply =
      pressure >= this.ADAPTIVE_THRESHOLDS.CRITICAL_PRESSURE ? true : canChangeQuality;

    if (newQuality !== this.currentQuality && canApply) {
      this.currentQuality = newQuality;
      this.lastQualityChangeTime = now;
    }
  }

  /**
   * Adjust quality based on capture performance
   * 
   * Reduces quality if captures are consistently slow.
   */
  adjustQualityBasedOnPerformance(captureTime: number, maxCaptureTime: number): void {
    if (!this.enabled) return;

    this.currentQuality = this.clampQuality(this.currentQuality);

    if (captureTime > maxCaptureTime) {
      this.consecutiveSlowCaptures++;

      const now = Date.now();
      const canChangeQuality = now - this.lastQualityChangeTime > this.QUALITY_COOLDOWN;

      // Only reduce quality if cooldown has passed and we have consistent slow captures
      if (this.consecutiveSlowCaptures >= 3 && canChangeQuality) {
        const currentIndex = this.QUALITY_LEVELS.indexOf(this.currentQuality);

        if (currentIndex > 0) {
          this.currentQuality = this.QUALITY_LEVELS[currentIndex - 1];
          this.lastQualityChangeTime = now;
        }
        this.consecutiveSlowCaptures = 0;
      }
    } else {
      this.consecutiveSlowCaptures = Math.max(0, this.consecutiveSlowCaptures - 1);
    }
  }

  /**
   * Get current quality preset
   */
  getCurrentQuality(): QualityPreset {
    return this.currentQuality;
  }

  /**
   * Get quality settings for current preset
   */
  getQualitySettings(): QualityPresetConfig {
    return this.QUALITY_PRESETS[this.currentQuality];
  }

  /**
   * Get quality settings for a specific preset
   */
  getQualitySettingsFor(preset: QualityPreset): QualityPresetConfig {
    return this.QUALITY_PRESETS[preset];
  }

  /**
   * Reset quality adapter state
   */
  reset(): void {
    this.consecutiveSlowCaptures = 0;
    this.lastQualityChangeTime = 0;
  }
}

