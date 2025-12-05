/**
 * Clipboard Monitor
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §4 - ClipboardMonitor
 * 
 * Monitors clipboard changes and detects paste events.
 * Maps to: handlers/clipboard-monitor.js
 */

import { clipboard } from "electron";

// Constants
const LARGE_PASTE_THRESHOLD = 100; // Characters
const CHECK_INTERVAL_MS = 1000; // Reduced frequency to avoid performance issues

/**
 * Paste event
 */
export interface PasteEvent {
  timestamp: number;
  approximateSize: number;
  frameIndex: number | null;
  isLarge: boolean;
}

/**
 * Clipboard statistics
 */
export interface ClipboardStats {
  totalEvents: number;
  largeEvents: number;
  totalSize: number;
  averageSize: number;
}

/**
 * Clipboard Monitor
 * 
 * Detects paste events for anti-cheat verification.
 * Note: We only track paste size/timestamp, NOT the actual content.
 */
export class ClipboardMonitor {
  private isMonitoring: boolean = false;
  private pasteEvents: PasteEvent[] = [];
  private checkInterval: NodeJS.Timeout | null = null;
  private lastClipboardContent: string = "";

  /**
   * Start monitoring clipboard for paste events
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.pasteEvents = [];

    // Get initial clipboard state
    try {
      const initialContent = clipboard.readText();
      this.lastClipboardContent = this.hashContent(initialContent);
    } catch (e) {
      this.lastClipboardContent = "";
    }

    // Monitor clipboard changes
    // This detects when content is copied (which often precedes a paste)
    try {
      this.checkInterval = setInterval(
        () => this.checkClipboard(),
        CHECK_INTERVAL_MS
      );
    } catch (e: any) {
      console.error("Failed to start clipboard check interval:", e.message);
      this.isMonitoring = false;
      return;
    }

    // Register global shortcuts to detect paste actions
    // Note: This may not catch all pastes but helps detect common ones
    try {
      this.registerPasteShortcuts();
    } catch (e: any) {
      console.warn("Failed to register paste shortcuts:", e.message);
    }

    console.log("Clipboard monitoring started");
  }

  /**
   * Stop monitoring and return paste events
   * Returns sanitized paste events (same format as getPasteEvents)
   */
  stop(): PasteEvent[] {
    if (!this.isMonitoring) return this.getPasteEvents();

    this.isMonitoring = false;

    // Clear interval - wrap in try/catch for safety
    try {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    } catch (e: any) {
      console.warn("Error clearing clipboard check interval:", e.message);
    }

    // Unregister shortcuts - wrap in try/catch for safety
    try {
      this.unregisterPasteShortcuts();
    } catch (e: any) {
      console.warn("Error unregistering paste shortcuts:", e.message);
    }

    console.log("Clipboard monitoring stopped");
    // Return sanitized paste events for IPC compatibility
    return this.getPasteEvents();
  }

  /**
   * Register global shortcuts to detect paste
   */
  private registerPasteShortcuts(): void {
    try {
      // We can't directly intercept Cmd+V/Ctrl+V without blocking it
      // Instead, we detect clipboard changes that indicate a paste happened
      // The checkClipboard method handles this
    } catch (e) {
      console.warn("Failed to register paste shortcuts:", e);
    }
  }

  /**
   * Unregister global shortcuts
   */
  private unregisterPasteShortcuts(): void {
    try {
      // Cleanup if needed
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Check clipboard for changes
   * Changes indicate copy operations; we infer paste from timing
   */
  private checkClipboard(): void {
    if (!this.isMonitoring) return;

    try {
      const currentContent = clipboard.readText();

      // Skip if clipboard is empty or too large (could cause memory issues)
      if (!currentContent || currentContent.length > 100000) {
        return;
      }

      const currentHash = this.hashContent(currentContent);
      const currentLength = currentContent.length;

      // If clipboard content changed, it means something was copied
      // We track this as it often precedes a paste
      if (currentHash !== this.lastClipboardContent && currentLength > 0) {
        // Only record if this is substantial content
        if (currentLength > 10) {
          this.recordPotentialPaste(currentLength);
        }

        this.lastClipboardContent = currentHash;
      }
    } catch (e) {
      // Clipboard access can sometimes fail, ignore silently
      // This can happen during system clipboard operations
    }
  }

  /**
   * Record a potential paste event
   * We're being conservative - we record clipboard changes that could indicate paste
   */
  private recordPotentialPaste(contentLength: number): void {
    const event: PasteEvent = {
      timestamp: Date.now(),
      approximateSize: contentLength,
      frameIndex: null, // Will be filled by capture manager
      isLarge: contentLength > LARGE_PASTE_THRESHOLD,
    };

    this.pasteEvents.push(event);

    console.log(`Potential paste detected: ${contentLength} chars`);
  }

  /**
   * Manually record a paste event (called from renderer when paste is detected)
   */
  recordPaste(approximateSize: number): void {
    if (!this.isMonitoring) return;

    const event: PasteEvent = {
      timestamp: Date.now(),
      approximateSize,
      frameIndex: null,
      isLarge: approximateSize > LARGE_PASTE_THRESHOLD,
    };

    this.pasteEvents.push(event);
  }

  /**
   * Hash content for comparison (without storing actual content)
   */
  private hashContent(content: string): string {
    if (!content) return "";

    // Simple hash for comparison - we don't store the actual content
    let hash = 0;
    for (let i = 0; i < Math.min(content.length, 1000); i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16) + "_" + content.length;
  }

  /**
   * Get all paste events
   */
  getPasteEvents(): PasteEvent[] {
    return this.pasteEvents.map((event) => ({
      timestamp: event.timestamp,
      approximateSize: event.approximateSize,
      isLarge: event.isLarge,
      frameIndex: event.frameIndex,
    }));
  }

  /**
   * Get summary statistics
   */
  getStats(): ClipboardStats {
    const totalEvents = this.pasteEvents.length;
    const largeEvents = this.pasteEvents.filter((e) => e.isLarge).length;
    const totalSize = this.pasteEvents.reduce(
      (sum, e) => sum + e.approximateSize,
      0
    );

    return {
      totalEvents,
      largeEvents,
      totalSize,
      averageSize: totalEvents > 0 ? Math.round(totalSize / totalEvents) : 0,
    };
  }

  /**
   * Update frame index for the most recent paste event
   */
  updateLastPasteFrame(frameIndex: number): void {
    if (this.pasteEvents.length > 0) {
      const lastEvent = this.pasteEvents[this.pasteEvents.length - 1];
      if (lastEvent.frameIndex === null) {
        lastEvent.frameIndex = frameIndex;
      }
    }
  }
}
