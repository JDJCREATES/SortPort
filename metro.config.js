// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add resolver configuration to fix react-native-svg web bundling issue
config.resolver = {
  ...config.resolver,
  alias: {
    ...config.resolver?.alias,
    'react-native-svg': path.resolve(__dirname, 'node_modules/react-native-svg/lib/module/web'),
  },
};

module.exports = config;