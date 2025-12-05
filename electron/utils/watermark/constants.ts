/**
 * Watermark Constants
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * Constants for aspect ratios and badge colors.
 */

/**
 * Aspect ratio constants for video overlays
 */
export const ASPECT_RATIOS = {
  LANDSCAPE_16_9: { ratio: 16 / 9, name: "landscape_16_9", label: "16:9" },
  LANDSCAPE_4_3: { ratio: 4 / 3, name: "landscape_4_3", label: "4:3" },
  PORTRAIT_9_16: { ratio: 9 / 16, name: "portrait_9_16", label: "9:16" },
  PORTRAIT_3_4: { ratio: 3 / 4, name: "portrait_3_4", label: "3:4" },
  SQUARE: { ratio: 1, name: "square", label: "1:1" },
} as const;

/**
 * Badge color configurations for different verification states
 */
export const BADGE_COLORS = {
  verified: {
    bg: "0x10b981", // Green
    bgAlpha: 0.95,
    text: "white",
    border: "0x059669",
  },
  partial: {
    bg: "0xf59e0b", // Amber
    bgAlpha: 0.95,
    text: "white",
    border: "0xd97706",
  },
  unverified: {
    bg: "0xef4444", // Red
    bgAlpha: 0.9,
    text: "white",
    border: "0xdc2626",
  },
  neutral: {
    bg: "0x374151", // Gray
    bgAlpha: 0.85,
    text: "white",
    border: "0x4b5563",
  },
} as const;
