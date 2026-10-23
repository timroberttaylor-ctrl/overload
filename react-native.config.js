/**
 * Apple Health is iOS only: keep its native module out of Android builds.
 * (The JS side already reports "unavailable" on Android.)
 */
module.exports = {
  dependencies: {
    '@kingstinct/react-native-healthkit': { platforms: { android: null } },
  },
};
