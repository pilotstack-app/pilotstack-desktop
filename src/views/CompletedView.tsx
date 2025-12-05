import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  Play,
  FolderOpen,
  Plus,
  Cloud,
  CloudOff,
  Loader2,
  Shield,
  ShieldOff,
  Clock,
  Clipboard,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  X,
  Check,
  Film,
} from "lucide-react";
import clsx from "clsx";
import type { SessionMetadata, UserProfile } from "../types/electron";

interface CompletedViewProps {
  outputFile: string;
  metadata?: SessionMetadata;
  recordingId?: string | null;
  onStartNew: () => void;
  onOpenRecordings?: () => void;
}

// Web app URL - will be determined dynamically based on app packaging
const getWebAppUrl = async (): Promise<string> => {
  if (typeof window === "undefined") {
    return "https://pilotstack.app";
  }
  try {
    const isPackaged = await window.pilotstack.isPackaged();
    return isPackaged
      ? "https://pilotstack.app"
      : "http://localhost:3000";
  } catch (error) {
    console.error("Failed to check if app is packaged:", error);
    return "https://pilotstack.app";
  }
};

type ConnectionState = "connected" | "expired" | "disconnected" | "connecting";

export function CompletedView({
  outputFile,
  metadata,
  recordingId,
  onStartNew,
  onOpenRecordings,
}: CompletedViewProps) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [_currentRecording, setCurrentRecording] = useState<{
    status?: string;
    uploadError?: string | null;
  } | null>(null);

  // Check auth state on mount and determine connection state
  const checkAuthState = useCallback(async () => {
    try {
      const authState = await window.pilotstack.getAuthState();

      // Store user profile if available
      if (authState.userProfile) {
        setUserProfile(authState.userProfile);
      }

      // Case 1: Fully expired session (was connected but refresh token expired)
      if (authState.sessionExpired || (authState.wasConnected && !authState.isConnected)) {
        setConnectionState("expired");
        return;
      }

      // Case 2: Never connected
      if (!authState.isConnected && !authState.wasConnected) {
        setConnectionState("disconnected");
        setUserProfile(null);
        return;
      }

      // Case 3: Connected but access token needs refresh
      if (authState.needsRefresh) {
        setConnectionState("expired");
        return;
      }

      // Case 4: Fully connected and valid
      setConnectionState("connected");
    } catch (error) {
      console.error("Failed to check auth state:", error);
      setConnectionState("disconnected");
    }
  }, []);

  useEffect(() => {
    checkAuthState();
  }, [checkAuthState]);

  // Load current recording from library if we have an ID
  useEffect(() => {
    if (recordingId) {
      window.pilotstack.getRecording(recordingId).then((result) => {
        if (result.success && result.recording) {
          setCurrentRecording(result.recording);
          // Sync upload status with recording
          if (result.recording.status === "uploaded") {
            setUploadStatus("success");
          } else if (result.recording.status === "uploading") {
            setUploadStatus("uploading");
            setIsUploading(true);
          } else if (result.recording.status === "failed") {
            setUploadStatus("error");
            setUploadError(result.recording.uploadError || "Upload failed");
          }
        }
      });
    }
  }, [recordingId]);

  // Listen for upload progress events
  useEffect(() => {
    const unsubscribeProgress = window.pilotstack.onRecordingUploadProgress(
      ({ id, progress }) => {
        if (id === recordingId) {
          setUploadProgress(progress);
        }
      }
    );

    const unsubscribeComplete = window.pilotstack.onRecordingUploadComplete(
      ({ id, cloudUrl: _cloudUrl }) => {
        if (id === recordingId) {
          setUploadStatus("success");
          setIsUploading(false);
          setUploadProgress(100);
        }
      }
    );

    const unsubscribeFailed = window.pilotstack.onRecordingUploadFailed(
      ({ id, error }) => {
        if (id === recordingId) {
          setUploadStatus("error");
          setUploadError(error);
          setIsUploading(false);
        }
      }
    );

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeFailed();
    };
  }, [recordingId]);

  // Listen for auth token received (reconnection success)
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthTokenReceived((data) => {
      console.log("Auth token received:", data);
      if (data.success) {
        // Re-check auth state to get full updated state
        checkAuthState().then(() => {
          setConnectionState("connected");
          setIsReconnecting(false);
          setShowReconnectModal(false);
          setUploadError(null);
        });
        // Fetch updated profile
        window.pilotstack.getUserProfile().then((profile) => {
          if (profile) setUserProfile(profile);
        });
      }
    });
    return unsubscribe;
  }, [checkAuthState]);

  // Listen for token refresh events
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthTokenRefreshed((data) => {
      if (data.success) {
        setConnectionState("connected");
        setUploadError(null);
      } else {
        setConnectionState("expired");
      }
    });
    return unsubscribe;
  }, []);

  // Listen for session expiry
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthSessionExpired(() => {
      setConnectionState("expired");
      setUserProfile(null);
      setUploadError("Authentication expired. Please reconnect to upload.");
    });
    return unsubscribe;
  }, []);

  // Listen for profile updates
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthProfileUpdated((profile) => {
      setUserProfile(profile);
    });
    return unsubscribe;
  }, []);

  const handleOpenFile = () => {
    window.pilotstack.openFile(outputFile);
  };

  const handleOpenFolder = () => {
    window.pilotstack.openInFolder(outputFile);
  };

  const handleUpload = async () => {
    if (isUploading) return;

    // Use recordings library if we have a recording ID
    if (recordingId) {
      setIsUploading(true);
      setUploadStatus("uploading");
      setUploadError(null);
      setUploadProgress(0);

      try {
        const result = await window.pilotstack.requestRecordingUpload(recordingId);

        if (result.needsAuth) {
          // Need to connect first - the upload will be queued
          setIsUploading(false);
          setUploadStatus("idle");
          const device = await window.pilotstack.getDeviceInfo();
          if (device?.deviceId) {
            setConnectionState("connecting");
            const webAppUrl = await getWebAppUrl();
            const connectUrl = `${webAppUrl}/connect?device_id=${encodeURIComponent(device.deviceId)}`;
            await window.pilotstack.openConnectUrl({ url: connectUrl });
          }
          return;
        }

        if (!result.success) {
          throw new Error(result.error || "Upload failed");
        }

        // Upload will complete via event listener
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadStatus("error");
        setIsUploading(false);

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        if (
          errorMessage.toLowerCase().includes("auth") ||
          errorMessage.toLowerCase().includes("token") ||
          errorMessage.toLowerCase().includes("expired")
        ) {
          setConnectionState("expired");
          setUploadError("Authentication expired. Please reconnect your account.");
        } else {
          setUploadError(errorMessage);
        }
      }
    } else {
      // Fallback to legacy upload method if no recording ID
      if (connectionState !== "connected") return;

      setIsUploading(true);
      setUploadStatus("uploading");
      setUploadError(null);

      try {
        const result = await window.pilotstack.uploadRecording({
          videoPath: outputFile,
          metadata: metadata || {
            totalDuration: 0,
            activeDuration: 0,
            pasteEventCount: 0,
            verificationScore: 0,
            isVerified: false,
          },
        });

        if (result.success) {
          setUploadStatus("success");
        } else {
          throw new Error(result.error || "Upload failed");
        }
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadStatus("error");

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        if (
          errorMessage.toLowerCase().includes("auth") ||
          errorMessage.toLowerCase().includes("token") ||
          errorMessage.toLowerCase().includes("expired") ||
          errorMessage.toLowerCase().includes("unauthorized") ||
          errorMessage.toLowerCase().includes("401")
        ) {
          setConnectionState("expired");
          setUploadError("Authentication expired. Please reconnect your account.");
        } else {
          setUploadError(errorMessage);
        }
      } finally {
        setIsUploading(false);
      }
    }
  };

  // Attempt to refresh token first before full reconnect
  const handleRefreshToken = async () => {
    setIsReconnecting(true);
    try {
      const result = await window.pilotstack.refreshAuthToken();
      if (result.success) {
        setConnectionState("connected");
        setUploadError(null);
      } else {
        // Token refresh failed, need full reconnection
        setShowReconnectModal(true);
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      setShowReconnectModal(true);
    } finally {
      setIsReconnecting(false);
    }
  };

  // Open browser to reconnect
  const handleReconnect = async () => {
    try {
      setConnectionState("connecting");
      const device = await window.pilotstack.getDeviceInfo();
      if (device?.deviceId) {
        const webAppUrl = await getWebAppUrl();
        const connectUrl = `${webAppUrl}/connect?device_id=${encodeURIComponent(device.deviceId)}`;
        await window.pilotstack.openConnectUrl({ url: connectUrl });
        // Keep modal open until we receive auth token
        setTimeout(() => {
          // Reset to expired if no auth received after 2 minutes
          if (connectionState === "connecting") {
            setConnectionState("expired");
          }
        }, 120000);
      }
    } catch (error) {
      console.error("Failed to open connect URL:", error);
      setConnectionState("expired");
    }
  };

  // Connect for first time
  const handleConnectAccount = async () => {
    const device = await window.pilotstack.getDeviceInfo();
    if (device?.deviceId) {
      setConnectionState("connecting");
      const webAppUrl = await getWebAppUrl();
      const connectUrl = `${webAppUrl}/connect?device_id=${encodeURIComponent(device.deviceId)}`;
      await window.pilotstack.openConnectUrl({ url: connectUrl });
    }
  };

  const getFileName = (path: string) => {
    return path.split("/").pop() || path.split("\\").pop() || path;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const isConnected = connectionState === "connected";
  const isExpired = connectionState === "expired";
  const isConnecting = connectionState === "connecting";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="h-full flex flex-col overflow-y-auto scroll-container"
    >
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center min-h-0">
      {/* Success icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", delay: 0.1 }}
        className="relative mb-4 sm:mb-6 flex-shrink-0"
      >
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-chrono-success to-emerald-400 flex items-center justify-center shadow-lg shadow-chrono-success/30">
          <CheckCircle className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
        </div>
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-chrono-success/30"
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1, repeat: 2 }}
        />
      </motion.div>

      {/* Message */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-4 sm:mb-6 flex-shrink-0"
      >
        <h1 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Video Created!</h1>
        <p className="text-chrono-muted text-xs sm:text-sm mb-3 sm:mb-4">
          Your timelapse has been successfully generated
        </p>
        <div className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-chrono-surface rounded-lg border-2 border-chrono-border shadow-brutal-sm max-w-full">
          <p className="text-xs sm:text-sm font-mono text-chrono-accent truncate max-w-[200px] sm:max-w-[280px]">
            {getFileName(outputFile)}
          </p>
        </div>
      </motion.div>

      {/* Session Stats */}
      {metadata && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="w-full max-w-sm mb-4 sm:mb-6 flex-shrink-0"
        >
          <div className="glass-panel p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chrono-muted flex-shrink-0" />
                <span className="text-chrono-muted">Duration:</span>
                <span className="font-medium">{formatDuration(metadata.totalDuration)}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chrono-muted flex-shrink-0" />
                <span className="text-chrono-muted">Active:</span>
                <span className="font-medium">{formatDuration(metadata.activeDuration)}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Clipboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chrono-muted flex-shrink-0" />
                <span className="text-chrono-muted">Pastes:</span>
                <span className="font-medium">{metadata.pasteEventCount}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {metadata.isVerified ? (
                  <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chrono-success flex-shrink-0" />
                ) : (
                  <ShieldOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 flex-shrink-0" />
                )}
                <span className="text-chrono-muted">Score:</span>
                <span
                  className={clsx(
                    "font-medium",
                    metadata.isVerified
                      ? "text-chrono-success"
                      : "text-yellow-500"
                  )}
                >
                  {metadata.verificationScore}%
                </span>
              </div>
            </div>
            {metadata.isVerified && (
              <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-chrono-border flex items-center justify-center gap-2 text-chrono-success">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-medium">Verified Human Work</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Upload Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-sm mb-4 sm:mb-6 flex-shrink-0"
      >
        {uploadStatus === "success" ? (
          // Upload successful
          <div className="glass-panel p-4 bg-chrono-success/10 border-chrono-success/30">
            <div className="flex items-center justify-center gap-2 text-chrono-success">
              <Cloud className="w-5 h-5" />
              <span className="font-medium">Uploaded to Cloud!</span>
            </div>
            <p className="text-xs text-chrono-muted mt-2">
              View in your dashboard at pilotstack.app
            </p>
          </div>
        ) : isExpired || (uploadStatus === "error" && uploadError?.includes("expired")) ? (
          // Auth expired - show reconnect options
          <div className="glass-panel p-4 bg-amber-500/10 border-amber-500/30 space-y-3">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Authentication Expired</span>
            </div>
            <p className="text-xs text-chrono-muted">
              Your session has expired. Reconnect to upload your video to the cloud.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRefreshToken}
                disabled={isReconnecting}
                className={clsx(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                  "bg-chrono-accent/20 text-chrono-accent hover:bg-chrono-accent/30"
                )}
              >
                {isReconnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Try Refresh
                  </>
                )}
              </button>
              <button
                onClick={() => setShowReconnectModal(true)}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium bg-chrono-accent text-white hover:bg-chrono-accent/80 transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Reconnect
              </button>
            </div>
          </div>
        ) : isConnected || recordingId ? (
          // Connected or have recording ID - show upload button
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full glass-panel p-4 hover:bg-chrono-elevated transition-colors group"
          >
            <div className="flex items-center justify-center gap-3">
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-chrono-accent" />
              ) : (
                <Cloud className="w-5 h-5 text-chrono-accent group-hover:scale-110 transition-transform" />
              )}
              <span className="font-medium">
                {isUploading ? `Uploading... ${uploadProgress}%` : "Upload to Cloud"}
              </span>
            </div>
            {isUploading && uploadProgress > 0 && (
              <div className="mt-3 h-1.5 bg-chrono-bg rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-chrono-accent rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
            {uploadError && uploadStatus === "error" && !uploadError.includes("expired") && (
              <p className="text-xs text-red-400 mt-2">{uploadError}</p>
            )}
          </button>
        ) : isConnecting ? (
          // Waiting for connection
          <div className="glass-panel p-4 bg-chrono-accent/10 border-chrono-accent/30">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-chrono-accent" />
              <span className="text-chrono-accent font-medium">Waiting for connection...</span>
            </div>
            <p className="text-xs text-chrono-muted mt-2">
              Complete the sign-in in your browser, then come back here
            </p>
          </div>
        ) : (
          // Not connected - show connect button
          <button
            onClick={handleConnectAccount}
            className="w-full glass-panel p-4 hover:bg-chrono-elevated transition-colors border-dashed"
          >
            <div className="flex items-center justify-center gap-3">
              <CloudOff className="w-5 h-5 text-chrono-muted" />
              <span className="text-chrono-muted">Upload to Cloud</span>
            </div>
            <p className="text-xs text-chrono-muted mt-2">
              Connect your account to sync recordings
            </p>
          </button>
        )}
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="w-full max-w-sm space-y-2 sm:space-y-3 flex-shrink-0"
      >
        <button
          onClick={handleOpenFile}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          Play Video
        </button>

        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={handleOpenFolder}
            className="btn-secondary flex-1 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          >
            <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="truncate">Folder</span>
          </button>
          <button
            onClick={onStartNew}
            className="btn-secondary flex-1 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="truncate">New</span>
          </button>
        </div>

        {onOpenRecordings && (
          <button
            onClick={onOpenRecordings}
            className="w-full py-2 text-xs sm:text-sm text-chrono-muted hover:text-chrono-accent transition-colors flex items-center justify-center gap-2"
          >
            <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            View All Recordings
          </button>
        )}
      </motion.div>

      {/* Footer decoration */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-4 sm:mt-6 text-chrono-muted text-[10px] sm:text-xs flex-shrink-0"
      >
        Made with pilotstack ✨
      </motion.div>
      </div>

      {/* Reconnect Modal */}
      <AnimatePresence>
        {showReconnectModal && (
          <ReconnectModal
            onReconnect={handleReconnect}
            onClose={() => {
              setShowReconnectModal(false);
              if (connectionState === "connecting") {
                setConnectionState("expired");
              }
            }}
            isConnecting={isConnecting}
            userProfile={userProfile}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Reconnect Modal Component
interface ReconnectModalProps {
  onReconnect: () => void;
  onClose: () => void;
  isConnecting: boolean;
  userProfile: UserProfile | null;
}

function ReconnectModal({
  onReconnect,
  onClose,
  isConnecting,
  userProfile,
}: ReconnectModalProps) {
  const [hasClicked, setHasClicked] = useState(false);

  const handleReconnect = () => {
    setHasClicked(true);
    onReconnect();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isConnecting) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-chrono-surface border border-chrono-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Reconnect Account</h2>
          {!isConnecting && (
            <button
              onClick={onClose}
              className="p-1 text-chrono-muted hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4">
          {userProfile && (
            <div className="flex items-center gap-3 p-3 bg-chrono-bg rounded-lg">
              {userProfile.imageUrl ? (
                <img
                  src={userProfile.imageUrl}
                  alt={userProfile.name || "User"}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-chrono-accent/20 flex items-center justify-center">
                  <span className="text-chrono-accent font-medium">
                    {(userProfile.name || userProfile.email)?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {userProfile.name || userProfile.displayName || "User"}
                </p>
                <p className="text-xs text-chrono-muted truncate">
                  {userProfile.email}
                </p>
              </div>
            </div>
          )}

          <p className="text-sm text-chrono-muted">
            {hasClicked || isConnecting
              ? "A browser window has been opened. Please sign in to reconnect your account, then return here."
              : "Your session has expired. Click the button below to open your browser and sign in again. Your video is safe and will remain here."}
          </p>

          {(hasClicked || isConnecting) && (
            <div className="flex items-center gap-2 p-3 bg-chrono-accent/10 rounded-lg text-chrono-accent">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span className="text-sm">Waiting for authentication...</span>
            </div>
          )}

          {/* Important notice */}
          <div className="flex items-start gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-400">
              Your video is saved locally. Even if you close this app, you can find it in the output folder.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {!hasClicked && !isConnecting ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium bg-chrono-bg text-chrono-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReconnect}
                  className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium bg-chrono-accent text-white hover:bg-chrono-accent/80 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Browser
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-chrono-bg text-chrono-muted hover:text-white transition-colors"
              >
                I'll upload later
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
