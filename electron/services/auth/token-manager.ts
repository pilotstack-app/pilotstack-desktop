/**
 * Token Manager
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Security & Authentication §Token Management
 * 
 * Manages token storage and refresh.
 * Maps to: config/store.js token management section
 */

import { AuthCredentials, UserProfile } from "../../config/types";
import { secureAuthManager } from "../../config/store";
import { isTokenExpired } from "../../utils/crypto-helpers";

/**
 * Token Manager
 * 
 * Wraps SecureAuthManager for token management operations.
 */
export class TokenManager {
  /**
   * Store credentials
   * 
   * Stores encrypted credentials securely using SecureAuthManager.
   * 
   * @param credentials - Auth credentials to store
   */
  async storeCredentials(credentials: AuthCredentials & { userProfile?: UserProfile }): Promise<void> {
    secureAuthManager.setCredentials(credentials);
  }

  /**
   * Get credentials
   * 
   * Retrieves and decrypts stored credentials.
   * 
   * @returns Decrypted credentials or null if not found
   */
  async getCredentials(): Promise<AuthCredentials | null> {
    const accessToken = secureAuthManager.getAccessToken();
    const refreshToken = secureAuthManager.getRefreshToken();
    const deviceId = secureAuthManager.getDeviceId();
    const deviceSecret = secureAuthManager.getDeviceSecret();
    const userProfile = secureAuthManager.getUserProfile();

    if (!accessToken || !refreshToken || !deviceId || !deviceSecret) {
      return null;
    }

    // Get expiration times from auth store
    const authStore = require("../../config/store").authStore;
    const auth = authStore.get("auth");
    if (!auth) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      deviceId,
      deviceSecret,
      accessTokenExpiresAt: auth.accessTokenExpiresAt,
      refreshTokenExpiresAt: auth.refreshTokenExpiresAt,
      userProfile: userProfile || undefined,
    };
  }

  /**
   * Check if token is expired
   * 
   * @param expiresAt - Expiration timestamp
   * @param bufferMs - Buffer time before expiry to consider expired (default: 1 minute)
   * @returns True if token is expired or about to expire
   */
  isTokenExpired(expiresAt: number, bufferMs: number = 60000): boolean {
    return isTokenExpired(expiresAt, bufferMs);
  }

  /**
   * Check if access token is expired
   * 
   * Uses SecureAuthManager's expiration check with refresh buffer.
   * 
   * @returns True if access token is expired or about to expire
   */
  isAccessTokenExpired(): boolean {
    return secureAuthManager.isAccessTokenExpired();
  }

  /**
   * Check if refresh token is expired
   * 
   * @returns True if refresh token is expired
   */
  isRefreshTokenExpired(): boolean {
    return secureAuthManager.isRefreshTokenExpired();
  }

  /**
   * Get access token
   * 
   * @returns Decrypted access token or null
   */
  getAccessToken(): string | null {
    return secureAuthManager.getAccessToken();
  }

  /**
   * Get refresh token
   * 
   * @returns Decrypted refresh token or null
   */
  getRefreshToken(): string | null {
    return secureAuthManager.getRefreshToken();
  }

  /**
   * Update access token after refresh
   * 
   * @param accessToken - New access token
   * @param expiresAt - New expiration timestamp
   */
  updateAccessToken(accessToken: string, expiresAt: number): void {
    secureAuthManager.updateAccessToken(accessToken, expiresAt);
  }

  /**
   * Clear credentials
   * 
   * Clears all stored credentials.
   */
  async clearCredentials(): Promise<void> {
    secureAuthManager.clearCredentials();
  }

  /**
   * Check if user is authenticated
   * 
   * @returns True if user has valid credentials
   */
  isAuthenticated(): boolean {
    return secureAuthManager.isAuthenticated();
  }
}

