/**
 * Capture Engine Module
 *
 * Native FFmpeg-based screen capture system.
 */

export { CaptureService, type CaptureConfig, type CaptureServiceState, type StartResult, type StopResult } from "./capture-service";
export { FFmpegPipeline, type PipelineConfig, type PipelineState } from "./ffmpeg-pipeline";
export * from "./platform-utils";
