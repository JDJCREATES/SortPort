  import { Platform } from 'react-native';

let OptimizedImageComponent;

if (Platform.OS === 'web') {
  OptimizedImageComponent = require('../OptimizedImage.native').OptimizedImage;
} else {
  OptimizedImageComponent = require('../OptimizedImage.native').OptimizedImage;
}

export const OptimizedImage = OptimizedImageComponent;