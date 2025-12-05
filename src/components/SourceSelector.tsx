import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, AppWindow, RefreshCw, Check, Star } from "lucide-react";
import type { ScreenSource } from "../types/electron";
import clsx from "clsx";

interface SourceSelectorProps {
  selectedSource: ScreenSource | null;
  onSelect: (source: ScreenSource) => void;
}

export function SourceSelector({
  selectedSource,
  onSelect,
}: SourceSelectorProps) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"screens" | "windows">("screens");

  const loadSources = async () => {
    setLoading(true);
    try {
      const result = await window.pilotstack.getSources();
      setSources(result);
    } catch (error) {
      console.error("Failed to load sources:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSources();
  }, []);

  const screens = sources.filter((s) => s.id.includes("screen"));
  const windows = sources.filter((s) => s.id.includes("window"));
  const displayedSources = activeTab === "screens" ? screens : windows;

  return (
    <div className="space-y-3 sm:space-y-4 h-full flex flex-col">
      {/* Tab switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 p-1 bg-chrono-bg rounded-xl border-2 border-chrono-border/30 flex-shrink-0">
        <button
          onClick={() => setActiveTab("screens")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-all",
            activeTab === "screens"
              ? "bg-chrono-elevated text-white shadow-brutal-sm"
              : "text-chrono-muted hover:text-white",
          )}
        >
          <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Screens</span>
        </button>
        <button
          onClick={() => setActiveTab("windows")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-all",
            activeTab === "windows"
              ? "bg-chrono-elevated text-white shadow-brutal-sm"
              : "text-chrono-muted hover:text-white",
          )}
        >
          <AppWindow className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Windows</span>
        </button>
        <button
          onClick={loadSources}
          disabled={loading}
          className="p-2 sm:p-2.5 text-chrono-muted hover:text-white rounded-lg transition-colors flex-shrink-0"
        >
          <RefreshCw className={clsx("w-3.5 h-3.5 sm:w-4 sm:h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Sources grid */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin min-h-0">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 sm:py-12 text-center text-chrono-muted text-xs sm:text-sm"
            >
              Loading sources...
            </motion.div>
          ) : displayedSources.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 sm:py-12 text-center text-chrono-muted text-xs sm:text-sm"
            >
              No {activeTab} found
            </motion.div>
          ) : (
            displayedSources.map((source, index) => {
              const isScreen = source.id.includes("screen");
              // Use 1-based index for display number (not the source ID number which can be non-sequential)
              const displayNumber = index + 1;
              // Check if this is the first screen in the list (likely primary)
              const isPrimary = isScreen && index === 0;
              
              // Create display label
              let displayLabel: string;
              if (isScreen) {
                if (screens.length === 1) {
                  displayLabel = "Main Display";
                } else {
                  displayLabel = isPrimary ? `Screen ${displayNumber} (Primary)` : `Screen ${displayNumber}`;
                }
              } else {
                displayLabel = source.name;
              }
              
              return (
                <motion.button
                  key={source.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => onSelect(source)}
                  className={clsx(
                    "w-full flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left",
                    selectedSource?.id === source.id
                      ? "bg-chrono-accent/10 border-chrono-accent/50 shadow-brutal-accent"
                      : "bg-chrono-elevated/50 border-chrono-border hover:border-chrono-accent/30 shadow-brutal-sm",
                  )}
                >
                  {/* Thumbnail with screen number badge */}
                  <div className="relative flex-shrink-0 w-16 h-10 sm:w-20 sm:h-12 rounded-lg overflow-hidden bg-chrono-bg border-2 border-chrono-border">
                    <img
                      src={source.thumbnail}
                      alt={source.name}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Screen number badge - use displayNumber (1-based index) */}
                    {isScreen && screens.length > 1 && (
                      <div className={clsx(
                        "absolute top-0 left-0 px-1.5 py-0.5 text-[10px] font-bold rounded-br-md",
                        isPrimary 
                          ? "bg-chrono-accent text-white"
                          : "bg-chrono-elevated/90 text-chrono-muted border-r border-b border-chrono-border"
                      )}>
                        {displayNumber}
                      </div>
                    )}
                    
                    {/* Selection overlay */}
                    {selectedSource?.id === source.id && (
                      <div className="absolute inset-0 bg-chrono-accent/20 flex items-center justify-center">
                        <Check className="w-4 h-4 sm:w-5 sm:h-5 text-chrono-accent" />
                      </div>
                    )}
                  </div>
                  
                  {/* Labels */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs sm:text-sm font-medium text-white truncate">
                        {displayLabel}
                      </p>
                      {/* Primary indicator for screens */}
                      {isPrimary && screens.length > 1 && (
                        <Star className="w-3 h-3 text-chrono-accent fill-chrono-accent flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] sm:text-xs text-chrono-muted mt-0.5">
                      {isScreen 
                        ? (screens.length > 1 
                            ? `Display ${displayNumber} of ${screens.length}` 
                            : "Display")
                        : "Application"}
                    </p>
                  </div>
                </motion.button>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
