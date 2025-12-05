/**
 * macOS Notarization Script for Electron Builder
 * 
 * This script is called by electron-builder after signing to notarize the app with Apple.
 * 
 * Required environment variables:
 * - APPLE_ID: Your Apple ID email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
 * 
 * To generate an app-specific password:
 * 1. Go to https://appleid.apple.com
 * 2. Sign in with your Apple ID
 * 3. In "App-Specific Passwords", generate a new password for "pilotstack Notarization"
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  // Skip if not in CI or if explicitly disabled
  if (process.env.SKIP_NOTARIZATION === 'true') {
    console.log('Skipping notarization - SKIP_NOTARIZATION is set');
    return;
  }

  // Check for required environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !appleTeamId) {
    console.log('Skipping notarization - missing Apple credentials');
    console.log('Required: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appName}...`);
  console.log(`App path: ${appPath}`);

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId,
      appleIdPassword,
      teamId: appleTeamId,
    });

    console.log(`Successfully notarized ${appName}`);
  } catch (error) {
    console.error('Notarization failed:', error);
    
    // In CI, fail the build if notarization fails
    if (process.env.CI) {
      throw error;
    }
  }
};

