/**
 * Upload Auth Helpers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Cloud Upload System
 *
 * Authentication helpers for upload operations.
 */

import { secureAuthManager, store } from "../../config/store";
import { buildApiUrl } from "../../config/api";
import {
  generateRequestSignature,
  generateDeviceFingerprint,
} from "../../utils/crypto-helpers";
import { logger } from "../../utils/logger";

/**
 * Create signed headers for API requests
 */
export function createSignedHeaders(body: string): Record<string, string> {
  const deviceId = secureAuthManager.getDeviceId() || store.get("deviceId");
  const deviceSecret =
    secureAuthManager.getDeviceSecret() || store.get("deviceSecret");

  const headers: Record<string, string> = {
    "X-Device-ID": deviceId || "",
    "X-Device-Fingerprint": generateDeviceFingerprint(),
  };

  if (deviceSecret && deviceSecret.length > 0) {
    const timestamp = Date.now().toString();
    const signature = generateRequestSignature(
      parseInt(timestamp, 10),
      body,
      deviceSecret
    );
    headers["X-Timestamp"] = timestamp;
    headers["X-Signature"] = signature;
  }

  return headers;
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = secureAuthManager.getRefreshToken();
  const deviceId = secureAuthManager.getDeviceId();
  const deviceSecret = secureAuthManager.getDeviceSecret();

  if (!refreshToken || !deviceId) {
    logger.warn("Cannot refresh token: missing credentials");
    return false;
  }

  try {
    const timestamp = Date.now().toString();
    const body = JSON.stringify({ refreshToken, deviceId });
    const signature = generateRequestSignature(
      parseInt(timestamp, 10),
      body,
      deviceSecret || ""
    );

    const response = await fetch(buildApiUrl("AUTH_REFRESH"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
        "X-Device-Fingerprint": generateDeviceFingerprint(),
      },
      body,
    });

    if (response.ok) {
      const data = (await response.json()) as {
        accessToken?: string;
        expiresIn?: number;
      };
      if (data.accessToken) {
        const expiresAt = data.expiresIn
          ? Date.now() + data.expiresIn * 1000
          : Date.now() + 60 * 60 * 1000;

        secureAuthManager.updateAccessToken(data.accessToken, expiresAt);
        logger.info("Access token refreshed successfully");
        return true;
      }
    }

    logger.warn("Token refresh failed", { status: response.status });
    return false;
  } catch (error: any) {
    logger.error("Token refresh error", { error: error.message });
    return false;
  }
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  let token = secureAuthManager.getAccessToken();

  if (token && secureAuthManager.isAccessTokenExpired()) {
    logger.info("Access token expired, attempting refresh");
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      token = secureAuthManager.getAccessToken();
    }
  }

  // Fall back to legacy token if secure auth not available
  if (!token) {
    token = store.get("deviceToken") as string | null;
  }

  return token;
}
