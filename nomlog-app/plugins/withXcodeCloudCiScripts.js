/**
 * Copies Xcode Cloud scripts from `xcode-cloud-ci/` into `ios/ci_scripts/` after each prebuild.
 * `expo prebuild --clean` wipes `ios/`; without this, committed CI scripts are lost.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const FILES = ['ci_post_clone.sh', 'ci_pre_xcodebuild.sh'];

module.exports = function withXcodeCloudCiScripts(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sourceDir = path.join(projectRoot, 'xcode-cloud-ci');
      const targetDir = path.join(projectRoot, 'ios', 'ci_scripts');

      if (!fs.existsSync(sourceDir)) {
        console.warn(
          '[withXcodeCloudCiScripts] missing directory xcode-cloud-ci/ — skipping Xcode Cloud script copy'
        );
        return config;
      }

      fs.mkdirSync(targetDir, { recursive: true });
      for (const name of FILES) {
        const src = path.join(sourceDir, name);
        const dest = path.join(targetDir, name);
        if (!fs.existsSync(src)) {
          console.warn(`[withXcodeCloudCiScripts] missing ${name} in xcode-cloud-ci/`);
          continue;
        }
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o755);
      }
      return config;
    },
  ]);
};
