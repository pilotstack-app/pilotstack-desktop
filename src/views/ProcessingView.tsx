import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  Trash2,
} from "lucide-react";
import type {
  VideoProgressData,
  ActivityStats,
  PasteEvent,
  SessionMetadata,
  ValidationProgressData,
} from "../types/electron";

interface ProcessingViewProps {
  sessionFolder: string;
  totalFrames: number;
  onComplete: (outputFile: string, sessionFolder: string, metadata?: SessionMetadata) => void;
  onCancel: () => void;
}

type ProcessingStatus =
  | "idle"
  | "validating"
  | "processing"
  | "error"
  | "success";

export function ProcessingView({
  sessionFolder,
  totalFrames,
  onComplete,
  onCancel,
}: ProcessingViewProps) {
  const [musicPath, setMusicPath] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [validFrameCount, setValidFrameCount] = useState(totalFrames);
  const [retryCount, setRetryCount] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Metadata for verification
  const [_activityStats, setActivityStats] = useState<ActivityStats | null>(
    null,
  );
  const [_pasteEvents, setPasteEvents] = useState<PasteEvent[]>([]);
  const [sessionMetadata, setSessionMetadata] =
    useState<SessionMetadata | null>(null);
  
  // Track validation progress for long recordings
  const [validationProgress, setValidationProgress] = useState(0);
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs to prevent race conditions from React StrictMode double-mounting
  const isMountedRef = useRef(true);
  const validationStartedRef = useRef(false);

  // Listen for validation progress events
  useEffect(() => {
    const unsubscribe = window.pilotstack.onValidationProgress(
      (data: ValidationProgressData) => {
        if (isMountedRef.current) {
          setValidationProgress(data.progress);
          setStatusText(data.message);
        }
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.pilotstack.onVideoProgress(
      (data: VideoProgressData) => {
        if (!isMountedRef.current) return;
        
        const percent =
          data.percent !== undefined
            ? Math.min(data.percent, 99)
            : data.progress !== undefined
              ? Math.min(data.progress, 99)
              : 0;

        setStatusText(data.message || "Processing...");
        setProgress(percent);
      },
    );

    return unsubscribe;
  }, [validFrameCount]);

  // Validate frames and collect metadata on mount
  useEffect(() => {
    console.log("[ProcessingView] Mounted with sessionFolder:", sessionFolder, "totalFrames:", totalFrames);
    
    // Reset mounted ref on mount
    isMountedRef.current = true;
    
    // Prevent double validation from React StrictMode
    if (!validationStartedRef.current) {
      validationStartedRef.current = true;
      validateFrames();
      collectSessionMetadata();
    } else {
      console.log("[ProcessingView] Skipping duplicate validation (StrictMode double-mount)");
    }
    
    return () => {
      console.log("[ProcessingView] Unmounting");
      isMountedRef.current = false;
    };
  }, [sessionFolder]);

  // Collect activity stats, paste events, and keyboard stats for verification
  const collectSessionMetadata = async () => {
    try {
      const [stats, pastes, keyboardStats] = await Promise.all([
        window.pilotstack.getActivityStats(),
        window.pilotstack.getClipboardEvents(),
        window.pilotstack.getKeyboardStats(),
      ]);

      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log("[ProcessingView] Component unmounted, skipping metadata update");
        return;
      }

      if (stats) {
        setActivityStats(stats);
      }
      setPasteEvents(pastes || []);

      // Calculate verification score
      if (stats) {
        const largePastes = (pastes || []).filter((p) => p.isLarge).length;

        // Simple score calculation (the verification package does full calculation)
        // Higher score = more human-like behavior
        let score = 100;

        // Penalize for large pastes (>100 chars)
        score -= largePastes * 15;

        // Penalize if active time is less than 50% of total
        const activeRatio =
          stats.activeDuration / Math.max(stats.totalDuration, 1);
        if (activeRatio < 0.5) {
          score -= 20;
        }

        // Bonus for keyboard activity (indicates real work)
        if (keyboardStats && keyboardStats.estimatedKeystrokes > 100) {
          score += 5;
        }

        // Ensure score is in valid range
        score = Math.max(0, Math.min(100, score));

        const metadata: SessionMetadata = {
          totalDuration: stats.totalDuration,
          activeDuration: stats.activeDuration,
          pasteEventCount: pastes?.length || 0,
          verificationScore: score,
          isVerified: score >= 70 && largePastes === 0,
          // Include keyboard stats for upload
          keyboardStats: keyboardStats ? {
            estimatedKeystrokes: keyboardStats.estimatedKeystrokes || 0,
            estimatedWordsTyped: keyboardStats.estimatedWordsTyped || 0,
            typingBurstCount: keyboardStats.typingBurstCount || 0,
            peakWPM: keyboardStats.peakWPM || 0,
            averageWPM: keyboardStats.averageWPM || 0,
            mouseClicks: keyboardStats.mouseClicks || 0,
            scrollEvents: keyboardStats.scrollEvents || 0,
            typingIntensity: keyboardStats.typingIntensity || 0,
          } : undefined,
        };

        setSessionMetadata(metadata);
        console.log("Session metadata:", metadata);
      }
    } catch (error) {
      console.error("Failed to collect session metadata:", error);
    }
  };

  const validateFrames = async () => {
    console.log("[ProcessingView] Starting frame validation for:", sessionFolder);
    
    if (!isMountedRef.current) {
      console.log("[ProcessingView] Component unmounted, skipping validation");
      return;
    }
    
    setStatus("validating");
    setStatusText("Validating captured frames...");
    setValidationProgress(0);

    // Set a timeout for validation (2 minutes for very long recordings)
    // This prevents the app from appearing stuck forever
    const VALIDATION_TIMEOUT_MS = 120000; // 2 minutes
    
    // Clear any existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      validationTimeoutRef.current = setTimeout(() => {
        reject(new Error("Validation is taking longer than expected. The recording may be very large."));
      }, VALIDATION_TIMEOUT_MS);
    });

    try {
      console.log("[ProcessingView] Calling validateFrames IPC...");
      // Race between validation and timeout
      const result = await Promise.race([
        window.pilotstack.validateFrames({ sessionFolder }),
        timeoutPromise,
      ]);
      console.log("[ProcessingView] validateFrames result:", result);

      // Clear timeout on success
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }

      // Check if component is still mounted before updating state
      if (!isMountedRef.current) {
        console.log("[ProcessingView] Component unmounted after validation, skipping state update");
        return;
      }

      if (result.success && result.validFrames && result.validFrames > 0) {
        console.log("[ProcessingView] Validation successful, valid frames:", result.validFrames);
        setValidFrameCount(result.validFrames);
        setStatus("idle");
        console.log("[ProcessingView] Status set to idle, ready for generation");
        setStatusText("");
        setValidationProgress(100);

        if (result.validFrames < totalFrames) {
          setStatusText(
            `${result.validFrames} valid frames (${totalFrames - result.validFrames} removed)`,
          );
        }
      } else {
        const error = result.error || (result.validFrames === 0 ? "No frames captured" : "Unknown validation error");
        console.error("[ProcessingView] Validation failed:", error);
        setStatus("error");
        
        // Provide more helpful error messages based on the situation
        let errorMsg = result.error;
        if (!errorMsg || result.validFrames === 0) {
          // Check if this is likely a permission issue
          errorMsg = "No video segments captured. This usually means:\n\n" +
            "1. Screen Recording permission was not granted\n" +
            "2. FFmpeg failed to start the capture\n" +
            "3. The recording folder is missing or inaccessible\n\n" +
            "Please check:\n" +
            "• System Settings → Privacy & Security → Screen Recording\n" +
            "• Ensure pilotstack (or Electron) has permission enabled\n" +
            "• You may need to restart the app after granting permission";
        }
        
        setErrorMessage(errorMsg);
      }
    } catch (error) {
      // Clear timeout on error
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }
      
      // Check if component is still mounted before updating state
      if (!isMountedRef.current) {
        console.log("[ProcessingView] Component unmounted after error, skipping state update");
        return;
      }
      
      console.error("[ProcessingView] Frame validation error:", error);
      setStatus("error");
      
      // Provide more helpful error messages
      const errorMsg = error instanceof Error ? error.message : "Failed to validate frames";
      if (errorMsg.includes("timeout") || errorMsg.includes("taking longer")) {
        setErrorMessage(
          "Validation timed out. For very long recordings (8+ hours), try waiting a bit longer or generating the video anyway."
        );
      } else {
        setErrorMessage(errorMsg);
      }
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectMusic = async () => {
    const path = await window.pilotstack.selectMusic();
    if (path) {
      setMusicPath(path);
    }
  };

  const handleRemoveMusic = () => {
    setMusicPath(null);
  };

  const handleGenerate = async () => {
    setStatus("processing");
    setProgress(0);
    setStatusText("Starting video generation...");
    setErrorMessage("");

    try {
      console.log("[ProcessingView] Starting video generation:", { sessionFolder, musicPath: musicPath || undefined });
      
      // Pass metadata to embed stats overlay in video
      const result = await window.pilotstack.generateVideo({
        sessionFolder,
        musicPath: musicPath || undefined,
        metadata: sessionMetadata || undefined,
      });

      console.log("[ProcessingView] Video generation result:", result);

      if (result.success && result.outputFile) {
        setStatus("success");
        setProgress(100);
        setStatusText("Complete!");
        // Pass metadata and sessionFolder to CompletedView for potential upload
        // sessionFolder is needed so upload service can find metrics.json
        setTimeout(
          () => onComplete(result.outputFile, sessionFolder, sessionMetadata || undefined),
          500,
        );
      } else {
        // Handle case where result doesn't have expected structure
        const errorMsg = result.error || "Video generation failed - no output file";
        console.error("[ProcessingView] Generation failed:", errorMsg);
        setStatus("error");
        setErrorMessage(errorMsg);
        setStatusText("");
      }
    } catch (error) {
      console.error("[ProcessingView] Video generation exception:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Video generation failed",
      );
      setStatusText("");
    }
  };

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    setErrorMessage("");
    handleGenerate();
  };

  const getMusicFileName = (path: string) => {
    return path.split("/").pop() || path.split("\\").pop() || path;
  };

  const handleCancelClick = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onCancel();
  };

  const isProcessing = status === "processing" || status === "validating";
  const canGenerate = status === "idle" && validFrameCount > 0;

  // Debug logging to track state during render
  console.log("[ProcessingView] Render:", { status, isProcessing, canGenerate, validFrameCount });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col p-4 sm:p-6"
    >
      {/* Header */}
      <div className="text-center mb-4 sm:mb-8 flex-shrink-0">
        <motion.div
          className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-xl sm:rounded-2xl flex items-center justify-center ${
            status === "error"
              ? "bg-gradient-to-br from-red-500 to-red-700"
              : status === "success"
                ? "bg-gradient-to-br from-green-500 to-emerald-600"
                : "bg-gradient-to-br from-chrono-accent to-purple-500"
          }`}
          animate={isProcessing ? { rotate: 360 } : {}}
          transition={{
            duration: 2,
            repeat: isProcessing ? Infinity : 0,
            ease: "linear",
          }}
        >
          {status === "error" ? (
            <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          ) : status === "success" ? (
            <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          ) : (
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          )}
        </motion.div>
        <h1 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">
          {status === "error"
            ? "Generation Failed"
            : status === "success"
              ? "Video Ready!"
              : status === "validating"
                ? "Validating Frames"
                : isProcessing
                  ? "Creating Your Video"
                  : "Finalize Your Timelapse"}
        </h1>
        <p className="text-chrono-muted text-xs sm:text-sm break-words px-2">
          {status === "error"
            ? errorMessage
            : isProcessing
              ? statusText
              : statusText ||
                `${validFrameCount.toLocaleString()} frames ready`}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {status === "error" ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex flex-col overflow-y-auto"
          >
            <div className="glass-panel p-4 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-red-400 mb-1 text-sm sm:text-base">
                    Error Details
                  </h3>
                  <p className="text-xs sm:text-sm text-chrono-muted break-words">{errorMessage}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3 mt-auto flex-shrink-0">
              {retryCount < 3 && (
                <button
                  onClick={handleRetry}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Generation
                </button>
              )}
              <button onClick={handleCancelClick} className="btn-ghost w-full">
                Go Back
              </button>
            </div>
          </motion.div>
        ) : !isProcessing && status !== "success" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-y-auto scroll-container"
          >
            {/* Frame info */}
            {validFrameCount < totalFrames && (
              <div className="glass-panel p-3 sm:p-4 mb-3 sm:mb-4 border-l-4 border-yellow-500 flex-shrink-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 flex-shrink-0" />
                  <p className="text-xs sm:text-sm text-chrono-muted">
                    {totalFrames - validFrameCount} corrupted frames removed.
                    Video will use {validFrameCount} valid frames.
                  </p>
                </div>
              </div>
            )}

            {/* Music selection */}
            <div className="flex-1 min-h-0">
              <div className="glass-panel p-4 sm:p-5">
                <h3 className="font-medium mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                  <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chrono-accent" />
                  Background Music
                  <span className="text-chrono-muted text-[10px] sm:text-xs">(optional)</span>
                </h3>

                {musicPath ? (
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-chrono-bg rounded-xl">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-chrono-accent/20 flex items-center justify-center flex-shrink-0">
                      <Music className="w-4 h-4 sm:w-5 sm:h-5 text-chrono-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">
                        {getMusicFileName(musicPath)}
                      </p>
                      <p className="text-[10px] sm:text-xs text-chrono-muted">Audio track</p>
                    </div>
                    <button
                      onClick={handleRemoveMusic}
                      className="p-1.5 sm:p-2 text-chrono-muted hover:text-chrono-danger transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSelectMusic}
                    className="w-full p-3 sm:p-4 border-2 border-dashed border-chrono-border rounded-xl text-chrono-muted hover:border-chrono-accent/50 hover:text-white transition-all"
                  >
                    <Music className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 opacity-50" />
                    <p className="text-xs sm:text-sm">Click to add background music</p>
                    <p className="text-[10px] sm:text-xs mt-1 opacity-50">
                      MP3, WAV, AAC supported
                    </p>
                  </button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 sm:space-y-3 pt-4 sm:pt-6 flex-shrink-0">
              <button
                onClick={handleGenerate}
                className="btn-primary w-full"
                disabled={!canGenerate}
              >
                Generate Video
              </button>
              <button onClick={handleCancelClick} className="btn-ghost w-full">
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col justify-center"
          >
            {/* Progress */}
            <div className="glass-panel p-4 sm:p-6">
              {/* Progress bar */}
              <div className="mb-4 sm:mb-6">
                <div className="flex justify-between text-xs sm:text-sm mb-1.5 sm:mb-2">
                  <span className="text-chrono-muted">
                    {status === "validating" ? "Validating" : "Progress"}
                  </span>
                  <span className="font-mono font-medium">
                    {Math.round(status === "validating" ? validationProgress : progress)}%
                  </span>
                </div>
                <div className="h-2.5 sm:h-3 bg-chrono-bg rounded-full overflow-hidden border-2 border-chrono-border/30">
                  <motion.div
                    className={`h-full rounded-full ${
                      status === "success"
                        ? "bg-gradient-to-r from-green-500 to-emerald-500"
                        : status === "validating"
                          ? "bg-gradient-to-r from-blue-500 to-cyan-500"
                          : "bg-gradient-to-r from-chrono-accent to-purple-500"
                    }`}
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${status === "validating" ? validationProgress : progress}%` 
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 text-chrono-muted">
                {status === "success" ? (
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                ) : (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                )}
                <span className="text-xs sm:text-sm truncate">{statusText}</span>
              </div>

              {/* Long recording hint during validation */}
              {status === "validating" && validationProgress > 0 && validationProgress < 100 && (
                <p className="text-[10px] sm:text-xs text-chrono-muted text-center mt-3 opacity-70">
                  For long recordings (8+ hours), validation may take a moment...
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCancelConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-chrono-elevated border border-chrono-border rounded-2xl p-6 max-w-sm mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Discard Recording?</h3>
                  <p className="text-sm text-chrono-muted">
                    Are you sure you want to discard this recording?
                  </p>
                </div>
              </div>

              <p className="text-sm text-chrono-muted mb-6">
                Are you sure you want to discard this recording? The captured
                frames will not be saved.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-2.5 px-4 bg-chrono-bg hover:bg-chrono-border text-white rounded-xl transition-colors"
                >
                  Keep Recording
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-medium"
                >
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
