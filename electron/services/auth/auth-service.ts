/**
 * Auth Service
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication
 *
 * Main authentication service.
 * Maps to: config/store.js SecureAuthManager
 */

import { AppContext } from "../../core/app-context";
import { AuthCredentials, UserProfile, AuthState } from "../../config/types";
import { secureAuthManager, store } from "../../config/store";
import { buildApiUrl } from "../../config/api";
import { logger } from "../../utils/logger";
import { generateRequestSignature, generateDeviceFingerprint } from "../../utils/crypto-helpers";
import { TokenManager } from "./token-manager";
import { DeviceFingerprint } from "./device-fingerprint";

/**
 * Auth Service
 *
 * Orchestrates authentication operations including token management,
 * device fingerprinting, and user profile management.
 */
export class AuthService {
  private tokenManager: TokenManager;
  private deviceFingerprint: DeviceFingerprint;

  constructor(_context: AppContext) {
    this.tokenManager = new TokenManager();
    this.deviceFingerprint = new DeviceFingerprint();
  }

  /**
   * Get device information
   *
   * Returns device ID and fingerprint for authentication.
   *
   * @returns Device ID and fingerprint
   */
  async getDeviceInfo(): Promise<{ deviceId: string; fingerprint: string }> {
    const deviceId = secureAuthManager.getDeviceId() || store.get("deviceId") || "";
    const fingerprint = this.deviceFingerprint.generateSync();

    return {
      deviceId,
      fingerprint,
    };
  }

  /**
   * Get authentication token
   *
   * Gets valid access token, refreshing if necessary.
   *
   * @returns Access token or null if not authenticated
   */
  async getToken(): Promise<string | null> {
    let token = this.tokenManager.getAccessToken();

    // Check if token needs refresh
    if (token && this.tokenManager.isAccessTokenExpired()) {
      logger.info("Access token expired, attempting refresh");
      const refreshed = await this.refreshToken();
      if (refreshed) {
        token = this.tokenManager.getAccessToken();
      } else {
        // Refresh failed, token is invalid
        token = null;
      }
    }

    // Fall back to legacy token if secure auth not available
    if (!token) {
      token = store.get("deviceToken") as string | null;
    }

    return token;
  }

  /**
   * Refresh access token
   *
   * Refreshes the access token using the refresh token.
   *
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Token Management
   *
   * @returns True if refresh was successful
   */
  async refreshToken(): Promise<boolean> {
    const refreshToken = this.tokenManager.getRefreshToken();
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
        const data = (await response.json()) as { accessToken?: string; expiresIn?: number };
        if (data.accessToken) {
          const expiresAt = data.expiresIn
            ? Date.now() + data.expiresIn * 1000
            : Date.now() + 60 * 60 * 1000;

          this.tokenManager.updateAccessToken(data.accessToken, expiresAt);
          logger.info("Access token refreshed successfully");
          return true;
        }
      }

      logger.warn("Token refresh failed", { status: response.status });
      return false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Token refresh error", { error: errorMessage });
      return false;
    }
  }

  /**
   * Get user profile
   *
   * Gets cached user profile or fetches from server.
   *
   * @param forceRefresh - Force refresh from server (default: false)
   * @returns User profile or null if not authenticated
   */
  async getUserProfile(forceRefresh: boolean = false): Promise<UserProfile | null> {
    // Return cached profile if available and not forcing refresh
    if (!forceRefresh) {
      const cachedProfile = secureAuthManager.getUserProfile();
      if (cachedProfile) {
        return cachedProfile;
      }
    }

    // Fetch from server
    const token = await this.getToken();
    if (!token) {
      return null;
    }

    try {
      const deviceInfo = await this.getDeviceInfo();
      const response = await fetch(buildApiUrl("AUTH_PROFILE"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Device-ID": deviceInfo.deviceId,
          "X-Device-Fingerprint": deviceInfo.fingerprint,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { user?: any };
        if (data.user) {
          secureAuthManager.updateUserProfile(data.user);
          return data.user;
        }
      }

      logger.warn("Failed to fetch user profile", { status: response.status });
      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching user profile", { error: errorMessage });
      return null;
    }
  }

  /**
   * Clear authentication
   *
   * Clears all stored credentials and tokens.
   */
  async clearToken(): Promise<void> {
    await this.tokenManager.clearCredentials();
    logger.info("Authentication cleared");
  }

  /**
   * Store credentials
   *
   * Stores authentication credentials securely.
   *
   * @param credentials - Credentials to store
   */
  async storeCredentials(
    credentials: AuthCredentials & { userProfile?: UserProfile }
  ): Promise<void> {
    await this.tokenManager.storeCredentials(credentials);
  }

  /**
   * Get authentication state
   *
   * Returns current authentication state for renderer.
   *
   * @returns Auth state
   */
  getAuthState(): AuthState {
    return secureAuthManager.getAuthState();
  }

  /**
   * Check if user is authenticated
   *
   * @returns True if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.tokenManager.isAuthenticated();
  }

  /**
   * Get device ID
   *
   * @returns Device ID or null
   */
  getDeviceId(): string | null {
    return secureAuthManager.getDeviceId();
  }

  /**
   * Start automatic token refresh timer
   *
   * Checks token expiration every minute and refreshes if needed.
   * Refreshes if token expires in less than 5 minutes.
   *
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Token Management
   *
   * @returns Interval ID (can be used to stop the timer)
   */
  startTokenRefreshTimer(): NodeJS.Timeout {
    const checkAndRefresh = async () => {
      if (this.isAuthenticated()) {
        const timeUntilExpiry = secureAuthManager.getTimeUntilExpiry();

        // Refresh if token expires in less than 5 minutes
        if (timeUntilExpiry < 5 * 60 * 1000) {
          await this.refreshToken();
        }
      }
    };

    // Check every minute
    const intervalId = setInterval(checkAndRefresh, 60 * 1000);
    // Also check immediately
    checkAndRefresh();

    return intervalId;
  }
}
