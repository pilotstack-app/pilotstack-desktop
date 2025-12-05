/**
 * Activity Tracker
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §3 - Activity Tracking
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Performance Optimizations §2 - Memory Management
 * 
 * Tracks activity markers per frame for verification.
 * Maps to: utils/streaming-encoder.js activity tracking section (lines 39-64, 560-593, 925-987)
 */

/**
 * Activity marker for a single frame
 */
export interface ActivityMarker {
  frameNumber: number;
  timestamp: number;
  isIdle: boolean;
  keystrokesDelta: number;
  hadPaste: boolean;
  segmentIndex: number;
}

/**
 * Activity aggregates for long recordings
 */
export interface ActivityAggregates {
  totalKeystrokes: number;
  pasteCount: number;
  idleFrameCount: number;
  activeFrameCount: number;
}

/**
 * Activity tracker for streaming encoder
 * 
 * Tracks activity markers per frame for verification.
 * Limits in-memory storage to prevent OOM for long recordings (7-8 hours).
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Performance Optimizations §2 - Memory Management
 */
export class ActivityTracker {
  private markers: ActivityMarker[] = [];
  private readonly MAX_MARKERS = 10000; // Prevent OOM for long recordings
  private aggregates: ActivityAggregates = {
    totalKeystrokes: 0,
    pasteCount: 0,
    idleFrameCount: 0,
    activeFrameCount: 0,
  };
  private replaceIndex = 0;

  /**
   * Add activity marker for a frame
   * 
   * For long recordings, we limit in-memory storage and aggregate stats.
   * At 30fps for 8 hours, that's 864,000 markers (~130MB in memory).
   * We limit to ~10,000 markers in memory, aggregating the rest.
   */
  addMarker(
    frameNumber: number,
    timestamp: number,
    activityData: {
      isIdle?: boolean;
      keystrokesDelta?: number;
      hadPaste?: boolean;
    },
    segmentIndex: number
  ): void {
    const marker: ActivityMarker = {
      frameNumber,
      timestamp,
      isIdle: activityData.isIdle || false,
      keystrokesDelta: activityData.keystrokesDelta || 0,
      hadPaste: activityData.hadPaste || false,
      segmentIndex,
    };

    // Always update aggregates (accurate for all frames)
    this.aggregates.totalKeystrokes += marker.keystrokesDelta;
    if (marker.hadPaste) {
      this.aggregates.pasteCount++;
    }
    if (marker.isIdle) {
      this.aggregates.idleFrameCount++;
    } else {
      this.aggregates.activeFrameCount++;
    }

    // Only store marker in memory if under the limit
    if (this.markers.length < this.MAX_MARKERS) {
      this.markers.push(marker);
    } else {
      // Deterministic ring-buffer replacement to avoid unbounded growth
      this.markers[this.replaceIndex % this.MAX_MARKERS] = marker;
      this.replaceIndex = (this.replaceIndex + 1) % this.MAX_MARKERS;
    }
  }

  /**
   * Get activity markers (sampled for long recordings)
   */
  getMarkers(): ActivityMarker[] {
    return this.markers;
  }

  /**
   * Get activity aggregates (accurate for all frames)
   */
  getAggregates(): ActivityAggregates {
    return { ...this.aggregates };
  }

  /**
   * Get sampled markers for metadata (limited to ~1000 entries)
   * 
   * For very long recordings, we don't include all markers in metadata
   * as it can be 800k+ entries (86MB+ of JSON), causing:
   * - JSON.stringify() to hang or OOM
   * - JSON.parse() when loading to hang or OOM
   * - File writes to be extremely slow
   */
  getSampledMarkersForMetadata(maxMarkers: number = 1000): ActivityMarker[] {
    if (this.markers.length <= maxMarkers) {
      // Short recording - include all markers
      return this.markers;
    }

    // Long recording - sample markers evenly
    const sampleInterval = Math.ceil(this.markers.length / maxMarkers);
    const sampled: ActivityMarker[] = [];

    for (let i = 0; i < this.markers.length; i += sampleInterval) {
      sampled.push(this.markers[i]);
    }

    // Always include last marker
    if (
      sampled.length > 0 &&
      sampled[sampled.length - 1] !== this.markers[this.markers.length - 1]
    ) {
      sampled.push(this.markers[this.markers.length - 1]);
    }

    return sampled;
  }

  /**
   * Reset tracker (for new recording)
   */
  reset(): void {
    this.markers = [];
    this.replaceIndex = 0;
    this.aggregates = {
      totalKeystrokes: 0,
      pasteCount: 0,
      idleFrameCount: 0,
      activeFrameCount: 0,
    };
  }
}
