const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const projectRoot = __dirname;
const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), path.resolve(projectRoot, 'modules')];

config.resolver = {
  ...(config.resolver ?? {}),
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules ?? {}),
    'nomlog-health': path.resolve(projectRoot, 'modules/nomlog-health'),
  },
};

module.exports = config;
