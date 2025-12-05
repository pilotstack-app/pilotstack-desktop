/**
 * pilotstack Constants
 */

// Verification thresholds
export const VERIFICATION = {
  THRESHOLD: 70,
  // Legacy threshold (kept for backward compatibility)
  MAX_PASTE_SIZE: 300,
  // Tiered paste thresholds for smarter scoring
  // Small pastes (< 50 chars): No penalty - normal coding snippets (variable names, imports)
  // Medium pastes (50-300 chars): Minor penalty - could be normal code
  // Large pastes (300-1000 chars): Moderate penalty - likely copied functions
  // Very large pastes (> 1000 chars): Heavy penalty - likely AI-generated content
  PASTE_THRESHOLD_SMALL: 50, // Below this: no penalty
  PASTE_THRESHOLD_MEDIUM: 300, // 50-300: minor penalty
  PASTE_THRESHOLD_LARGE: 1000, // 300-1000: moderate penalty
  // Tiered penalties
  PASTE_PENALTY_SMALL: 0, // No penalty for tiny pastes
  PASTE_PENALTY_MEDIUM: 1, // 1 point for medium pastes
  PASTE_PENALTY_LARGE: 5, // 5 points for large pastes
  PASTE_PENALTY_VERY_LARGE: 15, // 15 points for very large pastes (AI-generated)
  // Legacy (kept for backward compatibility)
  PASTE_PENALTY_PER_EVENT: 5,
  MIN_ACTIVITY_RATIO: 0.3,
  MAX_PASTE_EVENTS_FOR_VERIFIED: 3,
  // New: max very large pastes before automatic disqualification
  MAX_VERY_LARGE_PASTES_FOR_VERIFIED: 1,
} as const;

// Idle detection
export const IDLE = {
  THRESHOLD_SECONDS: 30,
  MIN_MOUSE_MOVEMENT: 5,
  CHECK_INTERVAL_MS: 1000,
} as const;

// Timelapse generation
export const TIMELAPSE = {
  TARGET_DURATION_SECONDS: 30,
  MIN_DURATION_SECONDS: 5,
  MAX_DURATION_SECONDS: 120,
  DEFAULT_FPS: 30,
  IDLE_SPEED_MULTIPLIER: 10,
  ACTIVE_SPEED_MULTIPLIER: 1,
} as const;

// API
export const API = {
  DEVICE_TOKEN_EXPIRY_DAYS: 30,
  UPLOAD_URL_EXPIRY_SECONDS: 3600,
  RATE_LIMIT_WINDOW_SECONDS: 60,
  RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

// Storage
export const STORAGE = {
  MAX_VIDEO_SIZE_MB: 500,
  ALLOWED_VIDEO_TYPES: ["video/mp4", "video/webm"],
  THUMBNAIL_WIDTH: 320,
  THUMBNAIL_HEIGHT: 180,
} as const;

// Video overlay configuration
export const VIDEO_OVERLAY = {
  // Badge sizes relative to video height
  BADGE_HEIGHT_RATIO: 0.04, // 4% of video height
  BADGE_MIN_HEIGHT: 30,
  BADGE_MAX_HEIGHT: 60,

  // Stats box sizes
  STATS_BOX_WIDTH_RATIO: 0.25, // 25% of video width
  STATS_BOX_MIN_WIDTH: 200,
  STATS_BOX_MAX_WIDTH: 400,

  // Font sizes relative to video height
  FONT_SIZE_RATIO: 0.02, // 2% of video height
  FONT_MIN_SIZE: 14,
  FONT_MAX_SIZE: 28,

  // Margins relative to video dimensions
  MARGIN_RATIO: 0.02, // 2% margin

  // Watermark opacity
  WATERMARK_OPACITY: 0.6,
  WATERMARK_TEXT: "Made with pilotstack",
} as const;

// Aspect ratio detection thresholds
export const ASPECT_RATIOS = {
  LANDSCAPE_16_9: 1.7,
  LANDSCAPE_4_3: 1.2,
  SQUARE_MIN: 0.9,
  SQUARE_MAX: 1.1,
  PORTRAIT_3_4: 0.7,
} as const;

// Deep linking protocol
export const PROTOCOL = {
  SCHEME: "pilotstack",
  CALLBACK_PATH: "/callback",
  CONNECT_PATH: "/connect",
} as const;
