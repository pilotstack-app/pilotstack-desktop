/**
 * Watermark Filter Generation
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * FFmpeg filter generation for watermark text overlay.
 */

import { calculateResponsiveSizes } from "./sizing";
import { getWatermarkPosition } from "./positioning";
import { escapeFFmpegText } from "./text-utils";
import type { WatermarkOptions } from "./types";

/**
 * Generate watermark filter string
 * Enhanced with background pill and better visibility
 */
export function generateWatermarkFilter(
  width: number,
  height: number,
  fontPath?: string,
  options: WatermarkOptions = {}
): string[] {
  const sizes = calculateResponsiveSizes(width, height);
  const position = options.watermarkPosition || "bottom-right";
  const watermarkPos = getWatermarkPosition(width, height, sizes, position);

  const filters: string[] = [];
  const { watermark, spacing } = sizes;
  const fontFile = fontPath ? `fontfile=${fontPath}:` : "";

  const watermarkText = options.customText || "Made with pilotstack";
  const opacity = options.opacity || watermark.opacity;

  // Calculate background dimensions
  const bgPadding = spacing.padding;
  const bgHeight = watermark.fontSize + bgPadding * 2;
  const bgWidth = watermarkText.length * (watermark.fontSize * 0.55) + bgPadding * 3;
  const bgX = watermarkPos.x - bgPadding;
  const bgY = watermarkPos.y - bgPadding;

  // Shadow layer for depth
  filters.push(
    `drawbox=x=${bgX + 2}:y=${bgY + 2}:w=${bgWidth}:h=${bgHeight}:color=black@0.3:t=fill`
  );

  // Semi-transparent background pill for contrast
  filters.push(
    `drawbox=x=${bgX}:y=${bgY}:w=${bgWidth}:h=${bgHeight}:color=black@0.6:t=fill`
  );

  // Border for definition
  filters.push(
    `drawbox=x=${bgX}:y=${bgY}:w=${bgWidth}:h=${bgHeight}:color=white@0.2:t=1`
  );

  // Text shadow for readability
  filters.push(
    `drawtext=${fontFile}text='${escapeFFmpegText(watermarkText)}':fontsize=${watermark.fontSize}:fontcolor=black@0.4:x=${watermarkPos.x + 1}:y=${watermarkPos.y + 1}`
  );

  // Main watermark text
  filters.push(
    `drawtext=${fontFile}text='${escapeFFmpegText(watermarkText)}':fontsize=${watermark.fontSize}:fontcolor=white@${opacity}:x=${watermarkPos.x}:y=${watermarkPos.y}`
  );

  return filters;
}

/**
 * Generate enhanced watermark with optional user handle
 * Modern card-style with shadow and proper spacing
 */
export function generateEnhancedWatermarkFilter(
  width: number,
  height: number,
  fontPath?: string,
  options: WatermarkOptions = {}
): string[] {
  const sizes = calculateResponsiveSizes(width, height);
  const position = options.watermarkPosition || "bottom-right";
  const { spacing, watermark, isPortrait } = sizes;
  const fontFile = fontPath ? `fontfile=${fontPath}:` : "";

  const filters: string[] = [];
  const opacity = options.opacity || watermark.opacity;

  // Build watermark text
  let watermarkText = options.customText || "Made with pilotstack";
  if (options.userHandle) {
    watermarkText = `${watermarkText} · @${options.userHandle}`;
  }

  // Calculate text width more accurately
  const textWidth = watermarkText.length * (watermark.fontSize * 0.55);
  let watermarkPos: { x: number; y: number };
  const safeMargin = Math.max(spacing.margin, 25);

  if (isPortrait) {
    // Center bottom for portrait with safe margin
    watermarkPos = {
      x: Math.round((width - textWidth) / 2),
      y: height - safeMargin - watermark.fontSize - 10,
    };
  } else {
    watermarkPos = getWatermarkPosition(width, height, sizes, position);
  }

  // Enhanced background with shadow effect
  const bgPadding = spacing.padding;
  const bgHeight = watermark.fontSize + bgPadding * 2;
  const bgWidth = textWidth + bgPadding * 3;
  const bgX = watermarkPos.x - bgPadding;
  const bgY = watermarkPos.y - bgPadding;

  // Shadow layer
  filters.push(
    `drawbox=x=${bgX + 2}:y=${bgY + 2}:w=${bgWidth}:h=${bgHeight}:color=black@0.4:t=fill`
  );

  // Main background
  filters.push(
    `drawbox=x=${bgX}:y=${bgY}:w=${bgWidth}:h=${bgHeight}:color=black@0.65:t=fill`
  );

  // Border
  filters.push(
    `drawbox=x=${bgX}:y=${bgY}:w=${bgWidth}:h=${bgHeight}:color=white@0.15:t=1`
  );

  // Text shadow
  filters.push(
    `drawtext=${fontFile}text='${escapeFFmpegText(watermarkText)}':fontsize=${watermark.fontSize}:fontcolor=black@0.4:x=${watermarkPos.x + 1}:y=${watermarkPos.y + 1}`
  );

  // Main text
  filters.push(
    `drawtext=${fontFile}text='${escapeFFmpegText(watermarkText)}':fontsize=${watermark.fontSize}:fontcolor=white@${opacity}:x=${watermarkPos.x}:y=${watermarkPos.y}`
  );

  return filters;
}

/**
 * Get watermark configuration with all options
 */
export function getWatermarkConfig(
  options: WatermarkOptions = {}
): WatermarkOptions {
  return {
    showWatermark: options.showWatermark !== false,
    showBadge: options.showBadge !== false,
    showStats: options.showStats !== false,
    customText: options.customText || "Made with pilotstack",
    opacity: options.opacity || 0.6,
    badgePosition: options.badgePosition || "auto", // auto, top-right, top-left, etc.
    watermarkPosition: options.watermarkPosition || "bottom-right",
    userHandle: options.userHandle || undefined,
  };
}
