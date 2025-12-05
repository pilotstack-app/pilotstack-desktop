/**
 * Deep Link Handler
 *
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §4 - Deep Linking (OAuth)
 *
 * Handles OAuth callback deep links.
 * Maps to: main.js deep linking section
 */

import { app } from "electron";
import { AppContext } from "../../core/app-context";
import { secureAuthManager, store } from "../../config/store";
import { buildApiUrl } from "../../config/api";
import { logger } from "../../utils/logger";
import { AuthService } from "../auth/auth-service";

/**
 * Deep Link Handler
 *
 * Handles OAuth callback deep links from the web app.
 */
export class DeepLinkHandler {
  private context: AppContext;
  private authService: AuthService;

  constructor(context: AppContext) {
    this.context = context;
    this.authService = context.getAuthService();
  }

  /**
   * Handle deep link URL
   *
   * Handles pilotstack://callback?token=xxx URLs for OAuth authentication.
   * Supports both enhanced auth (access/refresh tokens) and legacy auth.
   *
   * Reference: ARCHITECTURE_DOCUMENTATION.md - Main Process §4 - Deep Linking (OAuth)
   *
   * @param url - Deep link URL (e.g., pilotstack://callback?access_token=xxx&refresh_token=xxx)
   */
  async handleDeepLink(url: string): Promise<void> {
    logger.debug("Deep link received", { url });

    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname.replace(/^\/+/, "");

      if (pathname === "callback" || parsedUrl.host === "callback") {
        const token = parsedUrl.searchParams.get("token");
        const deviceToken = parsedUrl.searchParams.get("device_token");
        const accessToken = parsedUrl.searchParams.get("access_token");
        const refreshToken = parsedUrl.searchParams.get("refresh_token");
        const deviceSecret = parsedUrl.searchParams.get("device_secret");
        const expiresIn = parsedUrl.searchParams.get("expires_in");

        // Enhanced auth flow with access/refresh tokens
        if (accessToken && refreshToken) {
          await this.handleEnhancedAuth(accessToken, refreshToken, deviceSecret || "", expiresIn);
        }
        // Legacy auth flow (backward compatibility)
        else if (token || deviceToken) {
          await this.handleLegacyAuth(token || deviceToken!);
        } else {
          logger.warn("Deep link missing authentication tokens", { url });
        }
      }
    } catch (error: any) {
      logger.error("Failed to parse deep link", { error: error.message, url });
    }
  }

  /**
   * Handle enhanced authentication flow
   *
   * @param accessToken - Access token
   * @param refreshToken - Refresh token
   * @param deviceSecret - Device secret
   * @param expiresIn - Expiration time in seconds
   */
  private async handleEnhancedAuth(
    accessToken: string,
    refreshToken: string,
    deviceSecret: string,
    expiresIn: string | null
  ): Promise<void> {
    const deviceId = secureAuthManager.getDeviceId() || (store.get("deviceId") as string | null);
    const accessTokenExpiresAt = expiresIn
      ? Date.now() + parseInt(expiresIn, 10) * 1000
      : Date.now() + 60 * 60 * 1000; // 1 hour default
    const refreshTokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    await this.authService.storeCredentials({
      accessToken,
      refreshToken,
      deviceId: deviceId || "",
      deviceSecret,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    // Fetch user profile after successful auth
    await this.fetchAndCacheUserProfile(accessToken);

    // Notify renderer
    const windowManager = this.context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("auth:token-received", {
        success: true,
        isEnhancedAuth: true,
      });
    }

    // Show window to confirm connection
    windowManager.showWindow();

    // Process pending uploads after successful auth
    await this.processPendingUploadsAfterAuth();

    logger.info("Enhanced authentication successful");
  }

  /**
   * Handle legacy authentication flow
   *
   * @param token - Legacy device token
   */
  private async handleLegacyAuth(token: string): Promise<void> {
    const deviceId = store.get("deviceId") as string | null;

    // Use legacy method for backward compatibility
    secureAuthManager.setDeviceToken(token, deviceId);
    store.set("deviceToken", token); // Keep for backward compat
    store.set("deviceTokenTimestamp", Date.now());

    // Fetch user profile after successful auth (legacy tokens work too)
    await this.fetchAndCacheUserProfile(token);

    // Notify renderer
    const windowManager = this.context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("auth:token-received", {
        success: true,
        token,
      });
    }

    // Show window to confirm connection
    windowManager.showWindow();

    // Process pending uploads after successful auth
    await this.processPendingUploadsAfterAuth();

    logger.info("Legacy authentication successful");
  }

  /**
   * Fetch user profile from web app and cache it
   *
   * @param accessToken - Access token for authentication
   */
  private async fetchAndCacheUserProfile(accessToken: string): Promise<void> {
    try {
      const deviceInfo = await this.authService.getDeviceInfo();
      const response = await fetch(buildApiUrl("AUTH_PROFILE"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Device-ID": deviceInfo.deviceId,
          "X-Device-Fingerprint": deviceInfo.fingerprint,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { user?: any };
        if (data.user) {
          secureAuthManager.updateUserProfile(data.user);

          const windowManager = this.context.getWindowManager();
          const mainWindow = windowManager.getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send("auth:profile-updated", data.user);
          }

          logger.info("User profile cached", { userId: data.user.id });
        }
      }
    } catch (error: any) {
      logger.warn("Failed to fetch user profile", { error: error.message });
    }
  }

  /**
   * Process pending uploads after successful authentication
   *
   * This is called when the user returns from OAuth flow.
   */
  private async processPendingUploadsAfterAuth(): Promise<void> {
    const recordingsManager = this.context.getRecordingsManager();
    const pendingRecordings = recordingsManager.processPendingUploads();

    if (pendingRecordings.length === 0) {
      logger.info("No pending uploads to process after auth");
      return;
    }

    logger.info("Processing pending uploads after auth", {
      count: pendingRecordings.length,
    });

    // Notify renderer about pending uploads being processed
    const windowManager = this.context.getWindowManager();
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("recordings:changed", {
        recordings: recordingsManager.getAll(),
      });
    }

    // Process each pending recording
    const uploadService = this.context.getUploadService();
    for (const recording of pendingRecordings) {
      try {
        await uploadService.uploadRecording(recording.id, undefined, mainWindow);
      } catch (error: any) {
        logger.error("Failed to upload pending recording", {
          id: recording.id,
          error: error.message,
        });
        recordingsManager.markUploadFailed(recording.id, error.message);
      }
    }
  }

  /**
   * Register protocol handler
   *
   * Registers the app as the default protocol client for deep links.
   *
   * @param protocolScheme - Protocol scheme (e.g., "pilotstack")
   */
  registerProtocol(protocolScheme: string): void {
    const path = require("path");

    // Clear any stale association first
    app.removeAsDefaultProtocolClient(protocolScheme);

    // Attempt dev registration (electron .) so deep links hit the running dev app
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }

    // Always attempt a packaged-style registration as a fallback (uses the actual Electron binary path)
    app.setAsDefaultProtocolClient(protocolScheme, app.getPath("exe"));

    const isDefault = app.isDefaultProtocolClient(protocolScheme);
    logger.info("Protocol handler registered", {
      protocolScheme,
      exe: app.getPath("exe"),
      isDefault,
    });

    if (!isDefault) {
      logger.warn(
        "Protocol handler is not the default. Deep links may open another Electron app. " +
          "If this persists, clear stale handlers with lsregister or run a packaged build once to rebind."
      );
    }
  }
}
