import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { RecordingView } from "./views/RecordingView";
import { ProcessingView } from "./views/ProcessingView";
import { SettingsView } from "./views/SettingsView";
import { CompletedView } from "./views/CompletedView";
import { RecordingsView } from "./views/RecordingsView";
import { SessionRecoveryModal } from "./components/SessionRecoveryModal";
import type { RecoverableSession, RecordingState } from "./types/electron";

export type AppView = "recording" | "processing" | "settings" | "completed" | "recordings";

import type { SessionMetadata, ProjectSelection } from "./types/electron";

export interface SessionData {
  sessionFolder: string;
  totalFrames: number;
  musicPath?: string;
  outputFile?: string;
  metadata?: SessionMetadata;
  // Phase 5: Project assignment
  project?: ProjectSelection;
}

function App() {
  const [currentView, setCurrentView] = useState<AppView>("recording");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);

  // Recording state tracking (used by setters for state sync)
  const [_isRecording, setIsRecording] = useState(false);
  const [_recordingFrameCount, setRecordingFrameCount] = useState(0);
  const [_currentSessionFolder, setCurrentSessionFolder] = useState<
    string | null
  >(null);

  // Recovery state
  const [recoverableSession, setRecoverableSession] =
    useState<RecoverableSession | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);


  /**
   * Check for recoverable sessions on mount
   */
  useEffect(() => {
    const checkRecovery = async () => {
      try {
        const session = await window.pilotstack.checkRecovery();
        if (session) {
          setRecoverableSession(session);
          setShowRecoveryModal(true);
        }
      } catch (error) {
        console.error("Failed to check recovery:", error);
      }
    };

    checkRecovery();
  }, []);

  /**
   * Sync recording state on mount and handle reconnection
   */
  useEffect(() => {
    const syncState = async () => {
      try {
        const state = await window.pilotstack.getRecordingState();
        if (state.isRecording) {
          setIsRecording(true);
          setRecordingFrameCount(state.frameCount);
          setCurrentSessionFolder(state.sessionFolder);
        }
      } catch (error) {
        console.error("Failed to sync state:", error);
      }
    };

    syncState();
  }, []);

  /**
   * Listen for frame updates to track recording progress
   */
  useEffect(() => {
    const unsubscribe = window.pilotstack.onFrameUpdate((data) => {
      setRecordingFrameCount(data.frameCount);
    });

    return unsubscribe;
  }, []);

  /**
   * Listen for state sync events (when window reloads during recording)
   */
  useEffect(() => {
    const unsubscribe = window.pilotstack.onStateSync(
      (state: RecordingState) => {
        if (state.isRecording) {
          setIsRecording(true);
          setRecordingFrameCount(state.frameCount);
          setCurrentSessionFolder(state.sessionFolder);
          // If we were on a different view, go back to recording
          if (currentView !== "recording" && currentView !== "settings") {
            setCurrentView("recording");
          }
        }
      },
    );

    return unsubscribe;
  }, [currentView]);

  /**
   * Listen for recovery available events
   */
  useEffect(() => {
    const unsubscribe = window.pilotstack.onRecoveryAvailable(
      (session: RecoverableSession) => {
        setRecoverableSession(session);
        setShowRecoveryModal(true);
      },
    );

    return unsubscribe;
  }, []);

  /**
   * Listen for emergency stop events from tray
   */
  useEffect(() => {
    const unsubscribe = window.pilotstack.onEmergencyStopped((data) => {
      console.log("Emergency stopped:", data);
      setIsRecording(false);
      setSessionData({
        sessionFolder: data.sessionFolder,
        totalFrames: data.frameCount,
      });
      setCurrentView("processing");
    });

    return unsubscribe;
  }, []);

  /**
   * Handle recording completion (normal stop)
   */
  const handleRecordingComplete = useCallback(
    async (folder: string, frames: number) => {
      console.log("[App] handleRecordingComplete called:", { folder, frames });
      
      if (!folder) {
        console.error("[App] handleRecordingComplete: folder is null/undefined!");
        return;
      }
      
      // Get the current project selection
      let project: ProjectSelection | undefined;
      try {
        project = await window.pilotstack.getProjectSelection();
      } catch (error) {
        console.error("Failed to get project selection:", error);
      }
      
      setIsRecording(false);
      setRecordingFrameCount(0);
      setCurrentSessionFolder(null);
      setSessionData({ sessionFolder: folder, totalFrames: frames, project });
      console.log("[App] Switching to processing view");
      setCurrentView("processing");
    },
    [],
  );

  /**
   * Handle recording start
   */
  const handleRecordingStart = useCallback((folder: string) => {
    setIsRecording(true);
    setRecordingFrameCount(0);
    setCurrentSessionFolder(folder);
  }, []);

  /**
   * Handle video completion - save to recordings library
   */
  const handleVideoComplete = useCallback(
    async (outputFile: string, sessionFolder: string, metadata?: SessionMetadata) => {
      setSessionData((prev) =>
        prev ? { ...prev, outputFile, metadata } : null,
      );

      // Save to recordings library with keyboard stats and project info
      // Use sessionFolder passed directly from ProcessingView to avoid stale closure issues
      try {
        const result = await window.pilotstack.addRecording({
          sessionId: sessionFolder?.split("/").pop() || `session_${Date.now()}`,
          videoPath: outputFile,
          // IMPORTANT: Include framesDir (session folder) so upload service can find metrics.json
          // This contains all activity stats (WPM, keystrokes, mouse clicks, etc.)
          framesDir: sessionFolder || null,
          title: `Recording ${new Date().toLocaleDateString()}`,
          duration: metadata?.totalDuration || 0,
          activeDuration: metadata?.activeDuration || 0,
          frameCount: sessionData?.totalFrames || 0,
          verificationScore: metadata?.verificationScore || 0,
          isVerified: metadata?.isVerified || false,
          pasteEventCount: metadata?.pasteEventCount || 0,
          status: "ready",
          // Include keyboard stats for cloud upload
          keyboardStats: metadata?.keyboardStats,
          // Phase 5: Include project assignment
          projectId: sessionData?.project?.projectId || null,
          projectName: sessionData?.project?.projectName || null,
        });

        if (result.success && result.recording) {
          setCurrentRecordingId(result.recording.id);
        }
      } catch (error) {
        console.error("Failed to save recording to library:", error);
      }

      setCurrentView("completed");
    },
    [sessionData],
  );

  /**
   * Start new recording
   */
  const handleStartNew = useCallback(() => {
    setSessionData(null);
    setCurrentRecordingId(null);
    setCurrentView("recording");
  }, []);

  /**
   * Open recordings library
   */
  const handleOpenRecordings = useCallback(() => {
    setCurrentView("recordings");
  }, []);

  /**
   * Handle session recovery
   */
  const handleRecover = useCallback(async (sessionFolder: string) => {
    try {
      const result = await window.pilotstack.recoverSession({ sessionFolder });

      if (result.success && result.totalFrames) {
        setRecoverableSession(null);
        setShowRecoveryModal(false);
        setSessionData({
          sessionFolder: result.sessionFolder!,
          totalFrames: result.totalFrames,
        });
        setCurrentView("processing");
      } else {
        throw new Error(result.error || "Recovery failed");
      }
    } catch (error) {
      throw error;
    }
  }, []);

  /**
   * Handle session discard
   */
  const handleDiscard = useCallback(async () => {
    try {
      await window.pilotstack.clearRecovery();
      setRecoverableSession(null);
      setShowRecoveryModal(false);
    } catch (error) {
      console.error("Failed to discard session:", error);
      throw error;
    }
  }, []);

  /**
   * Close recovery modal without action
   */
  const handleCloseRecoveryModal = useCallback(() => {
    setShowRecoveryModal(false);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-chrono-bg overflow-hidden noise-overlay relative">
      {/* Background gradient effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-chrono-accent/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-purple-500/5 via-transparent to-transparent" />
      </div>

      <TitleBar
        onSettings={() =>
          setCurrentView(currentView === "settings" ? "recording" : "settings")
        }
        onRecordings={handleOpenRecordings}
        showSettings={currentView !== "processing"}
        isSettingsOpen={currentView === "settings"}
        isRecordingsOpen={currentView === "recordings"}
      />

      <main className="flex-1 overflow-hidden relative z-10">
        <AnimatePresence mode="wait">
          {currentView === "recording" && (
            <RecordingView
              key="recording"
              onComplete={handleRecordingComplete}
              onRecordingStart={handleRecordingStart}
            />
          )}
          {currentView === "processing" && sessionData && (
            <ProcessingView
              key="processing"
              sessionFolder={sessionData.sessionFolder}
              totalFrames={sessionData.totalFrames}
              onComplete={handleVideoComplete}
              onCancel={() => setCurrentView("recording")}
            />
          )}
          {currentView === "settings" && (
            <SettingsView
              key="settings"
              onClose={() => setCurrentView("recording")}
            />
          )}
          {currentView === "completed" && sessionData?.outputFile && (
            <CompletedView
              key="completed"
              outputFile={sessionData.outputFile}
              metadata={sessionData.metadata}
              recordingId={currentRecordingId}
              onStartNew={handleStartNew}
              onOpenRecordings={handleOpenRecordings}
            />
          )}
          {currentView === "recordings" && (
            <RecordingsView
              key="recordings"
              onClose={() => setCurrentView("recording")}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Session Recovery Modal */}
      {showRecoveryModal && (
        <SessionRecoveryModal
          session={recoverableSession}
          onRecover={handleRecover}
          onDiscard={handleDiscard}
          onClose={handleCloseRecoveryModal}
        />
      )}
    </div>
  );
}

export default App;
