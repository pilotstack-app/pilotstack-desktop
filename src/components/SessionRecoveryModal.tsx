import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  Trash2,
  Play,
  Loader2,
  Clock,
  Layers,
  AlertCircle,
} from "lucide-react";
import type { RecoverableSession } from "../types/electron";

interface SessionRecoveryModalProps {
  session: RecoverableSession | null;
  onRecover: (sessionFolder: string) => Promise<void>;
  onDiscard: () => Promise<void>;
  onClose: () => void;
}

/**
 * Session Recovery Modal - Shown when app detects an incomplete recording session
 * This ensures users never lose their recorded frames
 */
export function SessionRecoveryModal({
  session,
  onRecover,
  onDiscard,
  onClose,
}: SessionRecoveryModalProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  const formatDuration = (startTime: number) => {
    const duration = Date.now() - startTime;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    }
    return `${minutes}m ago`;
  };

  const handleRecover = async () => {
    setIsRecovering(true);
    setError(null);
    try {
      await onRecover(session.sessionFolder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
      setIsRecovering(false);
    }
  };

  const handleDiscard = async () => {
    setIsDiscarding(true);
    setError(null);
    try {
      await onDiscard();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to discard session",
      );
      setIsDiscarding(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-chrono-elevated border border-chrono-border rounded-2xl p-6 max-w-md mx-4 shadow-2xl"
        >
          {/* Header with icon */}
          <div className="text-center mb-6">
            <motion.div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(245, 158, 11, 0)",
                  "0 0 0 10px rgba(245, 158, 11, 0.1)",
                  "0 0 0 0 rgba(245, 158, 11, 0)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <FolderOpen className="w-8 h-8 text-white" />
            </motion.div>
            <h2 className="text-xl font-bold mb-2">Recording Session Found</h2>
            <p className="text-chrono-muted text-sm">
              A previous recording session was interrupted. Would you like to
              recover it?
            </p>
          </div>

          {/* Session details */}
          <div className="bg-chrono-bg rounded-xl p-4 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-chrono-muted">
                <Layers className="w-4 h-4" />
                <span className="text-sm">Frames captured</span>
              </div>
              <span className="font-mono font-semibold text-chrono-accent">
                {(
                  session.actualFrameCount || session.frameCount
                ).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-chrono-muted">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Started</span>
              </div>
              <span className="text-sm">
                {formatDuration(session.startTime)}
              </span>
            </div>

            <div className="pt-2 border-t border-chrono-border">
              <p
                className="text-xs text-chrono-muted truncate"
                title={session.sessionFolder}
              >
                📁 {session.sessionFolder.split("/").pop()}
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleRecover}
              disabled={isRecovering || isDiscarding}
              className="w-full py-3 px-4 bg-gradient-to-r from-chrono-accent to-purple-500 hover:from-chrono-accent/90 hover:to-purple-500/90 text-white rounded-xl transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isRecovering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Recovering...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Recover & Generate Video
                </>
              )}
            </button>

            <button
              onClick={handleDiscard}
              disabled={isRecovering || isDiscarding}
              className="w-full py-3 px-4 bg-chrono-bg hover:bg-chrono-border text-chrono-muted hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isDiscarding ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Discarding...
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  Discard & Start Fresh
                </>
              )}
            </button>
          </div>

          {/* Warning */}
          <p className="text-xs text-chrono-muted text-center mt-4">
            ⚠️ Discarding will permanently delete all captured frames
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
