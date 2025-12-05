import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import { SourceSelector } from "../components/SourceSelector";
import { RecordingControls } from "../components/RecordingControls";
import { RecordingStats } from "../components/RecordingStats";
import type {
  ScreenSource,
  FrameUpdateData,
  CaptureErrorData,
} from "../types/electron";

interface RecordingViewProps {
  onComplete: (sessionFolder: string, totalFrames: number) => void;
  onRecordingStart?: (sessionFolder: string) => void;
}

export function RecordingView({
  onComplete,
  onRecordingStart,
}: RecordingViewProps) {
  const [selectedSource, setSelectedSource] = useState<ScreenSource | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [realTimeDuration, setRealTimeDuration] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [maxQueueSize, _setMaxQueueSize] = useState(100);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [skippedFrames, setSkippedFrames] = useState(0);
  const [adaptiveQuality, setAdaptiveQuality] = useState<string | undefined>();
  const [captureTime, setCaptureTime] = useState<number | undefined>();
  const [avgFrameSize, setAvgFrameSize] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Sync recording state on mount (critical for page refresh during recording)
  useEffect(() => {
    const syncRecordingState = async () => {
      try {
        const state = await window.pilotstack.getRecordingState();
        if (state.isRecording) {
          setIsRecording(true);
          setFrameCount(state.frameCount);
          if (state.droppedFrames) setDroppedFrames(state.droppedFrames);

          // Fetch sources to restore selectedSource if possible
          if (state.sourceId) {
            const sources = await window.pilotstack.getSources();
            const source = sources.find((s) => s.id === state.sourceId);
            if (source) {
              setSelectedSource(source);
            } else {
              // Fallback if source ID not found (window closed?), create a dummy object to allow controls to work
              setSelectedSource({
                id: state.sourceId,
                name: "Current Recording",
                thumbnail: "",
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to sync recording state:", error);
      }
    };

    syncRecordingState();
  }, []);

  useEffect(() => {
    const unsubscribeFrame = window.pilotstack.onFrameUpdate(
      (data: FrameUpdateData) => {
        setFrameCount(data.frameCount);
        setEstimatedDuration(data.estimatedDuration);
        if (data.realTimeDuration !== undefined) setRealTimeDuration(data.realTimeDuration);
        if (data.queueSize !== undefined) setQueueSize(data.queueSize);
        if (data.droppedFrames !== undefined)
          setDroppedFrames(data.droppedFrames);
        if (data.skippedFrames !== undefined)
          setSkippedFrames(data.skippedFrames);
        // Performance metrics
        if (data.adaptiveQuality) setAdaptiveQuality(data.adaptiveQuality);
        if (data.captureTime !== undefined) setCaptureTime(data.captureTime);
        if (data.avgFrameSize) setAvgFrameSize(data.avgFrameSize);
        // Clear any previous errors on successful capture
        setErrorMessage(null);
        // Ensure recording state is true when receiving frames
        if (!isRecording) setIsRecording(true);
        if (isStarting) setIsStarting(false);
      },
    );

    const unsubscribeError = window.pilotstack.onCaptureError(
      (data: CaptureErrorData) => {
        setErrorMessage(data.message);
        if (isStarting) setIsStarting(false);
      },
    );

    return () => {
      unsubscribeFrame();
      unsubscribeError();
    };
  }, [isRecording, isStarting]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const handleStart = async () => {
    if (!selectedSource || isStarting) return;

    setIsStarting(true);
    setStartError(null);
    setErrorMessage(null);

    try {
      const result = await window.pilotstack.startCapture({
        sourceId: selectedSource.id,
      });

      if (result.success && result.sessionFolder) {
        setIsRecording(true);
        setIsPaused(false);
        setFrameCount(0);
        setEstimatedDuration(0);
        setRealTimeDuration(0);
        setDroppedFrames(0);
        setSkippedFrames(0);
        setQueueSize(0);
        setAdaptiveQuality(undefined);
        setCaptureTime(undefined);
        setAvgFrameSize(undefined);
        // Notify parent that recording has started
        onRecordingStart?.(result.sessionFolder);
      } else if (result.error) {
        setStartError(result.error);
      }
    } catch (error) {
      console.error("Start capture failed:", error);
      setStartError("Failed to start capture");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    console.log("[RecordingView] Stop button clicked, stopping capture...");
    
    try {
      const result = await window.pilotstack.stopCapture();
      console.log("[RecordingView] Stop capture result:", {
        success: result.success,
        sessionFolder: result.sessionFolder,
        totalFrames: result.totalFrames,
        error: result.error,
      });
      
      if (result.success && result.sessionFolder) {
        setIsRecording(false);
        setIsPaused(false);
        setErrorMessage(null);
        console.log("[RecordingView] Calling onComplete with:", result.sessionFolder, result.totalFrames);
        onComplete(result.sessionFolder, result.totalFrames);
      } else if (result.sessionFolder && result.totalFrames > 0) {
        // Handle case where success might be false but we have valid data
        console.warn("[RecordingView] Stop reported failure but has data, proceeding anyway");
        setIsRecording(false);
        setIsPaused(false);
        setErrorMessage(result.error || null);
        onComplete(result.sessionFolder, result.totalFrames);
      } else {
        // Handle failure response
        console.error("[RecordingView] Stop capture failed:", result.error);
        setErrorMessage(result.error || "Failed to stop recording. No session data available.");
        setIsRecording(false);
        setIsPaused(false);
      }
    } catch (error) {
      console.error("[RecordingView] Stop capture exception:", error);
      setErrorMessage("Failed to stop recording. Please try again.");
      // Reset recording state to allow retry
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const handlePause = async () => {
    try {
      const result = await window.pilotstack.pauseCapture();
      if (result.success) {
        setIsPaused(true);
      } else {
        setErrorMessage(result.error || "Failed to pause recording");
      }
    } catch (error) {
      console.error("Pause capture error:", error);
      setErrorMessage("Failed to pause recording");
    }
  };

  const handleResume = async () => {
    if (!selectedSource) return;

    try {
      const result = await window.pilotstack.resumeCapture({
        sourceId: selectedSource.id,
      });
      if (result.success) {
        setIsPaused(false);
      } else {
        setErrorMessage(result.error || "Failed to resume recording");
      }
    } catch (error) {
      console.error("Resume capture error:", error);
      setErrorMessage("Failed to resume recording");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col p-4 sm:p-6"
    >
      {/* Header */}
      <div className="text-center mb-4 sm:mb-6 flex-shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
          {isRecording ? "Recording in Progress" : "Create Timelapse"}
        </h1>
        <p className="text-chrono-muted text-xs sm:text-sm">
          {isRecording
            ? "Capturing your creative journey"
            : "Select a screen or window to record"}
        </p>
      </div>

      {/* Error Messages */}
      <AnimatePresence>
        {(errorMessage || startError) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 sm:mb-4 flex-shrink-0"
          >
            <div className="glass-panel p-2.5 sm:p-3 border-l-4 border-red-500 bg-red-500/10">
              <div className="flex items-center gap-2 sm:gap-3">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 flex-shrink-0" />
                <p className="text-xs sm:text-sm text-red-300 break-words">
                  {errorMessage || startError}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-hidden min-h-0">
        {!isRecording ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 overflow-y-auto scroll-container"
          >
            <SourceSelector
              selectedSource={selectedSource}
              onSelect={(source) => {
                setSelectedSource(source);
                setStartError(null);
              }}
            />
          </motion.div>
        ) : (
          <div className="flex-1 overflow-y-auto scroll-container">
            <RecordingStats
              frameCount={frameCount}
              estimatedDuration={estimatedDuration}
              realTimeDuration={realTimeDuration}
              isPaused={isPaused}
              queueSize={queueSize}
              maxQueueSize={maxQueueSize}
              droppedFrames={droppedFrames}
              skippedFrames={skippedFrames}
              adaptiveQuality={adaptiveQuality}
              captureTime={captureTime}
              avgFrameSize={avgFrameSize}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="pt-4 sm:pt-6 border-t border-chrono-border/30 flex-shrink-0">
        {isStarting ? (
          <div className="flex items-center justify-center gap-2 p-3 sm:p-4 text-chrono-muted">
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            <span className="text-xs sm:text-sm font-medium">
              Initializing recording...
            </span>
          </div>
        ) : (
          <RecordingControls
            isRecording={isRecording}
            isPaused={isPaused}
            disabled={!selectedSource}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
          />
        )}

        {!isRecording && !selectedSource && !isStarting && (
          <p className="text-center text-chrono-muted text-[10px] sm:text-xs mt-3 sm:mt-4">
            Select a source to start recording
          </p>
        )}
      </div>
    </motion.div>
  );
}
