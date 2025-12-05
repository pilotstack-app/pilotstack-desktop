import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Folder,
  Film,
  Clock,
  ChevronLeft,
  Save,
  Check,
  Zap,
  Gauge,
  Info,
  Monitor,
  Link2,
  Link2Off,
  ExternalLink,
  Loader2,
  User,
  Mail,
  Shield,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import type {
  PerformanceInfo,
  CaptureQuality,
  DeviceInfo,
  UserProfile,
} from "../types/electron";

// Web app URL - will be determined dynamically based on app packaging
// We'll use a function to get the URL to ensure it's always correct
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
    // Default to production URL if check fails
    return "https://pilotstack.app";
  }
};

interface SettingsViewProps {
  onClose: () => void;
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const [frameRate, setFrameRate] = useState(30);
  const [captureInterval, setCaptureInterval] = useState(1000);
  const [outputDir, setOutputDir] = useState<string>("");
  const [useHardwareAcceleration, setUseHardwareAcceleration] = useState(true);
  const [captureQuality, setCaptureQuality] = useState<CaptureQuality>("high");
  const [performanceInfo, setPerformanceInfo] =
    useState<PerformanceInfo | null>(null);
  const [saved, setSaved] = useState(false);

  // Performance settings
  const [useJpegCapture, setUseJpegCapture] = useState(true);
  const [enableAdaptiveQuality, setEnableAdaptiveQuality] = useState(true);
  const [enableFrameSkipping, setEnableFrameSkipping] = useState(true);

  // Account connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [_deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      // Load settings first (fast)
      const [fr, ci, od, hw, cq, jpeg, adaptive, skipFrames, perf, device, authToken] =
        await Promise.all([
          window.pilotstack.getSetting<number>("frameRate"),
          window.pilotstack.getSetting<number>("captureInterval"),
          window.pilotstack.getSetting<string>("outputDirectory"),
          window.pilotstack.getSetting<boolean>("useHardwareAcceleration"),
          window.pilotstack.getSetting<CaptureQuality>("captureQuality"),
          window.pilotstack.getSetting<boolean>("useJpegCapture"),
          window.pilotstack.getSetting<boolean>("enableAdaptiveQuality"),
          window.pilotstack.getSetting<boolean>("enableFrameSkipping"),
          window.pilotstack.getPerformanceInfo(),
          window.pilotstack.getDeviceInfo(),
          window.pilotstack.getAuthToken(),
        ]);

      if (fr) setFrameRate(fr);
      if (ci) setCaptureInterval(ci);
      if (od) setOutputDir(od);
      if (typeof hw === "boolean") setUseHardwareAcceleration(hw);
      if (cq) setCaptureQuality(cq);
      if (typeof jpeg === "boolean") setUseJpegCapture(jpeg);
      if (typeof adaptive === "boolean") setEnableAdaptiveQuality(adaptive);
      if (typeof skipFrames === "boolean") setEnableFrameSkipping(skipFrames);
      setPerformanceInfo(perf);
      setDeviceInfo(device);

      const connected = !!authToken.token;
      setIsConnected(connected);

      // Load profile separately with timeout (can be slow due to API call)
      if (connected) {
        setIsLoadingProfile(true);
        setProfileLoadFailed(false);

        try {
          // Add timeout for profile loading
          const profilePromise = window.pilotstack.getUserProfile();
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10000),
          );

          const profile = await Promise.race([profilePromise, timeoutPromise]);

          if (profile) {
            setUserProfile(profile);
          } else {
            setProfileLoadFailed(true);
          }
        } catch (error) {
          console.error("Failed to load profile:", error);
          setProfileLoadFailed(true);
        } finally {
          setIsLoadingProfile(false);
        }
      }
    };
    loadSettings();
  }, []);

  // Listen for auth token received (from deep link callback)
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthTokenReceived((data) => {
      if (data.success) {
        setIsConnected(true);
        setIsConnecting(false);
        setProfileLoadFailed(false);
        setIsLoadingProfile(true);
        // Fetch user profile after successful auth
        window.pilotstack
          .getUserProfile()
          .then((profile) => {
            if (profile) {
              setUserProfile(profile);
            } else {
              setProfileLoadFailed(true);
            }
          })
          .catch(() => {
            setProfileLoadFailed(true);
          })
          .finally(() => {
            setIsLoadingProfile(false);
          });
      }
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

  // Listen for session expiry
  useEffect(() => {
    const unsubscribe = window.pilotstack.onAuthSessionExpired(() => {
      setIsConnected(false);
      setUserProfile(null);
    });
    return unsubscribe;
  }, []);

  // Handle connect account
  const handleConnectAccount = async () => {
    try {
      // Refresh device info in case it wasn't loaded
      const device = await window.pilotstack.getDeviceInfo();
      console.log("Device info:", device);

      if (!device?.deviceId) {
        console.error("No device ID available");
        return;
      }

      setIsConnecting(true);
      // Get the correct web app URL based on whether app is packaged
      const webAppUrl = await getWebAppUrl();
      const connectUrl = `${webAppUrl}/connect?device_id=${encodeURIComponent(device.deviceId)}`;
      console.log("Opening connect URL:", connectUrl);

      const result = await window.pilotstack.openConnectUrl({
        url: connectUrl,
      });
      console.log("Open URL result:", result);

      // Reset connecting state after timeout (user might close browser)
      setTimeout(() => setIsConnecting(false), 30000);
    } catch (error) {
      console.error("Failed to open connect URL:", error);
      setIsConnecting(false);
    }
  };

  // Handle disconnect account
  const handleDisconnect = async () => {
    await window.pilotstack.clearAuthToken();
    setIsConnected(false);
    setUserProfile(null);
    setProfileLoadFailed(false);
    setIsLoadingProfile(false);
  };

  // Handle refresh profile
  const handleRefreshProfile = async () => {
    if (!isConnected || isRefreshing) return;

    setIsRefreshing(true);
    try {
      // First try to refresh the token
      await window.pilotstack.refreshAuthToken();
      // Then fetch updated profile
      const profile = await window.pilotstack.getUserProfile();
      if (profile) setUserProfile(profile);
    } catch (error) {
      console.error("Failed to refresh profile:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectOutputDir = async () => {
    const dir = await window.pilotstack.selectOutputDir();
    if (dir) {
      setOutputDir(dir);
    }
  };

  const handleSave = async () => {
    await Promise.all([
      window.pilotstack.setSetting("frameRate", frameRate),
      window.pilotstack.setSetting("captureInterval", captureInterval),
      window.pilotstack.setSetting(
        "useHardwareAcceleration",
        useHardwareAcceleration,
      ),
      window.pilotstack.setSetting("captureQuality", captureQuality),
      window.pilotstack.setSetting("useJpegCapture", useJpegCapture),
      window.pilotstack.setSetting(
        "enableAdaptiveQuality",
        enableAdaptiveQuality,
      ),
      window.pilotstack.setSetting("enableFrameSkipping", enableFrameSkipping),
    ]);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const frameRateOptions = [15, 24, 30, 60];
  const intervalOptions = [
    { value: 500, label: "0.5s" },
    { value: 1000, label: "1s" },
    { value: 2000, label: "2s" },
    { value: 5000, label: "5s" },
  ];

  const qualityOptions: {
    value: CaptureQuality;
    label: string;
    desc: string;
  }[] = [
    { value: "low", label: "Fast", desc: "~50KB/frame" },
    { value: "medium", label: "Balanced", desc: "~100KB/frame" },
    { value: "high", label: "Quality", desc: "~200KB/frame" },
    { value: "max", label: "Maximum", desc: "~400KB/frame" },
  ];

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const getPlatformName = (platform: string) => {
    switch (platform) {
      case "darwin":
        return "macOS";
      case "win32":
        return "Windows";
      case "linux":
        return "Linux";
      default:
        return platform;
    }
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
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 text-chrono-muted hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Settings</h1>
            <p className="text-chrono-muted text-xs sm:text-sm">
              Configure your preferences
            </p>
          </div>
        </div>
      </div>

      {/* Settings list - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 scrollbar-thin scroll-container">
        <div className="space-y-3 sm:space-y-4 pb-4">
        {/* Account Connection */}
        <div className="glass-panel p-3 sm:p-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
          {isConnected && userProfile ? (
            // Connected state with user profile
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* User Avatar */}
                  {userProfile.imageUrl ? (
                    <img
                      src={userProfile.imageUrl}
                      alt={userProfile.name || "User"}
                      className="w-10 h-10 rounded-full border-2 border-emerald-500/30"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500/30">
                      <User className="w-5 h-5 text-emerald-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium text-white">
                      {userProfile.name || userProfile.displayName || "User"}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-chrono-muted">
                      <Mail className="w-3 h-3" />
                      <span>{userProfile.email}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefreshProfile}
                    disabled={isRefreshing}
                    className="p-1.5 text-chrono-muted hover:text-white transition-colors"
                    title="Refresh profile"
                  >
                    <RefreshCw
                      className={clsx(
                        "w-4 h-4",
                        isRefreshing && "animate-spin",
                      )}
                    />
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Stats Row */}
              {userProfile.stats && (
                <div className="flex items-center gap-4 pt-2 border-t border-chrono-border">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Film className="w-3.5 h-3.5 text-chrono-accent" />
                    <span className="text-chrono-muted">Recordings:</span>
                    <span className="font-medium">
                      {userProfile.stats.recordingCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-chrono-muted">Devices:</span>
                    <span className="font-medium">
                      {userProfile.stats.deviceCount}
                    </span>
                  </div>
                </div>
              )}

              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400">
                  Secure connection active
                </span>
                <Shield className="w-3 h-3 text-emerald-400" />
              </div>
            </div>
          ) : isConnected ? (
            // Connected but profile may be loading or failed
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Link2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">Connected</h3>
                    <p className="text-xs text-chrono-muted">
                      {isLoadingProfile
                        ? "Loading profile..."
                        : profileLoadFailed
                          ? "Profile unavailable"
                          : "Account linked"}
                    </p>
                  </div>
                </div>
                {isLoadingProfile ? (
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                ) : (
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
              {profileLoadFailed && (
                <p className="text-xs text-amber-400/80 pl-11">
                  Could not load profile. Web app may be offline.
                </p>
              )}
            </div>
          ) : (
            // Not connected state
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center">
                    <Link2Off className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">Cloud Account</h3>
                    <p className="text-xs text-chrono-muted">
                      Link to sync recordings
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleConnectAccount}
                  disabled={isConnecting}
                  className={clsx(
                    "px-3 py-1.5 text-xs rounded-lg flex items-center gap-2 transition-colors",
                    isConnecting
                      ? "bg-chrono-accent/20 text-chrono-accent cursor-wait"
                      : "bg-chrono-accent text-white hover:bg-chrono-accent/80",
                  )}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Waiting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3 h-3" />
                      Connect Account
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-chrono-muted mt-3 ml-11">
                Connect to upload recordings, generate verified badges, and
                access your work from anywhere.
              </p>
            </>
          )}
        </div>

        {/* Performance Info Banner */}
        {performanceInfo && (
          <div className="glass-panel p-3 sm:p-4 bg-gradient-to-r from-chrono-accent/10 to-purple-500/10 border border-chrono-accent/20">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <Monitor className="w-4 h-4 text-chrono-accent flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">System Info</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
              <div className="flex items-center gap-2">
                <span className="text-chrono-muted">Platform:</span>
                <span>
                  {getPlatformName(performanceInfo.platform)} (
                  {performanceInfo.arch})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-chrono-muted">CPU:</span>
                <span>{performanceInfo.cpuCount ?? "N/A"} cores</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-chrono-muted">Memory:</span>
                <span>{formatBytes(performanceInfo.totalMemory ?? 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-chrono-muted">Optimizations:</span>
                <span
                  className={
                    performanceInfo.sharpAvailable
                      ? "text-green-400"
                      : "text-yellow-400"
                  }
                >
                  {performanceInfo.sharpAvailable ? "Active" : "Basic"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Hardware Acceleration */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-sm sm:text-base truncate">Hardware Acceleration</h3>
                <p className="text-[10px] sm:text-xs text-chrono-muted truncate">
                  Use GPU for video encoding
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setUseHardwareAcceleration(!useHardwareAcceleration)
              }
              className={clsx(
                "relative w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0",
                useHardwareAcceleration ? "bg-chrono-accent" : "bg-chrono-bg",
              )}
            >
              <motion.div
                className="absolute top-0.5 sm:top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{
                  left: useHardwareAcceleration ? "calc(100% - 18px)" : "2px",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          <p className="text-[10px] sm:text-xs text-chrono-muted mt-2 ml-9 sm:ml-11">
            {window.platform.isMac && "Uses VideoToolbox on macOS"}
            {window.platform.isWindows && "Uses NVENC (NVIDIA) or QSV (Intel)"}
            {window.platform.isLinux && "Uses VAAPI for Intel/AMD GPUs"}
          </p>
        </div>

        {/* Fast JPEG Capture */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-sm sm:text-base truncate">Fast JPEG Capture</h3>
                <p className="text-[10px] sm:text-xs text-chrono-muted truncate">
                  10x faster, smaller files
                </p>
              </div>
            </div>
            <button
              onClick={() => setUseJpegCapture(!useJpegCapture)}
              className={clsx(
                "relative w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0",
                useJpegCapture ? "bg-green-500" : "bg-chrono-bg",
              )}
            >
              <motion.div
                className="absolute top-0.5 sm:top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{ left: useJpegCapture ? "calc(100% - 18px)" : "2px" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          <p className="text-[10px] sm:text-xs text-chrono-muted mt-2 ml-9 sm:ml-11">
            Recommended ON. Prevents timeouts and reduces disk usage.
          </p>
        </div>

        {/* Adaptive Quality */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-sm sm:text-base truncate">Adaptive Quality</h3>
                <p className="text-[10px] sm:text-xs text-chrono-muted truncate">
                  Auto-adjust under load
                </p>
              </div>
            </div>
            <button
              onClick={() => setEnableAdaptiveQuality(!enableAdaptiveQuality)}
              className={clsx(
                "relative w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0",
                enableAdaptiveQuality ? "bg-orange-500" : "bg-chrono-bg",
              )}
            >
              <motion.div
                className="absolute top-0.5 sm:top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{
                  left: enableAdaptiveQuality ? "calc(100% - 18px)" : "2px",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          <p className="text-[10px] sm:text-xs text-chrono-muted mt-2 ml-9 sm:ml-11">
            Reduces quality when system is under pressure.
          </p>
        </div>

        {/* Skip Similar Frames */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-sm sm:text-base truncate">Skip Similar Frames</h3>
                <p className="text-[10px] sm:text-xs text-chrono-muted truncate">
                  Reduce redundant captures
                </p>
              </div>
            </div>
            <button
              onClick={() => setEnableFrameSkipping(!enableFrameSkipping)}
              className={clsx(
                "relative w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0",
                enableFrameSkipping ? "bg-cyan-500" : "bg-chrono-bg",
              )}
            >
              <motion.div
                className="absolute top-0.5 sm:top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{
                  left: enableFrameSkipping ? "calc(100% - 18px)" : "2px",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          <p className="text-[10px] sm:text-xs text-chrono-muted mt-2 ml-9 sm:ml-11">
            OFF by default for coding. Enable to skip unchanged screens.
          </p>
        </div>

        {/* Capture Quality */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm sm:text-base">Capture Quality</h3>
              <p className="text-[10px] sm:text-xs text-chrono-muted">
                Balance quality vs. performance
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {qualityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCaptureQuality(opt.value)}
                className={clsx(
                  "py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-medium transition-all flex flex-col items-center",
                  captureQuality === opt.value
                    ? "bg-blue-500 text-white shadow-brutal-sm"
                    : "bg-chrono-bg text-chrono-muted hover:text-white hover:bg-chrono-elevated",
                )}
              >
                <span>{opt.label}</span>
                <span className="text-[8px] sm:text-[10px] opacity-70 hidden sm:block">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-chrono-accent/20 flex items-center justify-center flex-shrink-0">
              <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chrono-accent" />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm sm:text-base">Frame Rate</h3>
              <p className="text-[10px] sm:text-xs text-chrono-muted">Output video FPS</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {frameRateOptions.map((fps) => (
              <button
                key={fps}
                onClick={() => setFrameRate(fps)}
                className={clsx(
                  "py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-[10px] sm:text-sm font-medium transition-all",
                  frameRate === fps
                    ? "bg-chrono-accent text-white shadow-brutal-sm"
                    : "bg-chrono-bg text-chrono-muted hover:text-white hover:bg-chrono-elevated",
                )}
              >
                {fps} fps
              </button>
            ))}
          </div>
        </div>

        {/* Capture Interval */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm sm:text-base">Capture Interval</h3>
              <p className="text-[10px] sm:text-xs text-chrono-muted">
                Time between screenshots
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {intervalOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCaptureInterval(opt.value)}
                className={clsx(
                  "py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-[10px] sm:text-sm font-medium transition-all",
                  captureInterval === opt.value
                    ? "bg-purple-500 text-white shadow-brutal-sm"
                    : "bg-chrono-bg text-chrono-muted hover:text-white hover:bg-chrono-elevated",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output Directory */}
        <div className="glass-panel p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Folder className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm sm:text-base">Output Location</h3>
              <p className="text-[10px] sm:text-xs text-chrono-muted">
                Where videos are saved
              </p>
            </div>
          </div>
          <button
            onClick={handleSelectOutputDir}
            className="w-full p-2.5 sm:p-3 bg-chrono-bg rounded-lg text-left hover:bg-chrono-elevated transition-colors border-2 border-chrono-border/50 hover:border-chrono-border"
          >
            {outputDir ? (
              <span className="text-xs sm:text-sm truncate block">{outputDir}</span>
            ) : (
              <span className="text-xs sm:text-sm text-chrono-muted">
                Click to select folder
              </span>
            )}
          </button>
        </div>

        {/* Preview calculation */}
        <div className="p-3 sm:p-4 bg-chrono-bg/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-chrono-muted flex-shrink-0" />
            <span className="text-[10px] sm:text-xs text-chrono-muted">
              With current settings:
            </span>
          </div>
          <div className="text-xs sm:text-sm text-center">
            <span className="font-mono text-chrono-accent">
              {60 / (captureInterval / 1000)}
            </span>{" "}
            frames/min →{" "}
            <span className="font-mono text-chrono-accent">
              {(60 / (captureInterval / 1000) / frameRate).toFixed(1)}s
            </span>{" "}
            of video
          </div>
          {captureQuality === "max" && (
            <p className="text-[10px] sm:text-xs text-yellow-400 text-center mt-2">
              ⚠️ Max quality uses more disk space
            </p>
          )}
        </div>
        </div>
      </div>

      {/* Save button - Fixed at bottom */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-t border-chrono-border/30 bg-chrono-bg/50 backdrop-blur-sm">
        <button
          onClick={handleSave}
          className={clsx(
            "btn-primary w-full flex items-center justify-center gap-2",
            saved && "bg-chrono-success border-chrono-success/60",
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
