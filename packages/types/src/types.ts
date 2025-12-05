/**
 * pilotstack Shared Types
 * Common types used between desktop app and web dashboard
 */

// Session & Recording Types
export interface SessionMetadata {
  id: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  activeDuration: number;
  frameCount: number;
  pasteEvents: PasteEvent[];
  idlePeriods: IdlePeriod[];
  verificationScore: number;
  isVerified: boolean;
}

export interface PasteEvent {
  timestamp: number;
  approximateSize: number;
  frameIndex?: number;
}

export interface IdlePeriod {
  start: number;
  end: number;
  duration: number;
}

// Recording Types
export interface Recording {
  id: string;
  userId: string;
  deviceId?: string;
  title: string;
  description?: string;
  duration: number;
  activeDuration: number;
  verificationScore: number;
  isVerified: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  pasteEventCount: number;
  visibility: RecordingVisibility;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RecordingVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

// Device Types
export interface Device {
  id: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  lastActiveAt?: Date;
  createdAt: Date;
}

export interface DeviceRegistration {
  deviceId: string;
  deviceSecret: string;
  deviceName: string;
  platform: string;
}

// API Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  expiresAt: number;
}

export interface DeviceTokenResponse {
  token: string;
  expiresAt: number;
  refreshToken?: string;
}

// Verification Types
export interface VerificationResult {
  score: number;
  isVerified: boolean;
  factors: VerificationFactors;
}

export interface VerificationFactors {
  pasteScore: number;
  activityScore: number;
  consistencyScore: number;
  durationScore: number;
}

// Stats Overlay Types
export interface StatsOverlay {
  totalDuration: string;
  activeDuration: string;
  pasteEvents: number;
  isVerified: boolean;
  verificationScore: number;
}

// User Types (for web dashboard)
export interface User {
  id: string;
  name?: string;
  email: string;
  image?: string;
  createdAt: Date;
}

// Constants
export const VERIFICATION_THRESHOLD = 70;
export const MAX_PASTE_SIZE_FOR_VERIFIED = 100;
export const IDLE_THRESHOLD_SECONDS = 30;
export const TARGET_TIMELAPSE_DURATION_SECONDS = 30;
