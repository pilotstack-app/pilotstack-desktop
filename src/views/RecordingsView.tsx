import { useState, useEffect, useCallback, useRef, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Cloud,
  CloudOff,
  Loader2,
  Play,
  Trash2,
  FolderOpen,
  RefreshCw,
  AlertCircle,
  Clock,
  Film,
  HardDrive,
  Upload,
  ExternalLink,
  Shield,
  ShieldOff,
  MoreVertical,
  X,
  Edit3,
  Check,
} from "lucide-react";
import clsx from "clsx";
import type { Recording, RecordingStatus } from "../types/electron";

interface RecordingsViewProps {
  onClose: () => void;
}

// Status badge configuration with descriptions
const STATUS_CONFIG: Record<
  RecordingStatus,
  { 
    label: string; 
    color: string; 
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }
> = {
  recording: { 
    label: "Recording", 
    color: "bg-red-500", 
    icon: Loader2,
    description: "Currently recording screen"
  },
  processing: { 
    label: "Processing", 
    color: "bg-yellow-500", 
    icon: Loader2,
    description: "Creating video from frames"
  },
  ready: { 
    label: "Local Only", 
    color: "bg-amber-500", 
    icon: HardDrive,
    description: "Saved locally, not synced to cloud"
  },
  upload_queued: { 
    label: "Queued", 
    color: "bg-blue-500", 
    icon: Clock,
    description: "Waiting to upload"
  },
  uploading: { 
    label: "Uploading", 
    color: "bg-chrono-accent", 
    icon: Upload,
    description: "Syncing to cloud..."
  },
  uploaded: { 
    label: "Synced", 
    color: "bg-emerald-500", 
    icon: Cloud,
    description: "Available on pilotstack.app"
  },
  failed: { 
    label: "Failed", 
    color: "bg-red-500", 
    icon: AlertCircle,
    description: "Upload failed, retry available"
  },
};

export function RecordingsView({ onClose }: RecordingsViewProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [diskUsage, setDiskUsage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
    loadDiskUsage();
    checkAuthState();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [activeMenu]);

  // Subscribe to recordings changes
  useEffect(() => {
    const unsubscribe = window.pilotstack.onRecordingsChanged((data) => {
      setRecordings(data.recordings);
    });
    return unsubscribe;
  }, []);

  // Subscribe to upload progress
  useEffect(() => {
    const unsubscribeProgress = window.pilotstack.onRecordingUploadProgress(
      ({ id, progress }) => {
        setRecordings((prev) =>
          prev.map((r) => (r.id === id ? { ...r, uploadProgress: progress } : r))
        );
      }
    );

    const unsubscribeComplete = window.pilotstack.onRecordingUploadComplete(
      ({ id, cloudUrl }) => {
        setRecordings((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: "uploaded", cloudUrl, uploadProgress: 100 }
              : r
          )
        );
      }
    );

    const unsubscribeFailed = window.pilotstack.onRecordingUploadFailed(
      ({ id, error }) => {
        setRecordings((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "failed", uploadError: error } : r
          )
        );
      }
    );

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeFailed();
    };
  }, []);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthTokenReceived((data) => {
      if (data.success) {
        setIsConnected(true);
      }
    });
    return unsubscribe;
  }, []);

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      const result = await window.pilotstack.getRecordings();
      if (result.success) {
        setRecordings(result.recordings);
      }
    } catch (error) {
      console.error("Failed to load recordings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDiskUsage = async () => {
    try {
      const result = await window.pilotstack.getRecordingsDiskUsage();
      if (result.success && result.formattedSize) {
        setDiskUsage(result.formattedSize);
      }
    } catch (error) {
      console.error("Failed to load disk usage:", error);
    }
  };

  const checkAuthState = async () => {
    try {
      const state = await window.pilotstack.getAuthState();
      setIsConnected(state.isConnected);
    } catch (error) {
      console.error("Failed to check auth state:", error);
    }
  };

  const handlePlayVideo = useCallback((recording: Recording) => {
    window.pilotstack.openFile(recording.videoPath);
  }, []);

  const handleOpenFolder = useCallback((recording: Recording) => {
    window.pilotstack.openInFolder(recording.videoPath);
  }, []);

  const handleDelete = useCallback(
    async (id: string, deleteFiles: boolean) => {
      try {
        await window.pilotstack.deleteRecording(id, deleteFiles);
        setShowDeleteConfirm(null);
        loadDiskUsage();
      } catch (error) {
        console.error("Failed to delete recording:", error);
      }
    },
    []
  );

  const handleUpload = useCallback(async (recording: Recording) => {
    try {
      const result = await window.pilotstack.requestRecordingUpload(recording.id);
      if (result.needsAuth) {
        // Open connect flow
        const device = await window.pilotstack.getDeviceInfo();
        if (device?.deviceId) {
          const isPackaged = await window.pilotstack.isPackaged();
          const webAppUrl = isPackaged
            ? "https://pilotstack.app"
            : "http://localhost:3000";
          const connectUrl = `${webAppUrl}/connect?device_id=${encodeURIComponent(device.deviceId)}`;
          await window.pilotstack.openConnectUrl({ url: connectUrl });
        }
      }
    } catch (error) {
      console.error("Failed to request upload:", error);
    }
  }, []);

  const handleRetryUpload = useCallback(async (recording: Recording) => {
    try {
      await window.pilotstack.retryRecordingUpload(recording.id);
    } catch (error) {
      console.error("Failed to retry upload:", error);
    }
  }, []);

  const handleSaveTitle = useCallback(async (id: string, title: string) => {
    try {
      await window.pilotstack.updateRecordingTitle(id, title);
      setEditingTitle(null);
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col"
    >
      {/* Header - Fixed */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 -ml-2 text-chrono-muted hover:text-white transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">Recordings</h1>
              <p className="text-chrono-muted text-xs sm:text-sm truncate">
                {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
                {diskUsage && ` · ${diskUsage}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.pilotstack.openRecordingsFolder()}
              className="p-2 text-chrono-muted hover:text-white transition-colors flex-shrink-0"
              title="Open Recordings Folder"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
            <button
              onClick={loadRecordings}
              className="p-2 text-chrono-muted hover:text-white transition-colors flex-shrink-0"
              title="Refresh"
            >
              <RefreshCw className={clsx("w-5 h-5", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* Recordings list - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 scrollbar-thin">
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-chrono-muted" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-chrono-muted">
              <Film className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">No recordings yet</p>
              <p className="text-xs mt-1">Start recording to see your videos here</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {recordings.map((recording, index) => (
                <RecordingCard
                  key={recording.id}
                  recording={recording}
                  index={index}
                  isConnected={isConnected}
                  editingTitle={editingTitle}
                  editTitleValue={editTitleValue}
                  setEditingTitle={setEditingTitle}
                  setEditTitleValue={setEditTitleValue}
                  showDeleteConfirm={showDeleteConfirm}
                  setShowDeleteConfirm={setShowDeleteConfirm}
                  activeMenu={activeMenu}
                  setActiveMenu={setActiveMenu}
                  onPlay={handlePlayVideo}
                  onOpenFolder={handleOpenFolder}
                  onUpload={handleUpload}
                  onRetryUpload={handleRetryUpload}
                  onDelete={handleDelete}
                  onSaveTitle={handleSaveTitle}
                  formatDuration={formatDuration}
                  formatDate={formatDate}
                  formatFileSize={formatFileSize}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface RecordingCardProps {
  recording: Recording;
  index: number;
  isConnected: boolean;
  editingTitle: string | null;
  editTitleValue: string;
  setEditingTitle: (id: string | null) => void;
  setEditTitleValue: (value: string) => void;
  showDeleteConfirm: string | null;
  setShowDeleteConfirm: (id: string | null) => void;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
  onPlay: (recording: Recording) => void;
  onOpenFolder: (recording: Recording) => void;
  onUpload: (recording: Recording) => void;
  onRetryUpload: (recording: Recording) => void;
  onDelete: (id: string, deleteFiles: boolean) => void;
  onSaveTitle: (id: string, title: string) => void;
  formatDuration: (seconds: number) => string;
  formatDate: (timestamp: number) => string;
  formatFileSize: (bytes: number) => string;
}

const RecordingCard = forwardRef<HTMLDivElement, RecordingCardProps>(function RecordingCard({
  recording,
  index,
  isConnected,
  editingTitle,
  editTitleValue,
  setEditingTitle,
  setEditTitleValue,
  showDeleteConfirm,
  setShowDeleteConfirm,
  activeMenu,
  setActiveMenu,
  onPlay,
  onOpenFolder,
  onUpload,
  onRetryUpload,
  onDelete,
  onSaveTitle,
  formatDuration,
  formatDate,
  formatFileSize,
}, ref) {
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<"bottom" | "top">("bottom");
  
  const statusConfig = STATUS_CONFIG[recording.status];
  const StatusIcon = statusConfig.icon;

  const isEditing = editingTitle === recording.id;
  const canUpload = ["ready", "failed"].includes(recording.status);
  const isUploading = recording.status === "uploading";
  const isUploaded = recording.status === "uploaded";
  const showMenu = activeMenu === recording.id;

  // Calculate menu position based on available space
  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showMenu) {
      setActiveMenu(null);
      return;
    }
    
    // Check if there's enough space below
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 140; // Approximate menu height
      setMenuPosition(spaceBelow < menuHeight ? "top" : "bottom");
    }
    
    setActiveMenu(recording.id);
  };

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.03 }}
      className={clsx(
        "relative rounded-xl border-2 border-chrono-border bg-chrono-surface",
        "shadow-brutal-sm hover:shadow-brutal hover:border-chrono-accent/50",
        "transition-all duration-200"
      )}
    >
      {/* Status indicator stripe */}
      <div className={clsx("h-1 rounded-t-[10px]", statusConfig.color)} />

      <div className="p-3 sm:p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveTitle(recording.id, editTitleValue);
                    if (e.key === "Escape") setEditingTitle(null);
                  }}
                  className="flex-1 min-w-0 bg-chrono-bg border border-chrono-border rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-chrono-accent"
                  autoFocus
                />
                <button
                  onClick={() => onSaveTitle(recording.id, editTitleValue)}
                  className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded flex-shrink-0"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingTitle(null)}
                  className="p-1 text-chrono-muted hover:text-white flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h3 className="font-semibold text-sm truncate pr-2">
                {recording.title}
              </h3>
            )}
            <p className="text-xs text-chrono-muted mt-0.5">
              {formatDate(recording.createdAt)}
            </p>
          </div>

          {/* Status badge with tooltip */}
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <div
              className={clsx(
                "flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium",
                statusConfig.color,
                "text-white"
              )}
              title={statusConfig.description}
            >
              <StatusIcon
                className={clsx(
                  "w-2.5 h-2.5 sm:w-3 sm:h-3",
                  (recording.status === "uploading" || recording.status === "processing") &&
                    "animate-spin"
                )}
              />
              <span className="hidden sm:inline">{statusConfig.label}</span>
            </div>
            <span className="text-[9px] text-chrono-muted hidden sm:block max-w-[120px] truncate">
              {statusConfig.description}
            </span>
          </div>
        </div>

        {/* Stats row - responsive grid */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-chrono-muted mb-2 sm:mb-3">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>{formatDuration(recording.duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Film className="w-3 h-3 flex-shrink-0" />
            <span>{recording.frameCount} frames</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive className="w-3 h-3 flex-shrink-0" />
            <span>{formatFileSize(recording.fileSize)}</span>
          </div>
          {recording.isVerified ? (
            <div className="flex items-center gap-1 text-emerald-400">
              <Shield className="w-3 h-3 flex-shrink-0" />
              <span>{recording.verificationScore}%</span>
            </div>
          ) : recording.verificationScore > 0 ? (
            <div className="flex items-center gap-1 text-yellow-400">
              <ShieldOff className="w-3 h-3 flex-shrink-0" />
              <span>{recording.verificationScore}%</span>
            </div>
          ) : null}
        </div>

        {/* Upload progress bar */}
        {isUploading && (
          <div className="mb-2 sm:mb-3">
            <div className="h-1.5 bg-chrono-bg rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-chrono-accent rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${recording.uploadProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-[10px] sm:text-xs text-chrono-muted mt-1 text-center">
              Uploading... {recording.uploadProgress}%
            </p>
          </div>
        )}

        {/* Error message */}
        {recording.status === "failed" && recording.uploadError && (
          <div className="mb-2 sm:mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-[10px] sm:text-xs text-red-400 break-words">{recording.uploadError}</p>
          </div>
        )}

        {/* Cloud URL if uploaded */}
        {isUploaded && recording.cloudRecordingId && (
          <div className="mb-2 sm:mb-3 p-2 sm:p-3 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] sm:text-xs font-medium text-emerald-400">
                Available on pilotstack
              </span>
            </div>
            <a
              href={`https://pilotstack.app/recordings/${recording.cloudRecordingId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] sm:text-xs text-chrono-muted hover:text-white transition-colors group"
            >
              <span className="truncate">pilotstack.app/recordings/{recording.cloudRecordingId.slice(0, 8)}...</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 group-hover:text-chrono-accent" />
            </a>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPlay(recording)}
            className={clsx(
              "flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-[10px] sm:text-xs font-medium",
              "bg-chrono-accent text-white",
              "hover:bg-chrono-accent/80 transition-colors",
              "flex items-center justify-center gap-1 sm:gap-1.5",
              "border-2 border-chrono-accent/50",
              "shadow-brutal-sm active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
            )}
          >
            <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Play</span>
          </button>

          {canUpload && (
            <button
              onClick={() =>
                recording.status === "failed"
                  ? onRetryUpload(recording)
                  : onUpload(recording)
              }
              className={clsx(
                "flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-[10px] sm:text-xs font-medium",
                "bg-chrono-bg border-2 border-chrono-border",
                "hover:border-chrono-accent/50 hover:bg-chrono-elevated transition-colors",
                "flex items-center justify-center gap-1 sm:gap-1.5",
                "shadow-brutal-sm active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              )}
            >
              {recording.status === "failed" ? (
                <>
                  <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Retry</span>
                </>
              ) : isConnected ? (
                <>
                  <Cloud className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Upload</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Connect</span>
                </>
              )}
            </button>
          )}

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              ref={buttonRef}
              onClick={handleMenuToggle}
              className={clsx(
                "p-1.5 sm:p-2 rounded-lg text-chrono-muted",
                "hover:text-white hover:bg-chrono-bg transition-colors",
                "border-2 border-transparent hover:border-chrono-border",
                showMenu && "bg-chrono-bg border-chrono-border text-white"
              )}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className={clsx(
                    "absolute right-0 z-50",
                    menuPosition === "top" ? "bottom-full mb-1" : "top-full mt-1",
                    "bg-chrono-elevated border-2 border-chrono-border rounded-xl",
                    "shadow-brutal py-1 min-w-[160px]"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      setEditingTitle(recording.id);
                      setEditTitleValue(recording.title);
                    }}
                    className="w-full px-3 py-2.5 text-xs text-left hover:bg-chrono-bg flex items-center gap-2 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      onOpenFolder(recording);
                    }}
                    className="w-full px-3 py-2.5 text-xs text-left hover:bg-chrono-bg flex items-center gap-2 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Show in Folder
                  </button>
                  <div className="border-t border-chrono-border my-1" />
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      setShowDeleteConfirm(recording.id);
                    }}
                    className="w-full px-3 py-2.5 text-xs text-left hover:bg-red-500/10 text-red-400 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal - Portal-style overlay */}
      <AnimatePresence>
        {showDeleteConfirm === recording.id && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-chrono-surface border-2 border-chrono-border rounded-xl p-4 w-full max-w-xs shadow-brutal"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="font-semibold text-sm mb-2">Delete Recording?</h4>
              <p className="text-xs text-chrono-muted mb-4">
                This will remove the recording from your library.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => onDelete(recording.id, true)}
                  className="w-full py-2.5 px-3 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors shadow-brutal-sm active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                >
                  Delete video file too
                </button>
                <button
                  onClick={() => onDelete(recording.id, false)}
                  className="w-full py-2.5 px-3 bg-chrono-bg border-2 border-chrono-border rounded-lg text-xs hover:bg-chrono-elevated transition-colors"
                >
                  Keep file, remove from library
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="w-full py-2 px-3 text-xs text-chrono-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
