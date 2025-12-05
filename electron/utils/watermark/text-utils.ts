/**
 * Watermark Text Utilities
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Watermark System
 *
 * Text formatting and escaping utilities for FFmpeg filters.
 */

/**
 * Escape special characters for FFmpeg drawtext
 */
export function escapeFFmpegText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

/**
 * Format duration for overlay display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m session`;
  }
  return `${minutes}m session`;
}

/**
 * Format active duration for display
 */
export function formatActiveDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m focus`;
  }
  return `${minutes}m focus`;
}

/**
 * Format keystroke count for display (e.g., 1234 -> "1.2K")
 */
export function formatKeystrokeCount(count: number): string {
  if (!count || count === 0) return "0";
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Generate QR code URL for the recording
 * Note: Actual QR code rendering requires a library like qrcode
 * This returns a URL that could be encoded as a QR code
 */
export function generateRecordingShareUrl(
  recordingId: string,
  baseUrl: string = "https://pilotstack.app"
): string | null {
  if (!recordingId) return null;
  return `${baseUrl}/r/${recordingId}`;
}
