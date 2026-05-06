const path = require('path');
const fs = require('fs');

const appJson = require('./app.json');
const fixOneSignalExtensionSigning = require('./plugins/fixOneSignalExtensionSigning');
const withXcodeCloudCiScripts = require('./plugins/withXcodeCloudCiScripts');
const withFmtPodfileFix = require('./plugins/withFmtPodfileFix');

// Local: pick env file from EXPO_APP_ENV (set in package.json scripts).
// EAS: set EXPO_APP_ENV in eas.json; EXPO_PUBLIC_* usually come from EAS env (no file on builder).
const mode = process.env.EXPO_APP_ENV === 'production' ? 'production' : 'development';
const envPath = path.join(__dirname, mode === 'production' ? '.env.production' : '.env.development');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
}

// Sentry native upload (Xcode "Bundle React Native" / sentry.properties) needs SENTRY_ORG and
// SENTRY_PROJECT at prebuild time. Often kept with SENTRY_AUTH_TOKEN in .env.sentry-build-plugin.
const sentryBuildEnvPath = path.join(__dirname, '.env.sentry-build-plugin');
if (fs.existsSync(sentryBuildEnvPath)) {
  require('dotenv').config({ path: sentryBuildEnvPath, override: true });
}

const isProd = mode === 'production';

/** Push entitlement + OneSignal native mode must match store/TestFlight (production), not dev client (development). */
const plugins = (appJson.expo.plugins || []).map((entry) => {
  if (Array.isArray(entry) && entry[0] === 'onesignal-expo-plugin') {
    const opts = entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
    return ['onesignal-expo-plugin', { ...opts, mode: isProd ? 'production' : 'development' }];
  }
  return entry;
});
plugins.push([
  '@sentry/react-native/expo',
  {
    url: 'https://sentry.io/',
    project: process.env.SENTRY_PROJECT,
    organization: process.env.SENTRY_ORG,
  },
]);
plugins.push([
  fixOneSignalExtensionSigning,
  {
    teamId: appJson.expo.ios?.appleTeamId || process.env.EXPO_APPLE_TEAM_ID,
  },
]);
plugins.push(withXcodeCloudCiScripts);
plugins.push(withFmtPodfileFix);

const ios = appJson.expo.ios
  ? {
      ...appJson.expo.ios,
      entitlements: {
        ...appJson.expo.ios.entitlements,
        'aps-environment': isProd ? 'production' : 'development',
      },
    }
  : undefined;

module.exports = {
  expo: {
    ...appJson.expo,
    ...(ios ? { ios } : {}),
    plugins,
    extra: {
      ...appJson.expo.extra,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      mealPhotoBucket: process.env.EXPO_PUBLIC_MEAL_PHOTO_BUCKET,
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    },
  },
};
