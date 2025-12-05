/**
 * Platform Detection
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Configuration & Settings §Platform Detection
 * 
 * Migrated from utils/platform.js
 * Maps to: utils/platform.js
 */

import * as os from "os";

/**
 * Platform constants
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Configuration & Settings §Platform Detection
 */
export const PLATFORM = {
  IS_MAC: process.platform === "darwin",
  IS_WINDOWS: process.platform === "win32",
  IS_LINUX: process.platform === "linux",
  CPU_COUNT: os.cpus().length,
  TOTAL_MEMORY: os.totalmem(),
  IS_APPLE_SILICON: process.platform === "darwin" && process.arch === "arm64",
} as const;

/**
 * Platform detection helpers
 */
export const IS_MAC = PLATFORM.IS_MAC;
export const IS_WINDOWS = PLATFORM.IS_WINDOWS;
export const IS_LINUX = PLATFORM.IS_LINUX;

/**
 * Get platform name
 */
export function getPlatform(): "darwin" | "win32" | "linux" {
  return process.platform as "darwin" | "win32" | "linux";
}

