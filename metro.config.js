const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable web support
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Add platform-specific extensions
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'jsx',
  'js',
  'ts',
  'tsx',
  'json',
  'wasm',
  'svg'
];

// Platform-specific file extensions
config.resolver.platformSourceExts = {
  ios: ['ios.tsx', 'ios.ts', 'ios.jsx', 'ios.js', 'native.tsx', 'native.ts', 'native.jsx', 'native.js'],
  android: ['android.tsx', 'android.ts', 'android.jsx', 'android.js', 'native.tsx', 'native.ts', 'native.jsx', 'native.js'],
  web: ['web.tsx', 'web.ts', 'web.jsx', 'web.js'],
  native: ['native.tsx', 'native.ts', 'native.jsx', 'native.js']
};

// Asset extensions
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'mp4',
  'webm',
  'wav',
  'mp3',
  'aac',
  'm4a',
  'pdf',
  'zip',
  'ttf',
  'otf',
  'woff',
  'woff2'
];

// Transformer options for better performance
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    mangle: {
      keep_fnames: true,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
      wrap_iife: true,
    },
    sourceMap: {
      includeSources: false,
    },
    toplevel: false,
    compress: {
      reduce_funcs: false,
    },
  },
  unstable_allowRequireContext: true,
};

// Resolver configuration for better module resolution
config.resolver.alias = {
  ...config.resolver.alias,
  '@': __dirname,
  '@components': __dirname + '/components',
  '@utils': __dirname + '/utils',
  '@types': __dirname + '/types',
  '@contexts': __dirname + '/contexts',
  '@hooks': __dirname + '/hooks',
};

// Handle node modules that need special treatment
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Web-specific configuration
if (process.env.EXPO_PLATFORM === 'web') {
  config.resolver.alias = {
    ...config.resolver.alias,
    'react-native$': 'react-native-web',
    'crypto': 'crypto-browserify',
    'stream': 'stream-browserify',
    'buffer': 'buffer',
    'uuid': require.resolve('./utils/uuid-web-polyfill.js'),
  };
}

module.exports = config;