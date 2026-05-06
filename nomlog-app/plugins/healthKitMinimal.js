/**
 * Minimal HealthKit entitlements + usage strings for Nomlog (no `healthkit.access` key).
 * Replaces the `react-native-health` Expo plugin for App Store compatibility.
 */
const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

const HEALTH_SHARE = 'Allow $(PRODUCT_NAME) to check health info';
const HEALTH_UPDATE = 'Allow $(PRODUCT_NAME) to update health info';

module.exports = function healthKitMinimal(
  config,
  { healthSharePermission, healthUpdatePermission } = {}
) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSHealthShareUsageDescription =
      healthSharePermission || c.modResults.NSHealthShareUsageDescription || HEALTH_SHARE;
    c.modResults.NSHealthUpdateUsageDescription =
      healthUpdatePermission || c.modResults.NSHealthUpdateUsageDescription || HEALTH_UPDATE;
    delete c.modResults.NSHealthClinicalHealthRecordsShareUsageDescription;
    return c;
  });

  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.healthkit'] = true;
    delete c.modResults['com.apple.developer.healthkit.access'];
    return c;
  });

  return config;
};
