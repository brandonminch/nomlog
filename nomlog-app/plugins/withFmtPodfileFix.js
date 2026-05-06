/**
 * Re-applies the fmt C++17 workaround after every `expo prebuild` (including `--clean`).
 * Without this, manual Podfile edits are lost when Expo regenerates `ios/`.
 */
const { withPodfile } = require('@expo/config-plugins');

const BEGIN = '# @generated begin nomlog-fmt-cpp17';
const END = '# @generated end nomlog-fmt-cpp17';

const SNIPPET = `
    ${BEGIN}
    # Xcode 16+ / Apple Clang 17+: fmt consteval archive fix — compile fmt pod as C++17 only
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |cfg|
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
    ${END}
`;

module.exports = function withFmtPodfileFix(config) {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(BEGIN)) {
      return cfg;
    }
    // Already patched manually (pre-prebuild); avoid duplicate blocks on incremental prebuild.
    if (contents.includes("next unless target.name == 'fmt'")) {
      return cfg;
    }

    const m = contents.match(/\n    react_native_post_install\(\n[\s\S]*?\n    \)\n/);
    if (!m) {
      console.warn('[withFmtPodfileFix] react_native_post_install block not found; skipping fmt fix');
      return cfg;
    }

    contents = contents.replace(m[0], `${m[0]}${SNIPPET}`);
    cfg.modResults.contents = contents;
    return cfg;
  });
};
