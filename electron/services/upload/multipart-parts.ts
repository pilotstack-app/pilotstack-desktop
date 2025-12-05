/**
 * Multipart Parts Upload
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §5 - Multipart Upload
 *
 * Part upload logic and configuration.
 */

import { secureAuthManager, store } from "../../config/store";
import { buildApiUrl } from "../../config/api";
import {
  generateRequestSignature,
  generateDeviceFingerprint,
} from "../../utils/crypto-helpers";
import { logger } from "../../utils/logger";

// Multipart upload configuration
export const MAX_PARALLEL_UPLOADS = 8;
export const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum (S3 requirement)
export const MAX_PARTS = 10000; // S3 limit
export const SMALL_FILE_THRESHOLD = 500 * 1024 * 1024; // 500MB
export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024 * 1024; // 5GB

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
 * Refresh access token for multipart
 */
export async function refreshAccessTokenForMultipart(): Promise<string | null> {
  const refreshToken = secureAuthManager.getRefreshToken();
  const deviceId = secureAuthManager.getDeviceId();
  const deviceSecret = secureAuthManager.getDeviceSecret();

  if (!refreshToken || !deviceId) {
    logger.warn("Cannot refresh token: missing credentials");
    return null;
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
        return data.accessToken;
      }
    }

    logger.warn("Token refresh failed (multipart helper)", {
      status: response.status,
    });
    return null;
  } catch (error: any) {
    logger.error("Token refresh error (multipart helper)", {
      error: error.message,
    });
    return null;
  }
}

/**
 * POST JSON with automatic token refresh
 */
export async function postJsonWithAuth(
  endpoint: string,
  bodyObj: Record<string, any>,
  token: string
): Promise<{ response: Response; token: string }> {
  let currentToken = token;
  const attempt = async (): Promise<Response> => {
    const bodyString = JSON.stringify(bodyObj);
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentToken}`,
      ...createSignedHeaders(bodyString),
    };
    return fetch(endpoint, { method: "POST", headers, body: bodyString });
  };

  let resp = await attempt();
  if (resp.status === 401 || resp.status === 403) {
    const refreshed = await refreshAccessTokenForMultipart();
    if (refreshed) {
      currentToken = refreshed;
      resp = await attempt();
    }
  }

  return { response: resp, token: currentToken };
}

/**
 * Calculate optimal part size based on file size
 *
 * S3 constraints: 5MB minimum, 5GB maximum per part, max 10,000 parts
 */
export function calculatePartSize(fileSize: number): number {
  // For files under 500MB, use 25MB parts for more parallelism
  if (fileSize < SMALL_FILE_THRESHOLD) {
    return 25 * 1024 * 1024; // 25MB
  }

  // For files 500MB to 5GB, use 50MB parts
  if (fileSize < LARGE_FILE_THRESHOLD) {
    return 50 * 1024 * 1024; // 50MB
  }

  // For very large files (>5GB), calculate to stay under part limit
  const calculatedPartSize = Math.ceil(fileSize / MAX_PARTS);
  const maxPartSize = 5 * 1024 * 1024 * 1024; // 5GB
  return Math.max(MIN_PART_SIZE, Math.min(calculatedPartSize, maxPartSize));
}

/**
 * Upload a single part to S3
 */
export async function uploadPart(
  uploadUrl: string,
  partBuffer: Buffer,
  partNumber: number
): Promise<{ PartNumber: number; ETag: string }> {
  const partResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": partBuffer.length.toString(),
    },
    body: partBuffer,
  });

  if (!partResponse.ok) {
    throw new Error(`Part ${partNumber} upload failed: ${partResponse.status}`);
  }

  const etag = partResponse.headers.get("etag");
  if (!etag) {
    throw new Error(`Part ${partNumber} missing ETag`);
  }

  return {
    PartNumber: partNumber,
    ETag: etag.replace(/"/g, ""),
  };
}
