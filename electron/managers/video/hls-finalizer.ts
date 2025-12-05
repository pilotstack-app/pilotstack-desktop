/**
 * HLS Finalizer
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - HLS Finalization
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §3 - Streaming Encoder
 * 
 * Finalizes HLS recordings by remuxing segments to MP4.
 * Maps to: handlers/video.js finalizeStreamingRecording()
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { logger } from "../../utils/logger";
import { store } from "../../config/store";
import { VideoError } from "../../core/app-error";
import { StreamingEncoder } from "../../managers/streaming/streaming-encoder";
import { FFmpegBuilder } from "./ffmpeg-builder";
import { WatermarkBuilder, RecordingMetadata } from "./watermark-builder";
import {
  finalizeFastHLS,
  runHLSFinalizationWithOverlays,
} from "./hls-finalization-helpers";
import { ensureOutputDirectory } from "./video-generation-helpers";

/**
 * Long recording threshold for fast finalization (2 hours in seconds)
 * Recordings longer than this will use stream copy by default to avoid slow re-encoding
 */
const FAST_FINALIZATION_THRESHOLD_SECONDS = 7200; // 2 hours

/**
 * HLS finalization options
 */
export interface HLSFinalizationOptions {
  forceFastMode?: boolean;
  forceWatermarks?: boolean;
  onProgress?: (progress: {
    progress: number;
    time?: string;
    currentTime?: number;
    totalDuration?: number;
    isFastMode?: boolean;
    message?: string;
  }) => void;
}

/**
 * HLS finalization result
 */
export interface HLSFinalizationResult {
  success: boolean;
  outputFile: string;
  frameCount: number;
  duration: number;
  segmentCount?: number;
  isStreamingFinalization: boolean;
  isFastMode?: boolean;
  noOverlays?: boolean;
  finalizationTime?: number;
  activityMarkers?: any[];
  totalKeystrokes?: number;
  pasteCount?: number;
  idleFrameCount?: number;
  activeFrameCount?: number;
}

/**
 * HLS finalizer for streaming recordings
 */
export class HLSFinalizer {
  private ffmpegBuilder: FFmpegBuilder;
  private watermarkBuilder: WatermarkBuilder;
  private mainWindow: Electron.BrowserWindow | null;

  constructor(mainWindow: Electron.BrowserWindow | null = null) {
    this.ffmpegBuilder = new FFmpegBuilder();
    this.watermarkBuilder = new WatermarkBuilder();
    this.mainWindow = mainWindow;
  }

  /**
   * Set main window for progress updates
   */
  setMainWindow(window: Electron.BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Check if session is HLS-based
   */
  async isHLSSession(sessionFolder: string): Promise<boolean> {
    return await StreamingEncoder.isStreamingOutput(sessionFolder);
  }

  /**
   * Load metadata from a streaming encoder session
   */
  async loadStreamingMetadata(sessionFolder: string): Promise<any> {
    return await StreamingEncoder.loadMetadata(sessionFolder);
  }

  /**
   * Finalize streaming recording
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - HLS Finalization
   * Maps to: handlers/video.js finalizeStreamingRecording()
   */
  async finalizeStreamingRecording(
    sessionFolder: string,
    metadata: any = null,
    musicPath: string | null = null,
    options: HLSFinalizationOptions = {}
  ): Promise<HLSFinalizationResult> {
    let outputDir =
      store.get("outputDirectory") || app.getPath("videos");

    // Load streaming metadata if not provided
    if (!metadata) {
      metadata = await this.loadStreamingMetadata(sessionFolder);
    }

    if (!metadata) {
      throw new VideoError(
        "No streaming metadata found. Is this a streaming session?"
      );
    }

    const recordingDuration = metadata.duration || 0;
    const recordingHours = recordingDuration / 3600;
    const isLongRecording =
      recordingDuration > FAST_FINALIZATION_THRESHOLD_SECONDS;

    logger.info("Finalizing streaming recording", {
      sessionFolder,
      outputDir,
      hasMetadata: !!metadata,
      hasMusic: !!musicPath,
      recordingDurationMinutes: (recordingDuration / 60).toFixed(1),
      isLongRecording,
    });

    // For long recordings (>2 hours), use fast mode by default to avoid blocking
    const useFastMode =
      options.forceFastMode ||
      (isLongRecording && !options.forceWatermarks && !musicPath);

    if (useFastMode) {
      logger.info("Using fast finalization mode (stream copy, no re-encoding)", {
        reason: options.forceFastMode ? "forced" : "long recording",
        recordingHours: recordingHours.toFixed(2),
      });

      options.onProgress?.({
        progress: 5,
        message: "Using fast finalization for long recording...",
        isFastMode: true,
      });

      const outputFile = path.join(outputDir, `pilotstack_${Date.now()}.mp4`);
      return await finalizeFastHLS(
        sessionFolder,
        metadata,
        outputFile,
        musicPath,
        this.ffmpegBuilder,
        options
      );
    }

    const playlistPath =
      metadata.playlistPath || path.join(sessionFolder, "recording.m3u8");

    // Verify playlist exists
    if (!fs.existsSync(playlistPath)) {
      const files = await fs.promises.readdir(sessionFolder).catch(() => []);
      const segmentFiles = files.filter((f) => f.endsWith(".ts"));

      if (segmentFiles.length > 0) {
        logger.warn("Playlist missing but segments found, attempting to create playlist", {
          segmentCount: segmentFiles.length,
          sessionFolder,
        });

        const playlistContent = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXT-X-TARGETDURATION:6",
          ...segmentFiles.sort().map((file) => `#EXTINF:6.0,\n${file}`),
          "#EXT-X-ENDLIST",
        ].join("\n");

        await fs.promises.writeFile(playlistPath, playlistContent, "utf8");
        logger.info("Created recovery playlist", {
          playlistPath,
          segmentCount: segmentFiles.length,
        });
      } else {
        throw new VideoError(
          `HLS playlist not found and no segments available. The encoder may have failed. Check metadata.json for details.`
        );
      }
    }

    // Handle output directory permissions
    outputDir = await ensureOutputDirectory(outputDir, this.mainWindow);
    const outputFile = path.join(outputDir, `pilotstack_${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
      const ffmpegPath = this.ffmpegBuilder.getFFmpegPath();

      if (!fs.existsSync(ffmpegPath)) {
        reject(new VideoError(`FFmpeg binary not found at ${ffmpegPath}`));
        return;
      }

      const width = metadata.width || 1920;
      const height = metadata.height || 1080;

      // Get watermark settings from store
      const userHandle = store.get("userHandle");
      const watermarkOptions = {
        showStats: store.get("showStatsOverlay") !== false,
        showBadge: store.get("showVerificationBadge") !== false,
        showWatermark: store.get("showWatermark") !== false,
        watermarkText: store.get("watermarkText") || "Made with pilotstack",
        watermarkOpacity: store.get("watermarkOpacity") || 0.6,
        watermarkPosition: store.get("watermarkPosition") || "bottom-right",
        userHandle: userHandle || undefined,
      };

      // Build recording metadata for overlay
      const recordingMetadata: RecordingMetadata = {
        totalDuration: metadata.duration || 0,
        activeDuration: metadata.duration
          ? metadata.duration *
            (metadata.activeFrameCount / (metadata.frameCount || 1))
          : 0,
        pasteEventCount: metadata.pasteCount || 0,
        verificationScore: 0, // Will be calculated later
        isVerified: false,
      };

      // Build video filter for watermarks/overlays
      const videoFilter = this.watermarkBuilder.buildVideoFilter(
        width,
        height,
        recordingMetadata,
        watermarkOptions
      );

      // Build FFmpeg args for HLS to MP4 remux with overlays
      const args = this.ffmpegBuilder.buildHLSFinalizationCommand({
        playlistPath,
        output: outputFile,
        filters: videoFilter,
        musicPath: musicPath || undefined,
      });

      logger.info("Starting HLS finalization", {
        ffmpegPath,
        playlistPath,
        outputFile,
        width,
        height,
        hasMusic: !!musicPath,
      });

      runHLSFinalizationWithOverlays(
        ffmpegPath,
        args,
        sessionFolder,
        outputFile,
        metadata,
        options,
        this.ffmpegBuilder
      )
        .then(resolve)
        .catch(reject);
    });
  }

}
