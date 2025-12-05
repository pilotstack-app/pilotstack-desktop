import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Square, Loader2, AlertTriangle } from "lucide-react";

interface EmergencyStopButtonProps {
  isVisible: boolean;
  frameCount: number;
  onStop: () => Promise<void>;
}

/**
 * Emergency Stop Button - Always visible floating button during recording
 * This ensures the user can ALWAYS stop recording regardless of UI state
 */
export function EmergencyStopButton({
  isVisible,
  frameCount,
  onStop,
}: EmergencyStopButtonProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset state when visibility changes
  useEffect(() => {
    if (!isVisible) {
      setIsStopping(false);
      setShowConfirm(false);
    }
  }, [isVisible]);

  const handleClick = () => {
    if (isStopping) return;
    setShowConfirm(true);
  };

  const handleConfirmStop = async () => {
    setIsStopping(true);
    setShowConfirm(false);
    try {
      await onStop();
    } catch (error) {
      console.error("Emergency stop failed:", error);
      setIsStopping(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Floating emergency stop button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <motion.button
              onClick={handleClick}
              disabled={isStopping}
              className="relative group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Pulsing ring animation */}
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />

              {/* Main button */}
              <div className="relative flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full shadow-lg shadow-red-500/30 transition-all">
                {isStopping ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Square className="w-5 h-5 fill-current" />
                )}
                <div className="text-left">
                  <div className="text-sm font-semibold">
                    {isStopping ? "Stopping..." : "Stop Recording"}
                  </div>
                  <div className="text-xs text-red-200">
                    {frameCount.toLocaleString()} frames
                  </div>
                </div>
              </div>
            </motion.button>
          </motion.div>

          {/* Confirmation modal */}
          <AnimatePresence>
            {showConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={handleCancel}
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
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Stop Recording?</h3>
                      <p className="text-sm text-chrono-muted">
                        {frameCount.toLocaleString()} frames captured
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-chrono-muted mb-6">
                    This will stop the recording and prepare your frames for
                    video generation. You won't lose any captured frames.
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={handleCancel}
                      className="flex-1 py-2.5 px-4 bg-chrono-bg hover:bg-chrono-border text-white rounded-xl transition-colors"
                    >
                      Continue Recording
                    </button>
                    <button
                      onClick={handleConfirmStop}
                      className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-medium"
                    >
                      Stop & Generate
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
