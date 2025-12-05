/**
 * Auth IPC Handlers
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §3 - Auth Handlers
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication
 *
 * Handles all authentication-related IPC requests.
 * Maps to: main.js auth IPC handlers section
 */

import { shell } from "electron";
import * as os from "os";
import * as crypto from "crypto";
import { AppContext } from "../core/app-context";
import { secureAuthManager, store } from "../config/store";
import { buildApiUrl } from "../config/api";
import { generateDeviceFingerprint } from "../utils/crypto-helpers";
import { logger } from "../utils/logger";
import { UserProfile } from "../config/types";
import { handleWithValidation, handleNoArgs } from "./validation";
import { setDeviceCredentialsSchema, openConnectSchema } from "./schemas";

/**
 * Safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}

/**
 * Register auth IPC handlers
 */
export function registerAuthHandlers(context: AppContext): void {
  // auth:get-device-info - Get device information
  // Maps to: main.js auth:get-device-info handler
  handleNoArgs("auth:get-device-info", () => {
    // Get or generate device ID
    let deviceId = store.get("deviceId") as string | undefined;
    if (!deviceId) {
      // Generate a unique device ID based on machine info + random
      const machineInfo = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || "unknown"}`;
      const hash = crypto
        .createHash("sha256")
        .update(machineInfo + crypto.randomBytes(16).toString("hex"))
        .digest("hex");
      deviceId = `dev_${hash.substring(0, 32)}`;
      store.set("deviceId", deviceId);
    }

    return {
      deviceId,
      deviceName: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      fingerprint: generateDeviceFingerprint(),
    };
  });

  // auth:set-device-credentials - Set device credentials
  // Maps to: main.js auth:set-device-credentials handler
  handleWithValidation(
    "auth:set-device-credentials",
    setDeviceCredentialsSchema,
    (_event, credentials) => {
      store.set("deviceId", credentials.deviceId);

      // Use new secure auth manager for enhanced auth
      if (credentials.accessToken && credentials.refreshToken) {
        const accessTokenExpiresAt = credentials.expiresIn
          ? Date.now() + credentials.expiresIn * 1000
          : Date.now() + 60 * 60 * 1000;
        const refreshTokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

        secureAuthManager.setCredentials({
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          deviceId: credentials.deviceId,
          deviceSecret: credentials.deviceSecret || "",
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
        });
      } else if (credentials.deviceSecret) {
        // Legacy: just store device secret
        store.set("deviceSecret", credentials.deviceSecret);
      }

      return { success: true };
    }
  );

  // auth:get-token - Get authentication token
  // Maps to: main.js auth:get-token handler
  handleNoArgs("auth:get-token", () => {
    // Try new secure auth first
    const accessToken = secureAuthManager.getAccessToken();
    if (accessToken) {
      return {
        token: accessToken,
        timestamp: Date.now(),
        isSecure: true,
        needsRefresh: secureAuthManager.isAccessTokenExpired(),
      };
    }

    // Fall back to legacy token
    return {
      token: store.get("deviceToken") as string | null,
      timestamp: store.get("deviceTokenTimestamp") as number | null,
      isSecure: false,
    };
  });

  // auth:get-auth-state - Get authentication state
  // Maps to: main.js auth:get-auth-state handler
  handleNoArgs("auth:get-auth-state", () => {
    return secureAuthManager.getAuthState();
  });

  // auth:get-user-profile - Get user profile
  // Maps to: main.js auth:get-user-profile handler
  handleNoArgs("auth:get-user-profile", async () => {
    // First check cached profile
    const cachedProfile = secureAuthManager.getUserProfile();
    if (cachedProfile) {
      return cachedProfile;
    }

    // Get token (try secure auth first, then legacy)
    let token = secureAuthManager.getAccessToken();
    if (!token) {
      token = store.get("deviceToken") as string | null;
    }

    if (!token) {
      return null;
    }

    try {
      const response = await fetch(buildApiUrl("AUTH_PROFILE"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Device-ID": (store.get("deviceId") as string) || "",
          "X-Device-Fingerprint": generateDeviceFingerprint(),
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { user?: UserProfile };
        if (data.user) {
          // Cache the profile
          secureAuthManager.updateUserProfile(data.user);
          return data.user;
        }
      } else {
        logger.warn("Failed to fetch user profile", {
          status: response.status,
        });
      }
    } catch (error: unknown) {
      logger.error("Error fetching user profile", { error: getErrorMessage(error) });
    }

    return null;
  });

  // auth:refresh-token - Refresh access token
  // Maps to: main.js auth:refresh-token handler
  handleNoArgs("auth:refresh-token", async () => {
    const authService = context.getAuthService();
    const success = await authService.refreshToken();
    return { success };
  });

  // auth:clear-token - Clear authentication
  // Maps to: main.js auth:clear-token handler
  handleNoArgs("auth:clear-token", () => {
    // Clear both new secure auth and legacy
    secureAuthManager.clearCredentials();
    // Legacy store keys - use type assertion since they're not in AppSettings schema
    (store as { delete: (key: string) => void }).delete("deviceToken");
    (store as { delete: (key: string) => void }).delete("deviceTokenTimestamp");
    (store as { delete: (key: string) => void }).delete("deviceSecret");
    return { success: true };
  });

  // auth:open-connect - Open connection URL in browser
  // Maps to: main.js auth:open-connect handler
  handleWithValidation("auth:open-connect", openConnectSchema, (_event, { url }) => {
    shell.openExternal(url);
    return { success: true };
  });
}
