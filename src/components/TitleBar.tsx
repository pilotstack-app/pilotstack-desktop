import { motion } from "framer-motion";
import { Settings, Minus, Square, X, Film } from "lucide-react";

interface TitleBarProps {
  onSettings: () => void;
  onRecordings?: () => void;
  showSettings: boolean;
  isSettingsOpen: boolean;
  isRecordingsOpen?: boolean;
}

export function TitleBar({
  onSettings,
  onRecordings,
  showSettings,
  isSettingsOpen,
  isRecordingsOpen = false,
}: TitleBarProps) {
  const isMac = window.platform?.isMac ?? false;

  const handleMinimize = () => window.pilotstack?.minimize();
  const handleMaximize = () => window.pilotstack?.maximize();
  const handleClose = () => window.pilotstack?.close();

  return (
    <header className="drag-region h-10 sm:h-12 flex items-center justify-between px-3 sm:px-4 border-b-2 border-chrono-border/30 bg-chrono-surface/50 backdrop-blur-xl relative z-50 flex-shrink-0">
      {/* macOS traffic lights space */}
      {isMac && <div className="w-14 sm:w-16" />}

      {/* Logo */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <motion.div
          className="w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg bg-gradient-to-br from-chrono-accent to-purple-500 flex items-center justify-center shadow-brutal-sm"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <svg
            className="w-3 h-3 sm:w-4 sm:h-4 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </motion.div>
        <span className="font-semibold text-xs sm:text-sm tracking-wide">pilotstack</span>
      </div>

      {/* Right controls */}
      <div className="no-drag flex items-center gap-0.5 sm:gap-1">
        {onRecordings && showSettings && (
          <motion.button
            onClick={onRecordings}
            className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
              isRecordingsOpen
                ? "bg-chrono-accent/20 text-chrono-accent"
                : "text-chrono-muted hover:text-white hover:bg-chrono-elevated"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Recordings"
          >
            <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </motion.button>
        )}
        {showSettings && (
          <motion.button
            onClick={onSettings}
            className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
              isSettingsOpen
                ? "bg-chrono-accent/20 text-chrono-accent"
                : "text-chrono-muted hover:text-white hover:bg-chrono-elevated"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </motion.button>
        )}

        {!isMac && (
          <div className="flex items-center ml-1.5 sm:ml-2 pl-1.5 sm:pl-2 border-l border-chrono-border/50">
            <button
              onClick={handleMinimize}
              className="p-1.5 sm:p-2 text-chrono-muted hover:text-white hover:bg-chrono-elevated rounded transition-colors"
            >
              <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="p-1.5 sm:p-2 text-chrono-muted hover:text-white hover:bg-chrono-elevated rounded transition-colors"
            >
              <Square className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 sm:p-2 text-chrono-muted hover:text-white hover:bg-chrono-danger rounded transition-colors"
            >
              <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
