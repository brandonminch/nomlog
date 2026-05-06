/**
 * onesignal-expo-plugin sometimes leaves `DEVELOPMENT_TEAM = undefined` and an old deployment
 * target on the NSE target. Xcode then cannot create/find provisioning profiles.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function fixOneSignalExtensionSigning(config, { teamId } = {}) {
  const id =
    teamId ||
    config?.ios?.appleTeamId ||
    process.env.EXPO_APPLE_TEAM_ID ||
    require('../app.json').expo?.ios?.appleTeamId;

  if (!id) {
    return config;
  }

  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const xcodeprojDir =
        fs.existsSync(path.join(iosRoot, 'nomlog.xcodeproj')) ? 'nomlog.xcodeproj' : null;
      const fallback =
        !xcodeprojDir &&
        fs
          .readdirSync(iosRoot, { withFileTypes: true })
          .find((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'))?.name;
      const proj = xcodeprojDir || fallback;
      if (!proj) {
        return cfg;
      }
      const pbxPath = path.join(iosRoot, proj, 'project.pbxproj');
      if (!fs.existsSync(pbxPath)) {
        return cfg;
      }
      let body = fs.readFileSync(pbxPath, 'utf8');
      const before = body;
      body = body.replace(/DEVELOPMENT_TEAM = undefined;/g, `DEVELOPMENT_TEAM = ${id};`);
      body = body.replace(/DevelopmentTeam = undefined;/g, `DevelopmentTeam = ${id};`);
      // OneSignal NSE only uses 11.0 in this project; align with main app.
      body = body.replace(
        /(INFOPLIST_FILE = "OneSignalNotificationServiceExtension\/OneSignalNotificationServiceExtension-Info.plist";)\n\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 11\.0;/g,
        '$1\n\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.1;'
      );
      if (body !== before) {
        fs.writeFileSync(pbxPath, body);
      }
      return cfg;
    },
  ]);
};
