/**
 * Watermark Builder
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 * 
 * Builds video filters for watermarks and overlays.
 * Maps to: handlers/video.js buildVideoFilter()
 */

import * as fs from "fs";
import { logger } from "../../utils/logger";
import {
  generateVideoOverlayFilters,
  getLayoutRecommendation,
  type VideoMetadata,
} from "../../utils/watermark";

/**
 * Watermark builder options
 */
export interface WatermarkBuilderOptions {
  showStats?: boolean;
  showBadge?: boolean;
  showWatermark?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkPosition?: string;
  userHandle?: string;
}

/**
 * Recording metadata for overlay
 */
export interface RecordingMetadata {
  totalDuration: number;
  activeDuration: number;
  pasteEventCount: number;
  verificationScore: number;
  isVerified: boolean;
  keyboardStats?: {
    estimatedKeystrokes?: number;
    peakWPM?: number;
  };
}

/**
 * Watermark builder for video overlays
 */
export class WatermarkBuilder {
  /**
   * Get system font path for FFmpeg
   */
  getFontPath(): string | null {
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS
      const fonts = [
        "/System/Library/Fonts/SFCompact.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
      ];
      for (const font of fonts) {
        if (fs.existsSync(font)) return font;
      }
    } else if (platform === "win32") {
      // Windows
      return "C\\:/Windows/Fonts/arial.ttf";
    } else {
      // Linux
      const fonts = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
      ];
      for (const font of fonts) {
        if (fs.existsSync(font)) return font;
      }
    }

    return null;
  }

  /**
   * Build video filter for watermarks and overlays
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
   * Maps to: handlers/video.js buildVideoFilter()
   */
  buildVideoFilter(
    width: number,
    height: number,
    metadata: RecordingMetadata | null = null,
    options: WatermarkBuilderOptions = {}
  ): string {
    const padWidth = Math.ceil(width / 2) * 2;
    const padHeight = Math.ceil(height / 2) * 2;

    let filters = [`scale=${padWidth}:${padHeight}:flags=lanczos`];

    // Get layout recommendation for responsive positioning
    const layout = getLayoutRecommendation(padWidth, padHeight);
    logger.info("Video layout detected", {
      width: padWidth,
      height: padHeight,
      aspectRatio: layout.aspectRatio,
      isPortrait: layout.isPortrait,
    });

    // Convert recording metadata to video metadata format
    const videoMetadata: VideoMetadata | null = metadata
      ? {
          totalDuration: metadata.totalDuration,
          activeDuration: metadata.activeDuration,
          pasteEventCount: metadata.pasteEventCount,
          verificationScore: metadata.verificationScore,
          isVerified: metadata.isVerified,
          keyboardStats: metadata.keyboardStats,
        }
      : null;

    // Add responsive overlay using template system
    if (videoMetadata && videoMetadata.totalDuration) {
      const fontPath = this.getFontPath();

      // Generate all overlay filters with responsive positioning
      const overlayFilters = generateVideoOverlayFilters(
        padWidth,
        padHeight,
        videoMetadata,
        fontPath || undefined,
        {
          showStats: options.showStats !== false,
          showBadge: options.showBadge !== false,
          showWatermark: options.showWatermark !== false,
          badgePosition: layout.recommendedBadgePosition,
          watermarkPosition: layout.recommendedWatermarkPosition,
          customText: options.watermarkText,
          opacity: options.watermarkOpacity,
          userHandle: options.userHandle,
        }
      );

      filters.push(...overlayFilters);
    } else if (options.showWatermark !== false) {
      // Add just watermark even without metadata
      const fontPath = this.getFontPath();
      const { generateWatermarkFilter } = require("../../utils/watermark");
      const watermarkFilters = generateWatermarkFilter(
        padWidth,
        padHeight,
        fontPath,
        {
          watermarkPosition: options.watermarkPosition || "bottom-right",
          customText: options.watermarkText,
          opacity: options.watermarkOpacity || 0.5,
        }
      );
      filters.push(...watermarkFilters);
    }

    filters.push("format=yuv420p");

    return filters.join(",");
  }
}
