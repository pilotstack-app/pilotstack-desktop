/**
 * Watermark Positioning
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * Position calculation functions for badge, stats, and watermark overlays.
 */

import type { ResponsiveSizes, Position } from "./types";

/**
 * Get badge position based on aspect ratio
 */
export function getBadgePosition(
  width: number,
  height: number,
  sizes: ResponsiveSizes,
  position: string = "top-right"
): Position {
  const { aspectRatio, spacing, badge } = sizes;
  const isPortrait = aspectRatio.ratio < 1;

  // Position mappings for different aspect ratios
  const positions = {
    // Landscape (16:9, 4:3)
    landscape: {
      "top-right": {
        x: width - badge.minWidth - spacing.margin,
        y: spacing.margin,
      },
      "top-left": { x: spacing.margin, y: spacing.margin },
      "top-center": {
        x: Math.round((width - badge.minWidth) / 2),
        y: spacing.margin,
      },
      "bottom-right": {
        x: width - badge.minWidth - spacing.margin,
        y: height - badge.height - spacing.margin,
      },
      "bottom-left": {
        x: spacing.margin,
        y: height - badge.height - spacing.margin,
      },
    },
    // Portrait (9:16, 3:4)
    portrait: {
      "top-right": {
        x: width - badge.minWidth - spacing.margin,
        y: spacing.margin * 2,
      },
      "top-left": { x: spacing.margin, y: spacing.margin * 2 },
      "top-center": {
        x: Math.round((width - badge.minWidth) / 2),
        y: spacing.margin * 2,
      },
      "bottom-right": {
        x: width - badge.minWidth - spacing.margin,
        y: height - badge.height - spacing.margin * 2,
      },
      "bottom-left": {
        x: spacing.margin,
        y: height - badge.height - spacing.margin * 2,
      },
    },
    // Square
    square: {
      "top-right": {
        x: width - badge.minWidth - spacing.margin,
        y: spacing.margin,
      },
      "top-left": { x: spacing.margin, y: spacing.margin },
      "top-center": {
        x: Math.round((width - badge.minWidth) / 2),
        y: spacing.margin,
      },
      "bottom-right": {
        x: width - badge.minWidth - spacing.margin,
        y: height - badge.height - spacing.margin,
      },
      "bottom-left": {
        x: spacing.margin,
        y: height - badge.height - spacing.margin,
      },
    },
  };

  const layout = isPortrait ? "portrait" : sizes.isSquare ? "square" : "landscape";
  return (
    positions[layout][position as keyof (typeof positions)["landscape"]] ||
    positions[layout]["top-right"]
  );
}

/**
 * Get stats box position based on aspect ratio
 */
export function getStatsBoxPosition(
  width: number,
  height: number,
  sizes: ResponsiveSizes
): Position {
  const { aspectRatio, spacing, statsBox } = sizes;
  const isPortrait = aspectRatio.ratio < 1;

  if (isPortrait) {
    // Portrait: center bottom
    return {
      x: Math.round((width - statsBox.width) / 2),
      y: height - statsBox.height - spacing.margin * 2,
    };
  } else if (sizes.isSquare) {
    // Square: bottom-left with smaller box
    return {
      x: spacing.margin,
      y: height - statsBox.height - spacing.margin,
    };
  } else {
    // Landscape: bottom-left
    return {
      x: spacing.margin,
      y: height - statsBox.height - spacing.margin,
    };
  }
}

/**
 * Get watermark position
 * Updated with better margin calculations for visibility
 */
export function getWatermarkPosition(
  width: number,
  height: number,
  sizes: ResponsiveSizes,
  position: string = "bottom-right"
): Position {
  const { spacing, watermark } = sizes;
  const textWidth = 220; // Increased width for "Made with pilotstack ✨"
  const safeMargin = Math.max(spacing.margin, 25); // Ensure minimum margin

  const positions: Record<string, Position> = {
    "bottom-right": {
      x: width - textWidth - safeMargin,
      y: height - safeMargin - watermark.fontSize - 10,
    },
    "bottom-left": {
      x: safeMargin,
      y: height - safeMargin - watermark.fontSize - 10,
    },
    "bottom-center": {
      x: Math.round((width - textWidth) / 2),
      y: height - safeMargin - watermark.fontSize - 10,
    },
    "top-right": {
      x: width - textWidth - safeMargin,
      y: safeMargin,
    },
  };

  return positions[position] || positions["bottom-right"];
}

/**
 * Get all available badge positions for a given aspect ratio
 */
export function getAvailableBadgePositions(width: number, height: number) {
  const { isPortrait } = {
    isPortrait: width / height < 1,
  };

  const positions = [
    { id: "top-right", label: "Top Right", recommended: !isPortrait },
    { id: "top-left", label: "Top Left", recommended: false },
    { id: "top-center", label: "Top Center", recommended: isPortrait },
    { id: "bottom-right", label: "Bottom Right", recommended: false },
    { id: "bottom-left", label: "Bottom Left", recommended: false },
  ];

  return positions;
}
