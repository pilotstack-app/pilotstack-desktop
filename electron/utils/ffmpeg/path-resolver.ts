/**
 * FFmpeg Path Resolver
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Video Generation System
 *
 * Resolves FFmpeg binary path for both dev and packaged apps.
 */

import * as path from "path";
import * as fs from "fs";
import { app } from "electron";
import { logger } from "../logger";

/**
 * Get the correct FFmpeg path for both dev and packaged apps
 * When packaged, FFmpeg is unpacked from ASAR, so we need to resolve the path correctly
 */
export function getFFmpegPath(): string {
  const ffmpeg = require("@ffmpeg-installer/ffmpeg");
  let ffmpegPath = ffmpeg.path;

  // CRITICAL: If path is inside ASAR, we MUST use unpacked location
  // fs.existsSync() returns true for ASAR paths, but binaries CANNOT execute from ASAR
  const isInAsar =
    ffmpegPath.includes("app.asar") &&
    !ffmpegPath.includes("app.asar.unpacked");

  // If path exists AND is NOT in ASAR, use it (dev mode or already unpacked)
  if (fs.existsSync(ffmpegPath) && !isInAsar) {
    logger.debug("FFmpeg found at original path", { path: ffmpegPath });
    return ffmpegPath;
  }

  // If path is in ASAR or doesn't exist, resolve to unpacked location
  if (isInAsar || (app && app.isPackaged)) {
    logger.info(
      "FFmpeg path is in ASAR or app is packaged, resolving to unpacked location",
      {
        originalPath: ffmpegPath,
        isInAsar: isInAsar,
        isPackaged: app ? app.isPackaged : false,
      }
    );

    // If path is in ASAR, extract the relative path and redirect to unpacked
    let relativePath = ffmpegPath;
    if (isInAsar) {
      // Extract path after app.asar
      const asarIndex = ffmpegPath.indexOf("app.asar");
      if (asarIndex !== -1) {
        relativePath = ffmpegPath.substring(asarIndex + "app.asar".length + 1);
      }
    } else {
      // If not in ASAR but packaged, try to get relative path from node_modules
      const nodeModulesIndex = ffmpegPath.indexOf("node_modules");
      if (nodeModulesIndex !== -1) {
        relativePath = ffmpegPath.substring(nodeModulesIndex);
      }
    }

    const appPath = app ? app.getAppPath() : process.cwd();
    const resourcesPath = path.dirname(appPath);
    const unpackedPath = path.join(resourcesPath, "app.asar.unpacked");

    const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const originalBinaryName = path.basename(ffmpegPath);

    // Build possible paths
    const possiblePaths: string[] = [];

    if (relativePath && relativePath !== ffmpegPath) {
      possiblePaths.push(path.join(unpackedPath, relativePath));
    }

    possiblePaths.push(
      path.join(
        unpackedPath,
        "node_modules",
        "@ffmpeg-installer",
        "ffmpeg",
        originalBinaryName
      ),
      path.join(
        unpackedPath,
        "node_modules",
        "@ffmpeg-installer",
        "ffmpeg",
        path.basename(path.dirname(ffmpegPath)),
        originalBinaryName
      ),
      path.join(
        unpackedPath,
        "node_modules",
        "@ffmpeg-installer",
        "ffmpeg",
        binaryName
      ),
      path.join(
        resourcesPath,
        "node_modules",
        "@ffmpeg-installer",
        "ffmpeg",
        originalBinaryName
      ),
      path.join(
        resourcesPath,
        "node_modules",
        "@ffmpeg-installer",
        "ffmpeg",
        binaryName
      )
    );

    for (const possiblePath of possiblePaths) {
      try {
        const stats = fs.statSync(possiblePath);
        if (stats.isFile()) {
          logger.info("FFmpeg found at resolved path", { path: possiblePath });
          if (process.platform !== "win32") {
            try {
              fs.chmodSync(possiblePath, 0o755);
              logger.debug("FFmpeg executable permissions set", {
                path: possiblePath,
              });
            } catch (e: any) {
              logger.warn("Could not set FFmpeg executable permissions", {
                path: possiblePath,
                error: e.message,
              });
            }
          }
          return possiblePath;
        }
      } catch (e: any) {
        logger.debug("FFmpeg path check failed", {
          path: possiblePath,
          error: e.message,
        });
      }
    }

    logger.warn(
      "FFmpeg not found in standard locations, trying directory search",
      { triedPaths: possiblePaths }
    );

    // If still not found, try to find it by searching directories
    const searchPaths = [
      path.join(unpackedPath, "node_modules", "@ffmpeg-installer", "ffmpeg"),
      path.join(resourcesPath, "node_modules", "@ffmpeg-installer", "ffmpeg"),
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        try {
          const files = fs.readdirSync(searchPath, { withFileTypes: true });
          for (const file of files) {
            if (file.isFile()) {
              const fileName = file.name.toLowerCase();
              if (fileName === binaryName || fileName.includes("ffmpeg")) {
                const foundPath = path.join(searchPath, file.name);
                if (process.platform !== "win32") {
                  try {
                    fs.chmodSync(foundPath, 0o755);
                  } catch (e) {
                    // Ignore chmod errors
                  }
                }
                logger.info("FFmpeg found via directory search", {
                  path: foundPath,
                  searchPath: searchPath,
                });
                return foundPath;
              }
            }
          }
        } catch (e: any) {
          logger.debug("Error searching directory for FFmpeg", {
            searchPath: searchPath,
            error: e.message,
          });
        }
      }
    }

    logger.error("FFmpeg binary not found in any expected location", {
      originalPath: ffmpegPath,
      appPath: app.getAppPath(),
      resourcesPath: resourcesPath,
      unpackedPath: unpackedPath,
    });
  }

  logger.error("Returning original FFmpeg path (may not exist)", {
    path: ffmpegPath,
  });
  return ffmpegPath;
}
