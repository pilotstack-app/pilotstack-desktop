/**
 * Stats Overlay Filter Generation
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * FFmpeg filter generation for stats overlay.
 */

import { calculateResponsiveSizes } from "./sizing";
import { getStatsBoxPosition } from "./positioning";
import {
  formatDuration,
  formatActiveDuration,
  formatKeystrokeCount,
} from "./text-utils";
import type { VideoMetadata, WatermarkOptions } from "./types";

/**
 * Generate stats overlay filter string
 * Enhanced with modern card styling, keyboard stats, and better visibility
 */
export function generateStatsOverlayFilter(
  width: number,
  height: number,
  metadata: VideoMetadata | null,
  fontPath?: string,
  _options: WatermarkOptions = {}
): string[] {
  if (!metadata) return [];

  const sizes = calculateResponsiveSizes(width, height);
  const statsPos = getStatsBoxPosition(width, height, sizes);

  const filters: string[] = [];
  const { statsBox, fonts, spacing } = sizes;
  const fontFile = fontPath ? `fontfile=${fontPath}:` : "";

  // Format durations
  const totalDuration = formatDuration(metadata.totalDuration || 0);
  const activeDuration = formatActiveDuration(metadata.activeDuration || 0);
  const pasteCount = metadata.pasteEventCount || 0;

  // Keyboard stats (from keyboardStats object)
  const keyboardStats = metadata.keyboardStats || {};
  const keystrokes = keyboardStats.estimatedKeystrokes || 0;
  const peakWPM = keyboardStats.peakWPM || 0;
  const hasKeyboardStats = keystrokes > 0 || peakWPM > 0;

  const shadowOffset = 3;

  // Calculate dynamic box height based on content
  const lineCount = hasKeyboardStats ? 4 : 3;
  const dynamicHeight = spacing.padding * 2 + spacing.lineHeight * lineCount + 8;
  const boxHeight = Math.max(statsBox.height, dynamicHeight);

  // Shadow layer for depth (neo-brutal style)
  filters.push(
    `drawbox=x=${statsPos.x + shadowOffset}:y=${statsPos.y + shadowOffset}:w=${statsBox.width}:h=${boxHeight}:color=black@0.5:t=fill`
  );

  // Stats box background with slight transparency
  filters.push(
    `drawbox=x=${statsPos.x}:y=${statsPos.y}:w=${statsBox.width}:h=${boxHeight}:color=0x1a1a2e@0.9:t=fill`
  );

  // Border for definition
  filters.push(
    `drawbox=x=${statsPos.x}:y=${statsPos.y}:w=${statsBox.width}:h=${boxHeight}:color=0x4b5563:t=2`
  );

  // Stats text with icons (emoji representations)
  const textX = statsPos.x + spacing.padding + 8;
  let textY = statsPos.y + spacing.padding + 4;

  // Total duration with clock emoji
  filters.push(
    `drawtext=${fontFile}text='⏱ ${totalDuration}':fontsize=${fonts.base}:fontcolor=white:x=${textX}:y=${textY}:shadowcolor=black@0.5:shadowx=1:shadowy=1`
  );
  textY += spacing.lineHeight;

  // Active duration with focus emoji
  filters.push(
    `drawtext=${fontFile}text='◉ ${activeDuration}':fontsize=${fonts.base}:fontcolor=0x10b981:x=${textX}:y=${textY}:shadowcolor=black@0.5:shadowx=1:shadowy=1`
  );
  textY += spacing.lineHeight;

  // Keyboard stats summary (keystrokes + WPM) - single line, high-level
  if (hasKeyboardStats) {
    let keystrokeText = "";
    if (keystrokes > 0 && peakWPM > 0) {
      keystrokeText = `⌨ ${formatKeystrokeCount(keystrokes)} keys | ${peakWPM} WPM`;
    } else if (keystrokes > 0) {
      keystrokeText = `⌨ ${formatKeystrokeCount(keystrokes)} keystrokes`;
    } else if (peakWPM > 0) {
      keystrokeText = `⌨ ${peakWPM} WPM peak`;
    }

    if (keystrokeText) {
      filters.push(
        `drawtext=${fontFile}text='${keystrokeText}':fontsize=${fonts.base}:fontcolor=0x60a5fa:x=${textX}:y=${textY}:shadowcolor=black@0.5:shadowx=1:shadowy=1`
      );
      textY += spacing.lineHeight;
    }
  }

  // Paste count
  const pasteText =
    pasteCount === 0
      ? "✓ No copy-pastes"
      : `⚠ ${pasteCount} paste${pasteCount > 1 ? "s" : ""}`;
  const pasteColor = pasteCount === 0 ? "0x10b981" : "0xf59e0b";
  filters.push(
    `drawtext=${fontFile}text='${pasteText}':fontsize=${fonts.base}:fontcolor=${pasteColor}:x=${textX}:y=${textY}:shadowcolor=black@0.5:shadowx=1:shadowy=1`
  );

  return filters;
}
