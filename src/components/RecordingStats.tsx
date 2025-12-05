import { motion } from "framer-motion";
import {
  Film,
  Clock,
  Layers,
  AlertTriangle,
  Activity,
  Gauge,
  Zap,
} from "lucide-react";
import clsx from "clsx";

interface RecordingStatsProps {
  frameCount: number;
  estimatedDuration: number; // Timelapse duration
  realTimeDuration?: number; // Real-time elapsed duration
  isPaused: boolean;
  queueSize?: number;
  maxQueueSize?: number;
  droppedFrames?: number;
  skippedFrames?: number;
  adaptiveQuality?: string;
  captureTime?: number;
  compressionRatio?: string;
  avgFrameSize?: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingStats({
  frameCount,
  estimatedDuration,
  realTimeDuration,
  isPaused,
  queueSize = 0,
  maxQueueSize = 100,
  droppedFrames = 0,
  skippedFrames = 0,
  adaptiveQuality,
  captureTime,
  compressionRatio: _compressionRatio,
  avgFrameSize,
}: RecordingStatsProps) {
  // Calculate queue pressure for visual indicator
  const queuePressure = maxQueueSize > 0 ? queueSize / maxQueueSize : 0;
  const isUnderPressure = queuePressure > 0.5;
  const isCritical = queuePressure > 0.85;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-3 sm:p-4 space-y-3 sm:space-y-4"
    >
      {/* Recording indicator */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <div
          className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${isPaused ? "bg-chrono-warning" : "bg-chrono-danger recording-indicator"}`}
        />
        <span className="text-xs sm:text-sm font-medium">
          {isPaused ? "Paused" : "Recording"}
        </span>
        {queueSize > 5 && (
          <span
            className={clsx(
              "text-[10px] sm:text-xs flex items-center gap-1",
              isCritical
                ? "text-red-400"
                : isUnderPressure
                  ? "text-yellow-400"
                  : "text-blue-400",
            )}
          >
            <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {isCritical
              ? "High load!"
              : isUnderPressure
                ? "Processing..."
                : "Buffering"}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="bg-chrono-bg/50 rounded-xl p-2.5 sm:p-3 text-center border-2 border-chrono-border/30">
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-chrono-muted mb-0.5 sm:mb-1">
            <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs">Frames</span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums">
            {frameCount.toLocaleString()}
          </p>
        </div>

        <div className="bg-chrono-bg/50 rounded-xl p-2.5 sm:p-3 text-center border-2 border-chrono-border/30">
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-chrono-muted mb-0.5 sm:mb-1">
            <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs">Video Length</span>
          </div>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums">
            {formatDuration(estimatedDuration)}
          </p>
        </div>
      </div>

      {/* Timer */}
      <div className="text-center pt-2 sm:pt-3 border-t border-chrono-border/50">
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-chrono-muted mb-0.5 sm:mb-1">
          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <span className="text-[10px] sm:text-xs">Elapsed Time</span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums gradient-text">
          {formatDuration(realTimeDuration ?? frameCount)}
        </p>
      </div>

      {/* Dropped/Skipped frames info */}
      {(droppedFrames > 0 || skippedFrames > 0) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-[10px] sm:text-xs pt-2 border-t border-chrono-border/50"
        >
          {droppedFrames > 0 && (
            <span className="flex items-center gap-1 text-yellow-400">
              <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {droppedFrames} dropped
            </span>
          )}
          {skippedFrames > 0 && (
            <span className="flex items-center gap-1 text-blue-400">
              <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {skippedFrames} skipped
            </span>
          )}
        </motion.div>
      )}

      {/* Performance metrics */}
      {(adaptiveQuality || captureTime !== undefined || avgFrameSize) && (
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-2 border-t border-chrono-border/50">
          {adaptiveQuality && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-chrono-muted mb-0.5">
                <Gauge className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span className="text-[8px] sm:text-[10px]">Quality</span>
              </div>
              <span
                className={clsx(
                  "text-[10px] sm:text-xs font-medium capitalize",
                  adaptiveQuality === "high" || adaptiveQuality === "max"
                    ? "text-green-400"
                    : adaptiveQuality === "medium"
                      ? "text-yellow-400"
                      : "text-orange-400",
                )}
              >
                {adaptiveQuality}
              </span>
            </div>
          )}
          {captureTime !== undefined && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-chrono-muted mb-0.5">
                <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span className="text-[8px] sm:text-[10px]">Capture</span>
              </div>
              <span
                className={clsx(
                  "text-[10px] sm:text-xs font-medium",
                  captureTime < 100
                    ? "text-green-400"
                    : captureTime < 300
                      ? "text-yellow-400"
                      : "text-red-400",
                )}
              >
                {captureTime}ms
              </span>
            </div>
          )}
          {avgFrameSize && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-chrono-muted mb-0.5">
                <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span className="text-[8px] sm:text-[10px]">Size</span>
              </div>
              <span className="text-[10px] sm:text-xs font-medium text-blue-400">
                {avgFrameSize}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
