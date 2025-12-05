/**
 * Badge Filter Generation
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * FFmpeg filter generation for verification badge overlays.
 */

import { BADGE_COLORS } from "./constants";
import { calculateResponsiveSizes } from "./sizing";
import { getBadgePosition } from "./positioning";
import type { VideoMetadata, WatermarkOptions } from "./types";

/**
 * Generate verification badge filter string
 * Enhanced with better visibility, shadow, and modern styling
 */
export function generateBadgeFilter(
  width: number,
  height: number,
  metadata: VideoMetadata | null,
  fontPath?: string,
  options: WatermarkOptions = {}
): string[] {
  const sizes = calculateResponsiveSizes(width, height);
  const badgePos = getBadgePosition(
    width,
    height,
    sizes,
    options.badgePosition || "top-right"
  );

  if (!metadata) return [];

  const isVerified = metadata.isVerified || false;
  const score = metadata.verificationScore || 0;

  // Determine badge style
  let colors, badgeText, emoji: string;
  if (isVerified) {
    colors = BADGE_COLORS.verified;
    badgeText = "VERIFIED";
    emoji = "✓";
  } else if (score >= 50) {
    colors = BADGE_COLORS.partial;
    badgeText = `${score}% AUTHENTIC`;
    emoji = "◐";
  } else if (score > 0) {
    colors = BADGE_COLORS.unverified;
    badgeText = `${score}% SCORE`;
    emoji = "○";
  } else {
    return []; // No badge if no score
  }

  const filters: string[] = [];
  const { badge, fonts, spacing } = sizes;
  const fontFile = fontPath ? `fontfile=${fontPath}:` : "";

  // Calculate badge dimensions
  const badgeWidth = isVerified ? badge.minWidth + 60 : badge.minWidth + 40;
  const shadowOffset = 3;

  // Shadow layer (offset black box for depth)
  filters.push(
    `drawbox=x=${badgePos.x + shadowOffset}:y=${badgePos.y + shadowOffset}:w=${badgeWidth}:h=${badge.height}:color=black@0.4:t=fill`
  );

  // Main badge background with solid fill
  filters.push(
    `drawbox=x=${badgePos.x}:y=${badgePos.y}:w=${badgeWidth}:h=${badge.height}:color=${colors.bg}@${colors.bgAlpha}:t=fill`
  );

  // Badge border (thicker for neo-brutal style)
  filters.push(
    `drawbox=x=${badgePos.x}:y=${badgePos.y}:w=${badgeWidth}:h=${badge.height}:color=${colors.border}:t=3`
  );

  // Badge text with shadow for readability
  const textX = badgePos.x + spacing.padding + 8;
  const textY = badgePos.y + Math.round((badge.height - fonts.base) / 2);

  // Text shadow
  filters.push(
    `drawtext=${fontFile}text='${emoji} ${badgeText}':fontsize=${fonts.base}:fontcolor=black@0.5:x=${textX + 1}:y=${textY + 1}`
  );

  // Main text
  filters.push(
    `drawtext=${fontFile}text='${emoji} ${badgeText}':fontsize=${fonts.base}:fontcolor=${colors.text}:x=${textX}:y=${textY}`
  );

  return filters;
}

/**
 * Generate animated badge appearance filter
 * Creates a fade-in effect for the first few seconds
 */
export function generateAnimatedBadgeFilter(
  width: number,
  height: number,
  metadata: VideoMetadata | null,
  fontPath?: string,
  options: WatermarkOptions = {}
): string[] {
  const filters: string[] = [];
  const fadeInStart = options.fadeInStart || 0.5; // seconds

  // Generate static badge first
  const badgeFilters = generateBadgeFilter(
    width,
    height,
    metadata,
    fontPath,
    options
  );

  // Wrap with enable expression for timed display
  for (const filter of badgeFilters) {
    // Add enable expression for fade-in
    const enableExpr = `enable='gte(t,${fadeInStart})'`;
    filters.push(`${filter}:${enableExpr}`);
  }

  return filters;
}
