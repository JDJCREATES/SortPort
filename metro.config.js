const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Remove any react-native-svg specific configurations
// Keep only standard Expo configuration
config.resolver.platforms = ['native', 'web', 'ios', 'android'];

module.exports = config;