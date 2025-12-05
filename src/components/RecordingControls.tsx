import { motion } from "framer-motion";
import { Play, Square, Pause, Circle } from "lucide-react";
import clsx from "clsx";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function RecordingControls({
  isRecording,
  isPaused,
  disabled,
  onStart,
  onStop,
  onPause,
  onResume,
}: RecordingControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      {!isRecording ? (
        <motion.button
          onClick={onStart}
          disabled={disabled}
          className={clsx(
            "relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-chrono-danger to-red-600",
            "shadow-lg shadow-chrono-danger/30",
            "transition-all duration-300",
            "border-4 border-red-700/50",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          whileHover={!disabled ? { scale: 1.05 } : {}}
          whileTap={!disabled ? { scale: 0.95 } : {}}
        >
          <Circle className="w-6 h-6 sm:w-8 sm:h-8 text-white fill-white" />
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-chrono-danger/50"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.button>
      ) : (
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Pause/Resume button */}
          <motion.button
            onClick={isPaused ? onResume : onPause}
            className={clsx(
              "w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center",
              "bg-chrono-elevated border-2 border-chrono-border",
              "hover:bg-chrono-border/50 transition-colors",
              "shadow-brutal-sm",
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isPaused ? (
              <Play className="w-4 h-4 sm:w-5 sm:h-5 text-white ml-0.5" />
            ) : (
              <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
          </motion.button>

          {/* Stop button */}
          <motion.button
            onClick={onStop}
            className={clsx(
              "relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center",
              "bg-gradient-to-br from-chrono-danger to-red-600",
              "shadow-lg shadow-chrono-danger/30",
              "border-4 border-red-700/50",
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Square className="w-5 h-5 sm:w-7 sm:h-7 text-white fill-white" />
            {!isPaused && (
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-chrono-danger"
                animate={{ scale: [1, 1.1, 1], opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}
