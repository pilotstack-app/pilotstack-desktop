/**
 * Dependency Injection Container
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Refactoring Recommendations §3
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §2 - Manager Initialization
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §3 - State Management
 * 
 * Manages all manager and service instances with lazy initialization.
 * Provides dependency injection for cleaner architecture.
 * 
 * All managers and services are initialized lazily on first access to reduce startup time
 * and memory usage. This follows the dependency injection pattern for better testability.
 */

import { AppStateManager } from "./app-state";

// Import managers (will be implemented in later tasks)
import { CaptureManager } from "../managers/capture/capture-manager";
import { VideoManager } from "../managers/video/video-manager";
import { SessionManager } from "../managers/session-manager";
import { ActivityManager } from "../managers/activity-manager";
import { RecordingsManager } from "../managers/recordings";
import { UpdateManager } from "../managers/updater-manager";

// Import monitors
import { ClipboardMonitor } from "../monitors/clipboard-monitor";
import { KeyboardMonitor } from "../monitors/keyboard-monitor";

// Import services
import { WindowManager } from "../services/window/window-manager";
import { TrayManager } from "../services/window/tray-manager";
import { DeepLinkHandler } from "../services/window/deep-link-handler";
import { AuthService } from "../services/auth/auth-service";
import { UploadService } from "../services/upload/upload-service";

/**
 * Application context - dependency injection container
 * 
 * Provides centralized access to all managers, services, and monitors.
 * All instances are lazily initialized on first access.
 */
export class AppContext {
  private stateManager: AppStateManager;
  
  // Managers - lazy initialized
  private captureManager: CaptureManager | null = null;
  private videoManager: VideoManager | null = null;
  private sessionManager: SessionManager | null = null;
  private activityManager: ActivityManager | null = null;
  private recordingsManager: RecordingsManager | null = null;
  private updateManager: UpdateManager | null = null;
  
  // Monitors - lazy initialized
  private clipboardMonitor: ClipboardMonitor | null = null;
  private keyboardMonitor: KeyboardMonitor | null = null;
  
  // Services - lazy initialized
  private windowManager: WindowManager | null = null;
  private trayManager: TrayManager | null = null;
  private deepLinkHandler: DeepLinkHandler | null = null;
  private authService: AuthService | null = null;
  private uploadService: UploadService | null = null;

  constructor() {
    this.stateManager = new AppStateManager();
  }

  /**
   * Get state manager (always available, initialized in constructor)
   */
  getStateManager(): AppStateManager {
    return this.stateManager;
  }

  // ==================== Manager Getters ====================

  /**
   * Get capture manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §1 - Capture System
   */
  getCaptureManager(): CaptureManager {
    if (!this.captureManager) {
      this.captureManager = new CaptureManager(this);
    }
    return this.captureManager;
  }

  /**
   * Get video manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §2 - Video Generation System
   */
  getVideoManager(): VideoManager {
    if (!this.videoManager) {
      this.videoManager = new VideoManager(this);
    }
    return this.videoManager;
  }

  /**
   * Get session manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
   */
  getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      this.sessionManager = new SessionManager(this);
    }
    return this.sessionManager;
  }

  /**
   * Get activity manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - Activity Monitoring
   */
  getActivityManager(): ActivityManager {
    if (!this.activityManager) {
      this.activityManager = new ActivityManager(this);
    }
    return this.activityManager;
  }

  /**
   * Get recordings manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
   */
  getRecordingsManager(): RecordingsManager {
    if (!this.recordingsManager) {
      this.recordingsManager = new RecordingsManager(this);
    }
    return this.recordingsManager;
  }

  /**
   * Get update manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §Entry Point
   */
  getUpdateManager(): UpdateManager {
    if (!this.updateManager) {
      this.updateManager = new UpdateManager(this);
    }
    return this.updateManager;
  }

  // ==================== Monitor Getters ====================

  /**
   * Get clipboard monitor (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ClipboardMonitor
   */
  getClipboardMonitor(): ClipboardMonitor {
    if (!this.clipboardMonitor) {
      this.clipboardMonitor = new ClipboardMonitor();
    }
    return this.clipboardMonitor;
  }

  /**
   * Get keyboard monitor (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - KeyboardMonitor
   */
  getKeyboardMonitor(): KeyboardMonitor {
    if (!this.keyboardMonitor) {
      const mainWindow = this.getWindowManager().getMainWindow();
      this.keyboardMonitor = new KeyboardMonitor(mainWindow);
    }
    return this.keyboardMonitor;
  }

  // ==================== Service Getters ====================

  /**
   * Get window manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §1 - Window Management
   */
  getWindowManager(): WindowManager {
    if (!this.windowManager) {
      this.windowManager = new WindowManager(this);
    }
    return this.windowManager;
  }

  /**
   * Get tray manager (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §6 - Tray Menu
   */
  getTrayManager(): TrayManager {
    if (!this.trayManager) {
      this.trayManager = new TrayManager(this);
    }
    return this.trayManager;
  }

  /**
   * Get deep link handler (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §4 - Deep Linking (OAuth)
   */
  getDeepLinkHandler(): DeepLinkHandler {
    if (!this.deepLinkHandler) {
      this.deepLinkHandler = new DeepLinkHandler(this);
    }
    return this.deepLinkHandler;
  }

  /**
   * Get auth service (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication
   */
  getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = new AuthService(this);
    }
    return this.authService;
  }

  /**
   * Get upload service (lazy initialization)
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
   */
  getUploadService(): UploadService {
    if (!this.uploadService) {
      this.uploadService = new UploadService(this);
    }
    return this.uploadService;
  }

  // ==================== Cleanup ====================

  /**
   * Cleanup all resources
   * 
   * Stops all managers and services, cleans up event listeners, and releases resources.
   * Should be called on app shutdown.
   * 
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §8 - Memory Leaks
   */
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    // Cleanup managers (defensive checks for methods that may not exist yet)
    if (this.captureManager) {
      const manager = this.captureManager as any;
      if (typeof manager.cleanup === "function") {
        cleanupPromises.push(manager.cleanup());
      }
    }
    if (this.videoManager) {
      const manager = this.videoManager as any;
      if (typeof manager.cleanup === "function") {
        cleanupPromises.push(manager.cleanup());
      }
    }
    if (this.sessionManager) {
      const manager = this.sessionManager as any;
      if (typeof manager.cleanup === "function") {
        cleanupPromises.push(manager.cleanup());
      }
    }
    if (this.activityManager && typeof this.activityManager.stop === "function") {
      this.activityManager.stop();
    }
    if (this.recordingsManager) {
      const manager = this.recordingsManager as any;
      if (typeof manager.cleanup === "function") {
        cleanupPromises.push(manager.cleanup());
      }
    }

    // Cleanup monitors
    if (this.clipboardMonitor && typeof this.clipboardMonitor.stop === "function") {
      this.clipboardMonitor.stop();
    }
    if (this.keyboardMonitor && typeof this.keyboardMonitor.stop === "function") {
      this.keyboardMonitor.stop();
    }

    // Cleanup state manager
    if (this.stateManager && typeof this.stateManager.cleanup === "function") {
      this.stateManager.cleanup();
    }

    // Wait for all async cleanups to complete
    await Promise.all(cleanupPromises);

    // Clear all references
    this.captureManager = null;
    this.videoManager = null;
    this.sessionManager = null;
    this.activityManager = null;
    this.recordingsManager = null;
    this.updateManager = null;
    this.clipboardMonitor = null;
    this.keyboardMonitor = null;
    this.windowManager = null;
    this.trayManager = null;
    this.deepLinkHandler = null;
    this.authService = null;
    this.uploadService = null;
  }
}

