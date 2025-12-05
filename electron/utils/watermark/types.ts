/**
 * Watermark Types
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * Type definitions for watermark system.
 */

import { ASPECT_RATIOS } from "./constants";

/**
 * Aspect ratio type from constants
 */
export type AspectRatio = (typeof ASPECT_RATIOS)[keyof typeof ASPECT_RATIOS];

/**
 * Responsive sizes calculated for video dimensions
 */
export interface ResponsiveSizes {
  aspectRatio: AspectRatio;
  isPortrait: boolean;
  isSquare: boolean;
  scaleFactor: number;
  fonts: {
    base: number;
    small: number;
    large: number;
  };
  spacing: {
    padding: number;
    margin: number;
    lineHeight: number;
  };
  badge: {
    height: number;
    minWidth: number;
    maxWidth: number;
    borderRadius: number;
  };
  statsBox: {
    width: number;
    height: number;
  };
  watermark: {
    fontSize: number;
    opacity: number;
  };
}

/**
 * Watermark configuration options
 */
export interface WatermarkOptions {
  customText?: string;
  opacity?: number;
  watermarkPosition?: string;
  badgePosition?: string;
  showStats?: boolean;
  showBadge?: boolean;
  showWatermark?: boolean;
  userHandle?: string;
  animationDuration?: number;
  fadeInStart?: number;
}

/**
 * Video metadata for overlay generation
 */
export interface VideoMetadata {
  isVerified?: boolean;
  verificationScore?: number;
  totalDuration?: number;
  activeDuration?: number;
  pasteEventCount?: number;
  keyboardStats?: {
    estimatedKeystrokes?: number;
    peakWPM?: number;
  };
}

/**
 * Position coordinates
 */
export interface Position {
  x: number;
  y: number;
}
