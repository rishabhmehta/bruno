require('dotenv').config({ path: process.env.DOTENV_PATH });
const fs = require('fs');
const path = require('path');
const electron_notarize = require('electron-notarize');

/*
 * Notarizes the signed macOS app with the signer's own Apple account (electron-builder
 * afterSign hook). Everything comes from the environment; nothing here names a person
 * or company:
 *
 *   APPLE_SIGNING_IDENTITY        "Jane Doe (ABCDE12345)" (also read by electron-builder-config.js)
 *   APPLE_ID                      the Apple ID email of that developer account
 *   APPLE_APP_SPECIFIC_PASSWORD   app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID                 "ABCDE12345", must match the identity
 *   SKIP_NOTARIZE=true            sign but don't notarize (local testing only)
 */
const notarize = async function (params) {
  if (process.platform !== 'darwin' || params.electronPlatformName !== 'darwin') {
    return;
  }

  const identity = process.env.APPLE_SIGNING_IDENTITY;
  if (!identity) {
    console.log('Skipping notarization: the app was not signed (APPLE_SIGNING_IDENTITY is not set).');
    return;
  }

  if (process.env.SKIP_NOTARIZE === 'true') {
    console.warn('Skipping notarization (SKIP_NOTARIZE=true). macOS will block this app when it is downloaded.');
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  const missing = [
    !appleId && 'APPLE_ID',
    !appleIdPassword && 'APPLE_APP_SPECIFIC_PASSWORD',
    !teamId && 'APPLE_TEAM_ID'
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Cannot notarize: missing ${missing.join(', ')}. Set them, or SKIP_NOTARIZE=true for a local-only build.`);
  }

  // Signing with one team and notarizing with another fails at Apple with an unclear error.
  const identityTeamId = (identity.match(/\(([A-Z0-9]{10})\)\s*$/) || [])[1];
  if (identityTeamId && identityTeamId !== teamId) {
    throw new Error(`APPLE_SIGNING_IDENTITY is for team ${identityTeamId} but APPLE_TEAM_ID is ${teamId}. They must be the same account.`);
  }

  const appBundleId = params.packager.appInfo.id;
  const appPath = path.join(params.appOutDir, `${params.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`Cannot notarize: no app found at ${appPath}`);
  }

  console.log(`Notarizing ${appBundleId} at ${appPath} for team ${teamId}. This usually takes a few minutes.`);
  await electron_notarize.notarize({
    tool: 'notarytool',
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    teamId
  });
  console.log(`Notarized ${appPath}`);
};

module.exports = notarize;
