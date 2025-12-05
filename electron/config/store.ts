/**
 * Electron Store Configuration
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Configuration & Settings
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Secure Storage
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Token Management
 * 
 * Migrated from config/store.js
 * Maps to: config/store.js
 */

import Store from "electron-store";
import {
  AppSettings,
  SessionState,
  Recording,
  AuthCredentials,
  UserProfile,
  StoredAuthData,
  AuthState,
} from "./types";
import {
  encryptSecure,
  decryptSecure,
  isSecureStorageAvailable,
} from "../utils/crypto-helpers";

/**
 * Main application settings store
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Configuration & Settings §Settings Store Schema
 */
export const store = new Store<AppSettings>({
  encryptionKey: "pilotstack-secure-key-v1",
  schema: {
    frameRate: { type: "number", default: 30, minimum: 1, maximum: 60 },
    captureInterval: {
      type: "number",
      default: 1000,
      minimum: 100,
      maximum: 10000,
    },
    outputDirectory: { type: "string", default: "" },
    theme: { type: "string", default: "dark" },
    useHardwareAcceleration: { type: "boolean", default: true },
    captureQuality: { type: "string", default: "high" },
    useJpegCapture: { type: "boolean", default: true },
    enableAdaptiveQuality: { type: "boolean", default: true },
    enableFrameSkipping: { type: "boolean", default: false },
    enableDynamicInterval: { type: "boolean", default: true },
    maxQueueSize: { type: "number", default: 50, minimum: 10, maximum: 200 },
    maxCapturePixels: { type: "number", default: 0, minimum: 0 },
    jpegQuality: { type: "number", default: 85, minimum: 20, maximum: 95 },
    compressionMode: { type: "string", default: "quality" },
    useStreamingEncoder: { type: "boolean", default: true },
    showWatermark: { type: "boolean", default: true },
    watermarkText: { type: "string", default: "Made with pilotstack" },
    watermarkOpacity: { type: "number", default: 0.6, minimum: 0.1, maximum: 1.0 },
    watermarkPosition: { type: "string", default: "bottom-right" },
    showVerificationBadge: { type: "boolean", default: true },
    showStatsOverlay: { type: "boolean", default: true },
    userHandle: { type: "string", default: "" },
  },
});

/**
 * Session recovery store
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §6 - Session Recovery
 */
export const sessionStore = new Store<{ session: SessionState | null }>({
  name: "session-recovery",
  encryptionKey: "pilotstack-session-key-v1",
});

/**
 * Auth credentials store (encrypted)
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Secure Storage
 */
export const authStore = new Store<{ auth: StoredAuthData | undefined }>({
  name: "auth-credentials",
  encryptionKey: "pilotstack-auth-key-v2",
});

/**
 * Recordings library store
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Core Systems §5 - Recordings Library
 */
export const recordingsStore = new Store<{ recordings: Recording[] }>({
  name: "recordings-library",
  encryptionKey: "pilotstack-recordings-key-v1",
  schema: {
    recordings: {
      type: "array",
      default: [],
    },
  },
});

/**
 * Secure Auth Manager
 * 
 * Handles encrypted token storage with refresh capability.
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Token Management
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Configuration & Settings §8 - Authentication System
 * Maps to: config/store.js SecureAuthManager class
 */
export class SecureAuthManager {
  private readonly REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry
  private refreshTimer: NodeJS.Timeout | null = null;

  /**
   * Store authentication credentials securely
   * 
   * Encrypts sensitive tokens using safeStorage or fallback encryption.
   */
  setCredentials(credentials: AuthCredentials & { userProfile?: UserProfile }): void {
    const {
      accessToken,
      refreshToken,
      deviceId,
      deviceSecret,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      userProfile,
    } = credentials;

    // Encrypt sensitive tokens using safeStorage
    const encryptedAccessToken = encryptSecure(accessToken);
    const encryptedRefreshToken = encryptSecure(refreshToken);
    const encryptedDeviceSecret = encryptSecure(deviceSecret);

    if (!encryptedAccessToken || !encryptedRefreshToken || !encryptedDeviceSecret) {
      throw new Error("Failed to encrypt credentials");
    }

    authStore.set("auth", {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      deviceId,
      deviceSecret: encryptedDeviceSecret,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      userProfile: userProfile || null,
      lastUpdated: Date.now(),
    });

    console.log("Credentials stored securely", {
      safeStorageAvailable: isSecureStorageAvailable(),
    });
  }

  /**
   * Get decrypted access token
   */
  getAccessToken(): string | null {
    const auth = authStore.get("auth");
    if (!auth?.accessToken) return null;
    return decryptSecure(auth.accessToken);
  }

  /**
   * Get decrypted refresh token
   */
  getRefreshToken(): string | null {
    const auth = authStore.get("auth");
    if (!auth?.refreshToken) return null;
    return decryptSecure(auth.refreshToken);
  }

  /**
   * Get decrypted device secret
   */
  getDeviceSecret(): string | null {
    const auth = authStore.get("auth");
    if (!auth?.deviceSecret) return null;
    return decryptSecure(auth.deviceSecret);
  }

  /**
   * Get device ID
   */
  getDeviceId(): string | null {
    const auth = authStore.get("auth");
    return auth?.deviceId || null;
  }

  /**
   * Get cached user profile
   */
  getUserProfile(): UserProfile | null {
    const auth = authStore.get("auth");
    return auth?.userProfile || null;
  }

  /**
   * Update user profile cache
   */
  updateUserProfile(profile: UserProfile): void {
    const auth = authStore.get("auth");
    if (auth) {
      authStore.set("auth", { ...auth, userProfile: profile });
    }
  }

  /**
   * Check if access token is expired or about to expire
   */
  isAccessTokenExpired(): boolean {
    const auth = authStore.get("auth");
    if (!auth?.accessTokenExpiresAt) return true;
    return Date.now() >= auth.accessTokenExpiresAt - this.REFRESH_BUFFER;
  }

  /**
   * Check if refresh token is expired
   */
  isRefreshTokenExpired(): boolean {
    const auth = authStore.get("auth");
    if (!auth?.refreshTokenExpiresAt) return true;
    return Date.now() >= auth.refreshTokenExpiresAt;
  }

  /**
   * Update access token after refresh
   */
  updateAccessToken(accessToken: string, expiresAt: number): void {
    const auth = authStore.get("auth");
    if (auth) {
      const encryptedToken = encryptSecure(accessToken);
      if (!encryptedToken) {
        throw new Error("Failed to encrypt access token");
      }
      authStore.set("auth", {
        ...auth,
        accessToken: encryptedToken,
        accessTokenExpiresAt: expiresAt,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Check if user is authenticated
   * 
   * Verifies both that credentials exist AND can be successfully decrypted.
   * This prevents false positives where encrypted tokens exist but decryption fails.
   */
  isAuthenticated(): boolean {
    const auth = authStore.get("auth");
    if (!auth?.accessToken) return false;
    
    // Verify the token can actually be decrypted - decryptSecure returns null on failure
    const decryptedToken = decryptSecure(auth.accessToken);
    if (!decryptedToken) return false;
    
    return !this.isRefreshTokenExpired();
  }

  /**
   * Get time until access token expires
   */
  getTimeUntilExpiry(): number {
    const auth = authStore.get("auth");
    if (!auth?.accessTokenExpiresAt) return 0;
    return Math.max(0, auth.accessTokenExpiresAt - Date.now());
  }

  /**
   * Clear all credentials
   */
  clearCredentials(): void {
    authStore.delete("auth");
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    console.log("Credentials cleared");
  }

  /**
   * Get authentication state for renderer
   */
  getAuthState(): AuthState {
    const auth = authStore.get("auth");
    if (!auth) {
      return {
        isConnected: false,
        deviceId: null,
        userProfile: null,
        needsRefresh: false,
        wasConnected: false,
        sessionExpired: false,
      };
    }

    const isConnected = this.isAuthenticated();
    const accessTokenExpired = this.isAccessTokenExpired();
    const refreshTokenExpired = this.isRefreshTokenExpired();

    return {
      isConnected,
      deviceId: auth.deviceId,
      userProfile: auth.userProfile,
      accessTokenExpiresAt: auth.accessTokenExpiresAt,
      needsRefresh: accessTokenExpired,
      // Was previously connected (has stored credentials)
      wasConnected: !!auth.deviceId,
      // Session fully expired (refresh token expired, needs full re-auth)
      sessionExpired: refreshTokenExpired && !!auth.deviceId,
    };
  }

  /**
   * Legacy compatibility: Get device token (alias for access token)
   */
  getDeviceToken(): string | null {
    return this.getAccessToken();
  }

  /**
   * Legacy compatibility: Set device token (legacy format)
   * 
   * Supports old device token format for backward compatibility.
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Legacy Support
   */
  setDeviceToken(token: string, deviceId: string | null = null): void {
    const existingAuth = authStore.get("auth");
    const auth: Partial<StoredAuthData> = existingAuth || {};
    const encryptedToken = encryptSecure(token);
    if (!encryptedToken) {
      throw new Error("Failed to encrypt device token");
    }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    authStore.set("auth", {
      ...auth,
      accessToken: encryptedToken,
      // Set both expiration times for legacy tokens
      accessTokenExpiresAt: Date.now() + thirtyDays,
      refreshTokenExpiresAt: Date.now() + thirtyDays,
      // Mark as legacy token (no separate refresh token)
      refreshToken: encryptedToken, // Use same token for refresh
      // Include deviceId if provided
      deviceId: deviceId || auth.deviceId || null,
      deviceSecret: auth.deviceSecret || encryptedToken, // Use token as secret if not set
      userProfile: auth.userProfile || null,
      lastUpdated: Date.now(),
    } as StoredAuthData);

    console.log("Legacy device token stored with expiration dates", {
      deviceId: deviceId || auth.deviceId,
    });
  }
}

// Singleton instance
export const secureAuthManager = new SecureAuthManager();

