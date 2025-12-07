/**
 * API Configuration
 *
 * Centralized API URL configuration for the pilotstack desktop app.
 * No secrets here - just public endpoints.
 *
 * Reference: OPEN_SOURCE_ARCHITECTURE.md - Desktop App Security Architecture
 */

import { app } from "electron";

/**
 * Production API URL
 */
const PRODUCTION_API_URL = "https://pilotstack.app";

/**
 * Development API URL
 */
const DEVELOPMENT_API_URL = "http://localhost:3000";

/**
 * Get the API base URL
 *
 * Priority:
 * 1. PILOTSTACK_API_URL environment variable (for testing/staging)
 * 2. pilotstack.app in production (packaged app)
 * 3. localhost:3000 in development
 *
 * @returns Base URL for API requests
 */
export function getApiBaseUrl(): string {
  // Allow override via environment variable for testing/staging
  const envUrl = process.env.PILOTSTACK_API_URL;
  if (envUrl) {
    return envUrl;
  }

  return app.isPackaged ? PRODUCTION_API_URL : DEVELOPMENT_API_URL;
}

/**
 * API endpoint paths
 *
 * These are the public API endpoints used by the desktop app.
 * All paths are relative to the base URL.
 */
export const API_ENDPOINTS = {
  // Authentication
  AUTH_PROFILE: "/api/auth/profile",
  AUTH_REFRESH: "/api/auth/refresh",

  // Upload
  UPLOAD: "/api/upload",
  UPLOAD_MULTIPART: "/api/upload/multipart",

  // Recordings
  RECORDINGS_FINALIZE: "/api/recordings/finalize",
  RECORDINGS_VIEW: "/recordings", // For constructing shareable URLs

  // Projects (Phase 5: Desktop App Integration)
  PROJECTS: "/api/projects",
} as const;

/**
 * API endpoint type
 */
export type ApiEndpoint = keyof typeof API_ENDPOINTS;

/**
 * Build full API URL for an endpoint
 *
 * @param endpoint - API endpoint key
 * @returns Full URL for the endpoint
 *
 * @example
 * ```typescript
 * const url = buildApiUrl("AUTH_PROFILE");
 * // Returns: "https://pilotstack.app/api/auth/profile" (production)
 * // Returns: "http://localhost:3000/api/auth/profile" (development)
 * ```
 */
export function buildApiUrl(endpoint: ApiEndpoint): string {
  return `${getApiBaseUrl()}${API_ENDPOINTS[endpoint]}`;
}

/**
 * Build a URL with path parameters
 *
 * @param endpoint - API endpoint key
 * @param params - Path parameters to append
 * @returns Full URL with parameters
 *
 * @example
 * ```typescript
 * const url = buildApiUrlWithParams("RECORDINGS_VIEW", "rec_123");
 * // Returns: "https://pilotstack.app/recordings/rec_123"
 * ```
 */
export function buildApiUrlWithParams(endpoint: ApiEndpoint, ...params: string[]): string {
  const baseUrl = buildApiUrl(endpoint);
  if (params.length === 0) {
    return baseUrl;
  }
  return `${baseUrl}/${params.join("/")}`;
}

/**
 * Check if a URL is a valid pilotstack API URL
 *
 * @param url - URL to validate
 * @returns True if the URL is a valid pilotstack API URL
 */
export function isValidApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const baseUrl = getApiBaseUrl();
    const baseUrlParsed = new URL(baseUrl);

    // Must match the base URL's host
    return parsed.host === baseUrlParsed.host;
  } catch {
    return false;
  }
}

// =============================================================================
// Legacy compatibility - getWebAppUrl is deprecated, use getApiBaseUrl instead
// =============================================================================

/**
 * @deprecated Use `getApiBaseUrl()` instead
 *
 * This function is kept for backward compatibility during migration.
 * It will be removed in a future version.
 */
export function getWebAppUrl(): string {
  return getApiBaseUrl();
}
