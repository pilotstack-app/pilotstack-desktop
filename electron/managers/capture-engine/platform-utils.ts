/**
 * Platform-specific FFmpeg Utilities
 *
 * Generates OS-specific FFmpeg input arguments for native screen capture.
 * Uses gdigrab on Windows, avfoundation on macOS, x11grab on Linux.
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture System
 */

import { screen } from "electron";
import { logger } from "../../utils/logger";

/**
 * Supported platforms for native capture
 */
export type CapturePlatform = "darwin" | "win32" | "linux";

/**
 * Display information for capture
 */
export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleFactor: number;
}

/**
 * Native capture input configuration
 */
export interface NativeCaptureInput {
  format: string;
  input: string;
  extraArgs: string[];
}

/**
 * Get all available displays
 */
export function getDisplays(): DisplayInfo[] {
  const displays = screen.getAllDisplays();
  return displays.map((display, index) => ({
    id: display.id,
    name: `Display ${index + 1}`,
    width: display.size.width,
    height: display.size.height,
    x: display.bounds.x,
    y: display.bounds.y,
    scaleFactor: display.scaleFactor,
  }));
}

/**
 * Get the primary display
 */
export function getPrimaryDisplay(): DisplayInfo {
  const display = screen.getPrimaryDisplay();
  return {
    id: display.id,
    name: "Primary Display",
    width: display.size.width,
    height: display.size.height,
    x: display.bounds.x,
    y: display.bounds.y,
    scaleFactor: display.scaleFactor,
  };
}

/**
 * Build native capture input for macOS (avfoundation)
 *
 * Uses avfoundation device "Capture screen 0" for the primary display.
 * For multiple displays, use "Capture screen N" where N is the display index.
 */
function buildMacOSInput(
  displayIndex: number = 0,
  captureAudio: boolean = false
): NativeCaptureInput {
  // avfoundation format: "video_device:audio_device"
  // Screen capture devices are "Capture screen N"
  const videoDevice = displayIndex.toString();
  const audioDevice = captureAudio ? "0" : "none";
  const input = `${videoDevice}:${audioDevice}`;

  return {
    format: "avfoundation",
    input,
    extraArgs: [
      "-capture_cursor", "1",
      "-capture_mouse_clicks", "1",
    ],
  };
}

/**
 * Build native capture input for Windows (gdigrab)
 *
 * gdigrab captures the entire desktop or a specific window.
 * For full desktop: -i desktop
 * For specific window: -i title="Window Title"
 */
function buildWindowsInput(
  displayIndex: number = 0,
  _captureAudio: boolean = false
): NativeCaptureInput {
  // For multi-monitor on Windows, we'd need to use offset
  // For simplicity, we capture the entire virtual desktop
  const displays = getDisplays();
  const display = displays[displayIndex] || getPrimaryDisplay();

  return {
    format: "gdigrab",
    input: "desktop",
    extraArgs: [
      "-offset_x", display.x.toString(),
      "-offset_y", display.y.toString(),
      "-video_size", `${display.width}x${display.height}`,
      "-draw_mouse", "1",
    ],
  };
}

/**
 * Build native capture input for Linux (x11grab)
 *
 * x11grab uses the X11 display server for screen capture.
 * Input format: :display.screen+x,y
 */
function buildLinuxInput(
  displayIndex: number = 0,
  _captureAudio: boolean = false
): NativeCaptureInput {
  const displays = getDisplays();
  const display = displays[displayIndex] || getPrimaryDisplay();

  // X11 display format: :0.0 (display 0, screen 0)
  // With offset: :0.0+x,y
  const x11Display = process.env.DISPLAY || ":0";
  const input = `${x11Display}+${display.x},${display.y}`;

  return {
    format: "x11grab",
    input,
    extraArgs: [
      "-video_size", `${display.width}x${display.height}`,
      "-draw_mouse", "1",
    ],
  };
}

/**
 * Get native capture input configuration for the current platform
 */
export function getNativeCaptureInput(
  displayIndex: number = 0,
  captureAudio: boolean = false
): NativeCaptureInput {
  const platform = process.platform as CapturePlatform;

  logger.debug("Building native capture input", {
    platform,
    displayIndex,
    captureAudio,
  });

  switch (platform) {
    case "darwin":
      return buildMacOSInput(displayIndex, captureAudio);
    case "win32":
      return buildWindowsInput(displayIndex, captureAudio);
    case "linux":
      return buildLinuxInput(displayIndex, captureAudio);
    default:
      logger.warn("Unsupported platform for native capture", { platform });
      // Fallback to macOS style
      return buildMacOSInput(displayIndex, captureAudio);
  }
}

/**
 * Check if native capture is supported on this platform
 */
export function isNativeCaptureSupported(): boolean {
  const platform = process.platform;
  return platform === "darwin" || platform === "win32" || platform === "linux";
}

/**
 * Get recommended frame rate for native capture
 * Lower FPS = less CPU usage, but we need at least 1fps for timelapse
 */
export function getRecommendedFrameRate(): number {
  // For timelapse recording, 1fps is sufficient
  // This drastically reduces CPU and disk usage
  return 1;
}

/**
 * Get recommended video codec for native capture
 */
export function getRecommendedCodec(): string {
  const platform = process.platform;

  // Use hardware encoding where available
  if (platform === "darwin") {
    // macOS: VideoToolbox H.264
    return "h264_videotoolbox";
  } else if (platform === "win32") {
    // Windows: NVENC (NVIDIA) or QuickSync (Intel) or Software
    // Default to software for compatibility
    return "libx264";
  } else {
    // Linux: VAAPI or Software
    return "libx264";
  }
}

/**
 * Get fallback software codec
 */
export function getSoftwareCodec(): string {
  return "libx264";
}

/**
 * Build FFmpeg input arguments for native capture
 */
export function buildInputArgs(
  displayIndex: number = 0,
  frameRate: number = 1
): string[] {
  const captureInput = getNativeCaptureInput(displayIndex, false);

  const args: string[] = [
    // Frame rate (input)
    "-framerate", frameRate.toString(),
    // Input format
    "-f", captureInput.format,
    // Platform-specific extra args
    ...captureInput.extraArgs,
    // Input source
    "-i", captureInput.input,
  ];

  return args;
}

/**
 * Build FFmpeg output arguments for HLS streaming
 */
export function buildHLSOutputArgs(
  outputPath: string,
  segmentDuration: number = 6,
  useHardwareCodec: boolean = false
): string[] {
  const codec = useHardwareCodec ? getRecommendedCodec() : getSoftwareCodec();

  const args: string[] = [
    // Video codec
    "-c:v", codec,
    // Preset (ultrafast for real-time encoding)
    "-preset", "ultrafast",
    // Quality (CRF 23 is good balance)
    "-crf", "23",
    // Pixel format
    "-pix_fmt", "yuv420p",
    // GOP size (keyframe every segment)
    "-g", (segmentDuration * 1).toString(),
    // HLS settings
    "-f", "hls",
    "-hls_time", segmentDuration.toString(),
    "-hls_list_size", "0", // Keep all segments
    "-hls_segment_filename", `${outputPath}/segment_%05d.ts`,
    // Output playlist
    `${outputPath}/playlist.m3u8`,
  ];

  return args;
}

/**
 * Build FFmpeg arguments for snapshot output (for verification)
 */
export function buildSnapshotOutputArgs(
  outputPath: string,
  snapshotInterval: number = 5
): string[] {
  return [
    // Output a frame every N seconds
    "-vf", `fps=1/${snapshotInterval}`,
    // JPEG quality
    "-q:v", "5",
    // Output pattern
    `${outputPath}/snapshot_%05d.jpg`,
  ];
}
