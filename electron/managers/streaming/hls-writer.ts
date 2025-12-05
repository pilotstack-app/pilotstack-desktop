/**
 * HLS Writer
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Encoding Flow
 * 
 * Handles HLS segment writing and playlist management.
 * Maps to: utils/streaming-encoder.js HLS writing section
 * 
 * Note: FFmpeg handles most HLS segment writing directly.
 * This class mainly handles finalization and metadata.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";

/**
 * HLS writer for segment and playlist management
 * 
 * FFmpeg handles segment creation and playlist updates automatically.
 * This class provides utilities for finalization and metadata management.
 */
export class HLSWriter {
  private playlistPath: string;
  private segmentPattern: string;
  private metadataPath: string;

  constructor(outputDir: string) {
    this.playlistPath = path.join(outputDir, "recording.m3u8");
    this.segmentPattern = path.join(outputDir, "seg_%05d.ts");
    this.metadataPath = path.join(outputDir, "metadata.json");
  }

  /**
   * Get playlist path
   */
  getPlaylistPath(): string {
    return this.playlistPath;
  }

  /**
   * Get segment pattern
   */
  getSegmentPattern(): string {
    return this.segmentPattern;
  }

  /**
   * Get metadata path
   */
  getMetadataPath(): string {
    return this.metadataPath;
  }

  /**
   * Check if playlist exists
   */
  async playlistExists(): Promise<boolean> {
    try {
      await fs.promises.access(this.playlistPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get segment count from playlist
   */
  async getSegmentCount(): Promise<number> {
    try {
      const content = await fs.promises.readFile(this.playlistPath, "utf8");
      const matches = content.match(/seg_\d+\.ts/g);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Save metadata to file
   */
  async saveMetadata(metadata: Record<string, any>): Promise<void> {
    try {
      const tmpPath = `${this.metadataPath}.tmp`;
      await fs.promises.writeFile(
        tmpPath,
        JSON.stringify(metadata, null, 2),
        "utf8"
      );
      await fs.promises.rename(tmpPath, this.metadataPath);
      logger.debug("Metadata saved", { path: this.metadataPath });
    } catch (error: any) {
      logger.warn("Failed to save metadata", {
        error: error.message,
        path: this.metadataPath,
      });
      throw error;
    }
  }

  /**
   * Load metadata from file
   */
  async loadMetadata(): Promise<Record<string, any> | null> {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        logger.debug("Metadata file not found", { path: this.metadataPath });
        return null;
      }

      // Check file size to warn about potential issues
      const stats = await fs.promises.stat(this.metadataPath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > 10) {
        logger.warn("Large metadata file detected", {
          path: this.metadataPath,
          sizeMB: fileSizeMB.toFixed(2),
        });
      }

      // For very large files (>50MB), this is likely corrupted old data
      if (fileSizeMB > 50) {
        logger.error("Metadata file too large, likely corrupted", {
          path: this.metadataPath,
          sizeMB: fileSizeMB.toFixed(2),
        });
        return null;
      }

      const content = await fs.promises.readFile(this.metadataPath, "utf8");
      const metadata = JSON.parse(content);

      // Validate essential fields
      if (!metadata.frameCount && !metadata.segmentCount) {
        logger.warn("Metadata missing essential fields", {
          path: this.metadataPath,
        });
        return null;
      }

      return metadata;
    } catch (error: any) {
      logger.warn("Failed to load metadata", {
        path: this.metadataPath,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Check if a directory contains streaming encoder output
   */
  static async isStreamingOutput(dir: string): Promise<boolean> {
    try {
      const playlistPath = path.join(dir, "recording.m3u8");
      const metadataPath = path.join(dir, "metadata.json");

      const [playlistExists, metadataExists] = await Promise.all([
        fs.promises
          .access(playlistPath)
          .then(() => true)
          .catch(() => false),
        fs.promises
          .access(metadataPath)
          .then(() => true)
          .catch(() => false),
      ]);

      return playlistExists || metadataExists;
    } catch {
      return false;
    }
  }

  /**
   * Load metadata from a streaming encoder output directory
   */
  static async loadMetadataFromDir(
    dir: string
  ): Promise<Record<string, any> | null> {
    const writer = new HLSWriter(dir);
    return writer.loadMetadata();
  }
}
