/**
 * Watermark Templates
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * Re-exports all watermark utilities for easy imports.
 */

// Constants
export { ASPECT_RATIOS, BADGE_COLORS } from "./constants";

// Types
export type {
  AspectRatio,
  ResponsiveSizes,
  WatermarkOptions,
  VideoMetadata,
  Position,
} from "./types";

// Sizing utilities
export {
  detectAspectRatio,
  calculateResponsiveSizes,
  getLayoutRecommendation,
} from "./sizing";

// Positioning utilities
export {
  getBadgePosition,
  getStatsBoxPosition,
  getWatermarkPosition,
  getAvailableBadgePositions,
} from "./positioning";

// Text utilities
export {
  escapeFFmpegText,
  formatDuration,
  formatActiveDuration,
  formatKeystrokeCount,
  generateRecordingShareUrl,
} from "./text-utils";

// Filter generators
export { generateBadgeFilter, generateAnimatedBadgeFilter } from "./badge-filter";
export { generateStatsOverlayFilter } from "./stats-filter";
export {
  generateWatermarkFilter,
  generateEnhancedWatermarkFilter,
  getWatermarkConfig,
} from "./watermark-filter";

// Composite filter generator
import { generateBadgeFilter } from "./badge-filter";
import { generateStatsOverlayFilter } from "./stats-filter";
import { generateWatermarkFilter } from "./watermark-filter";
import type { VideoMetadata, WatermarkOptions } from "./types";

/**
 * Generate complete video overlay filters
 */
export function generateVideoOverlayFilters(
  width: number,
  height: number,
  metadata: VideoMetadata | null,
  fontPath?: string,
  options: WatermarkOptions = {}
): string[] {
  const filters: string[] = [];

  // Add stats overlay if metadata provided
  if (metadata && options.showStats !== false) {
    filters.push(
      ...generateStatsOverlayFilter(width, height, metadata, fontPath, options)
    );
  }

  // Add verification badge
  if (metadata && options.showBadge !== false) {
    filters.push(
      ...generateBadgeFilter(width, height, metadata, fontPath, options)
    );
  }

  // Add watermark
  if (options.showWatermark !== false) {
    filters.push(...generateWatermarkFilter(width, height, fontPath, options));
  }

  return filters;
}
