/**
 * Centralized Application State Management
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Refactoring Recommendations §4
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Renderer Process §Main Component
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §3 - State Management
 * 
 * Manages centralized application state with event emitters for state changes.
 * Provides type-safe state access.
 */

import { EventEmitter } from "events";

/**
 * Recording state
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture System
 */
export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  sessionId: string | null;
  sessionFolder: string | null;
  sourceId: string | null;
  startTime: number | null;
  frameCount: number;
  queueSize: number;
  droppedFrames: number;
  adaptiveQuality: string;
}

/**
 * Recoverable session state
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
 */
export interface RecoverableSession {
  sessionFolder: string;
  sourceId: string;
  startTime: number;
  frameCount: number;
  isActive: boolean;
  lastHeartbeat: number;
}

/**
 * Application state
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Renderer Process §Main Component
 */
export interface AppState {
  recording: RecordingState;
  currentView: "recording" | "processing" | "settings" | "completed" | "recordings";
  currentRecordingId: string | null;
  recoverableSession: RecoverableSession | null;
}

/**
 * State change event types
 */
export interface StateChangeEvents {
  "state-changed": (state: AppState) => void;
  "recording-state-changed": (recordingState: RecordingState) => void;
  "view-changed": (view: AppState["currentView"]) => void;
  "recording-started": (sessionId: string) => void;
  "recording-stopped": () => void;
  "recording-paused": () => void;
  "recording-resumed": () => void;
  "recoverable-session-set": (session: RecoverableSession) => void;
  "recoverable-session-cleared": () => void;
  "state-reset": () => void;
}

/**
 * Application state manager
 * 
 * Provides centralized state management with event emitters for reactive updates.
 */
export class AppStateManager extends EventEmitter {
  private state: AppState;
  private previousState: AppState | null = null;

  constructor() {
    super();
    this.state = this.getInitialState();
    this.previousState = null;
  }

  /**
   * Get initial state
   */
  private getInitialState(): AppState {
    return {
      recording: {
        isRecording: false,
        isPaused: false,
        sessionId: null,
        sessionFolder: null,
        sourceId: null,
        startTime: null,
        frameCount: 0,
        queueSize: 0,
        droppedFrames: 0,
        adaptiveQuality: "high",
      },
      currentView: "recording",
      currentRecordingId: null,
      recoverableSession: null,
    };
  }

  /**
   * Get current state (immutable copy)
   */
  getState(): AppState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get recording state (immutable copy)
   */
  getRecordingState(): RecordingState {
    return JSON.parse(JSON.stringify(this.state.recording));
  }

  /**
   * Get current view
   */
  getCurrentView(): AppState["currentView"] {
    return this.state.currentView;
  }

  /**
   * Get recoverable session
   */
  getRecoverableSession(): RecoverableSession | null {
    return this.state.recoverableSession ? { ...this.state.recoverableSession } : null;
  }

  /**
   * Update recording state
   * 
   * Emits specific events based on state changes (started, stopped, paused, resumed).
   */
  updateRecordingState(updates: Partial<RecordingState>): void {
    const previousRecording = { ...this.state.recording };
    this.state.recording = { ...this.state.recording, ...updates };

    // Emit specific events based on state changes
    if (!previousRecording.isRecording && this.state.recording.isRecording) {
      if (this.state.recording.sessionId) {
        this.emit("recording-started", this.state.recording.sessionId);
      }
    } else if (previousRecording.isRecording && !this.state.recording.isRecording) {
      this.emit("recording-stopped");
    }

    if (!previousRecording.isPaused && this.state.recording.isPaused) {
      this.emit("recording-paused");
    } else if (previousRecording.isPaused && !this.state.recording.isPaused) {
      this.emit("recording-resumed");
    }

    // Always emit recording state changed
    this.emit("recording-state-changed", this.getRecordingState());
    this.emit("state-changed", this.getState());
  }

  /**
   * Update app state
   * 
   * Emits view-changed event if view changes.
   */
  updateState(updates: Partial<AppState>): void {
    const previousView = this.state.currentView;
    this.previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Emit view changed event if view changed
    if (updates.currentView && updates.currentView !== previousView) {
      this.emit("view-changed", updates.currentView);
    }

    // Emit recoverable session events
    if (updates.recoverableSession !== undefined) {
      if (updates.recoverableSession === null) {
        this.emit("recoverable-session-cleared");
      } else {
        this.emit("recoverable-session-set", updates.recoverableSession);
      }
    }

    this.emit("state-changed", this.getState());
  }

  /**
   * Set current view
   */
  setCurrentView(view: AppState["currentView"]): void {
    this.updateState({ currentView: view });
  }

  /**
   * Set recoverable session
   */
  setRecoverableSession(session: RecoverableSession | null): void {
    this.updateState({ recoverableSession: session });
  }

  /**
   * Set current recording ID
   */
  setCurrentRecordingId(id: string | null): void {
    this.updateState({ currentRecordingId: id });
  }

  /**
   * Reset state to initial values
   */
  reset(): void {
    this.previousState = { ...this.state };
    this.state = this.getInitialState();
    this.emit("state-reset");
    this.emit("state-changed", this.getState());
  }

  /**
   * Get previous state (for undo/rollback scenarios)
   */
  getPreviousState(): AppState | null {
    return this.previousState ? JSON.parse(JSON.stringify(this.previousState)) : null;
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.state.recording.isRecording;
  }

  /**
   * Check if recording is paused
   */
  isPaused(): boolean {
    return this.state.recording.isPaused;
  }

  /**
   * Cleanup - remove all listeners
   */
  cleanup(): void {
    this.removeAllListeners();
  }
}

