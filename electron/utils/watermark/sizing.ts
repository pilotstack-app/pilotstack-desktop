/**
 * Watermark Sizing
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * Aspect ratio detection and responsive size calculations.
 */

import { ASPECT_RATIOS } from "./constants";
import type { AspectRatio, ResponsiveSizes } from "./types";

/**
 * Detect aspect ratio from dimensions
 */
export function detectAspectRatio(width: number, height: number): AspectRatio {
  const ratio = width / height;

  // Find closest match
  if (ratio >= 1.7) return ASPECT_RATIOS.LANDSCAPE_16_9;
  if (ratio >= 1.2) return ASPECT_RATIOS.LANDSCAPE_4_3;
  if (ratio >= 0.9 && ratio <= 1.1) return ASPECT_RATIOS.SQUARE;
  if (ratio >= 0.7) return ASPECT_RATIOS.PORTRAIT_3_4;
  return ASPECT_RATIOS.PORTRAIT_9_16;
}

/**
 * Calculate responsive sizes based on video dimensions
 * Enhanced for better visibility and modern look
 */
export function calculateResponsiveSizes(
  width: number,
  height: number
): ResponsiveSizes {
  const aspectRatio = detectAspectRatio(width, height);
  const isPortrait = aspectRatio.ratio < 1;
  const isSquare = aspectRatio.name === "square";

  // Base size scaling factor (relative to shorter dimension)
  const baseSize = Math.min(width, height);
  const scaleFactor = baseSize / 1080; // 1080p as reference

  // Font sizes - increased for better visibility
  const baseFontSize = Math.max(16, Math.min(28, Math.round(baseSize / 40)));
  const smallFontSize = Math.max(12, Math.round(baseFontSize * 0.75));
  const largeFontSize = Math.max(20, Math.round(baseFontSize * 1.3));

  // Padding and margins - increased for breathing room
  const padding = Math.max(12, Math.round(baseSize / 50));
  const margin = Math.max(20, Math.round(baseSize / 35));

  // Badge dimensions - larger for visibility
  const badgeHeight = Math.max(36, Math.round(baseFontSize * 2.4));
  const statsBoxHeight = Math.max(100, Math.round(badgeHeight * 3.5));

  return {
    aspectRatio,
    isPortrait,
    isSquare,
    scaleFactor,
    fonts: {
      base: baseFontSize,
      small: smallFontSize,
      large: largeFontSize,
    },
    spacing: {
      padding,
      margin,
      lineHeight: Math.round(baseFontSize * 1.5),
    },
    badge: {
      height: badgeHeight,
      minWidth: Math.max(140, Math.round(width * 0.15)),
      maxWidth: Math.round(width * 0.35),
      borderRadius: Math.round(badgeHeight / 3),
    },
    statsBox: {
      width: Math.max(240, Math.min(400, Math.round(width * 0.28))),
      height: statsBoxHeight,
    },
    watermark: {
      fontSize: Math.max(14, smallFontSize),
      opacity: 0.85, // Increased opacity for visibility
    },
  };
}

/**
 * Get layout recommendation for aspect ratio
 */
export function getLayoutRecommendation(width: number, height: number) {
  const sizes = calculateResponsiveSizes(width, height);
  const { aspectRatio, isPortrait, isSquare } = sizes;

  return {
    aspectRatio: aspectRatio.label,
    isPortrait,
    isSquare,
    recommendedBadgePosition: isPortrait ? "top-center" : "top-right",
    recommendedStatsPosition: isPortrait ? "bottom-center" : "bottom-left",
    recommendedWatermarkPosition: "bottom-right",
  };
}
