/**
 * Streaming Encoder - Main Class
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Streaming Encoder
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Key Features §3 - Streaming Encoder
 * 
 * Real-time HLS encoding during capture.
 * Maps to: utils/streaming-encoder.js main StreamingEncoder class
 */

import { VideoError } from "../../core/app-error";
import { store } from "../../config/store";
import { logger } from "../../utils/logger";
import { EncoderProcess, EncoderProcessOptions } from "./encoder-process";
import { HLSWriter } from "./hls-writer";
import { ActivityTracker } from "./activity-tracker";
import { FrameBufferProcessor } from "./frame-buffer";
import { finalizeEncoder } from "./encoder-finalizer";
import { buildMetadata } from "./metadata-builder";
import { calculateFinalizationTimeout } from "./timeout-calculator";
import { flushBuffer } from "./buffer-flusher";
import { buildEncoderState } from "./state-builder";
import {
  StreamingEncoderOptions,
  StreamingEncoderMetadata,
} from "./types";

// Re-export types for external use
export type { StreamingEncoderOptions, StreamingEncoderMetadata };

/**
 * Streaming Encoder
 * 
 * Encodes frames to HLS segments in real-time, eliminating need for 30k+ frame files.
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Encoding Flow
 */
export class StreamingEncoder {
  private outputDir: string;
  private frameRate: number;
  private segmentDuration: number;
  private width: number;
  private height: number;

  private encoderProcess: EncoderProcess | null = null;
  private hlsWriter: HLSWriter | null = null;
  private activityTracker: ActivityTracker | null = null;
  private frameBufferProcessor: FrameBufferProcessor;

  private isStarted: boolean = false;
  private isFinalized: boolean = false;
  private startTime: number | null = null;
  private maxBufferSize: number;
  private inFinalize: boolean = false;

  constructor(outputDir: string, options: StreamingEncoderOptions = {}) {
    this.outputDir = outputDir;
    this.frameRate = options.frameRate || store.get("frameRate") || 30;
    this.segmentDuration = options.segmentDuration || 6;
    this.width = options.width || 1920;
    this.height = options.height || 1080;

    // Dynamically sized based on frame rate to handle ~5 seconds of frames
    this.maxBufferSize = Math.max(60, this.frameRate * 5);
    this.frameBufferProcessor = new FrameBufferProcessor(this.maxBufferSize);

    logger.info("StreamingEncoder created", {
      outputDir: this.outputDir,
      frameRate: this.frameRate,
      segmentDuration: this.segmentDuration,
      width: this.width,
      height: this.height,
    });
  }

  /**
   * Start the streaming encoder
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Encoding Flow
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new VideoError("StreamingEncoder already started");
    }
    if (this.inFinalize) {
      throw new VideoError("StreamingEncoder is finalizing");
    }
    this.isFinalized = false;
    this.inFinalize = false;
    this.frameBufferProcessor.reset();

    // Ensure even dimensions (required by FFmpeg)
    this.width = Math.floor(this.width / 2) * 2;
    this.height = Math.floor(this.height / 2) * 2;

    // Initialize components
    this.hlsWriter = new HLSWriter(this.outputDir);
    this.activityTracker = new ActivityTracker();
    this.encoderProcess = new EncoderProcess();

    // Set up callbacks
    this.encoderProcess.setOnSegmentCreated((_segmentIndex) => {
      // Segment creation is tracked automatically
    });

    this.encoderProcess.setOnError((error) => {
      logger.error("Encoder process error", { error: error.message });
      this.isFinalized = true;
    });

    // Use software encoding by default (more reliable, hardware has issues)
    store.set("useHardwareAcceleration", false);

    const processOptions: EncoderProcessOptions = {
      outputDir: this.outputDir,
      frameRate: this.frameRate,
      segmentDuration: this.segmentDuration,
      width: this.width,
      height: this.height,
    };

    await this.encoderProcess.spawn(processOptions);

    this.isStarted = true;
    this.startTime = Date.now();
    this.frameBufferProcessor.setStartTime(this.startTime);
    logger.info("StreamingEncoder started successfully", {
      width: this.width,
      height: this.height,
    });
  }

  /**
   * Add a frame to the encoder
   */
  addFrame(
    pngBuffer: Buffer,
    activityData: {
      isIdle?: boolean;
      keystrokesDelta?: number;
      hadPaste?: boolean;
    } = {}
  ): boolean {
    if (!this.isStarted || this.isFinalized || this.inFinalize) {
      logger.debug("Cannot add frame - encoder not started or finalized", {
        isStarted: this.isStarted,
        isFinalized: this.isFinalized,
      });
      return false;
    }

    if (!this.encoderProcess?.isRunning()) {
      logger.debug("Cannot add frame - encoder process not running");
      return false;
    }

    if (!pngBuffer || pngBuffer.length === 0) {
      logger.warn("Cannot add frame - empty buffer");
      return false;
    }

    // Add frame to buffer
    const added = this.frameBufferProcessor.addFrame(pngBuffer, activityData);

    // Process buffer asynchronously
    if (added && this.encoderProcess && this.activityTracker) {
      this.frameBufferProcessor
        .processBuffer(this.encoderProcess, this.activityTracker, this.isFinalized)
        .catch((error) => {
          logger.error("Error processing frame buffer", {
            error: error.message,
            frameCount: this.frameBufferProcessor.getFrameCount(),
            bufferSize: this.frameBufferProcessor.getBufferSize(),
          });
        });
    }

    if (!added) {
      logger.debug("Frame dropped by buffer policy", {
        bufferSize: this.frameBufferProcessor.getBufferSize(),
        droppedFrames: this.frameBufferProcessor.getDroppedFrameCount(),
      });
    }

    return added;
  }

  private _calculateFinalizationTimeout(): number {
    return calculateFinalizationTimeout(
      this.startTime,
      this.frameBufferProcessor.getFrameCount()
    );
  }

  /**
   * Finalize the encoder and return metadata
   */
  async finalize(): Promise<StreamingEncoderMetadata> {
    if (this.inFinalize) {
      logger.warn("StreamingEncoder finalize already in progress");
      return this._getMetadata();
    }
    this.inFinalize = true;
    const frameCount = this.frameBufferProcessor.getFrameCount();
    if (!this.isStarted && frameCount === 0) {
      logger.warn(
        "StreamingEncoder never started successfully, cannot finalize"
      );
      throw new VideoError("StreamingEncoder never started successfully");
    }

    if (this.isFinalized) {
      logger.warn("StreamingEncoder already finalized");
      return this._getMetadata();
    }

    const bufferSize = this.frameBufferProcessor.getBufferSize();

    // Handle edge case: very short recordings with no frames
    if (frameCount === 0 && bufferSize === 0) {
      logger.warn("No frames captured, aborting encoder");
      this.abort();
      throw new VideoError("No frames captured during recording");
    }

    // Flush remaining buffered frames before finalizing
    await flushBuffer(
      this.frameBufferProcessor,
      this.encoderProcess,
      this.activityTracker,
      this.isFinalized
    );

    this.isFinalized = true;

    // Use finalizer helper
    try {
      const metadata = await finalizeEncoder(
        this.encoderProcess,
        this.frameBufferProcessor,
        this.startTime,
        () => this._calculateFinalizationTimeout(),
        () => this._getMetadata(),
        (metadata) => this._saveMetadata(metadata)
      );
      // After finalize, drop reference to process
      this.encoderProcess = null;
      return metadata;
    } finally {
      this.inFinalize = false;
    }
  }

  abort(): void {
    logger.warn("StreamingEncoder abort called", {
      frameCount: this.frameBufferProcessor.getFrameCount(),
      isStarted: this.isStarted,
      isFinalized: this.isFinalized,
    });

    this.isFinalized = true;
    this.inFinalize = false;
    this.frameBufferProcessor.clear();

    if (this.encoderProcess) {
      this.encoderProcess.shutdown().catch(() => this.encoderProcess?.kill());
      this.encoderProcess = null;
    }
  }

  getState() {
    return buildEncoderState(
      this.isStarted,
      this.isFinalized,
      this.startTime,
      this.frameBufferProcessor,
      this.encoderProcess
    );
  }

  private _getMetadata(): StreamingEncoderMetadata {
    return buildMetadata(
      this.outputDir,
      this.frameRate,
      this.segmentDuration,
      this.width,
      this.height,
      this.maxBufferSize,
      this.startTime,
      this.frameBufferProcessor,
      this.activityTracker,
      this.hlsWriter,
      this.encoderProcess
    );
  }

  private async _saveMetadata(
    metadata: StreamingEncoderMetadata
  ): Promise<void> {
    if (this.hlsWriter) {
      await this.hlsWriter.saveMetadata(metadata);
    }
  }

  /**
   * Check if a directory contains streaming encoder output
   */
  static async isStreamingOutput(dir: string): Promise<boolean> {
    return HLSWriter.isStreamingOutput(dir);
  }

  /**
   * Load metadata from a streaming encoder output directory
   */
  static async loadMetadata(
    dir: string
  ): Promise<StreamingEncoderMetadata | null> {
    return HLSWriter.loadMetadataFromDir(dir) as Promise<StreamingEncoderMetadata | null>;
  }
}
