/**
 * SortxPort Splash Screen Configuration
 * 
 * This file contains all the configurable options for the splash screen.
 * You can easily customize images, colors, timing, and other properties here.
 */

// Image configuration - Replace these paths with your custom images
export const SPLASH_IMAGES = {
  // Card images - these will appear in the floating polaroid cards
  capture: require('../assets/images/icon.png'), // 📸 Capture card image
  organize: require('../assets/images/icon.png'), // 🖼️ Organize card image  
  sort: require('../assets/images/icon.png'), // 📂 Sort card image (using main app icon)
  transform: require('../assets/images/icon.png'), // ✨ Transform card image
  
  // You can replace with custom images like:
  // capture: require('../assets/images/camera-photo.jpg'),
  // organize: require('../assets/images/gallery-photo.jpg'), 
  // sort: require('../assets/images/folders-photo.jpg'),
  // transform: require('../assets/images/magic-photo.jpg'),
};

// Color scheme configuration
export const SPLASH_COLORS = {
  // Background gradient colors (dark theme)
  background: ['#000000', '#1f2937', '#374151'] as const,
  
  // Card styling
  cardBackground: '#ffffff',
  cardBorder: '#e5e7eb',
  
  // Text colors
  textPrimary: '#ffffff',      // Main "SortxPort" text
  textSecondary: '#d1d5db',    // Subtitle text
  cardTextPrimary: '#1f2937',  // Card title text
  cardTextSecondary: '#6b7280', // Card subtitle text
  
  // Accent color for the "x" in "SortxPort"
  accent: '#f3f4f6',
  
  // Floating elements
  floatingElements: '#f3f4f6',
  
  // For light theme alternative, uncomment:
  // background: ['#ffffff', '#f9fafb', '#f3f4f6'] as const,
  // textPrimary: '#1f2937',
  // textSecondary: '#6b7280',
  // accent: '#3b82f6',
};

// Animation timing configuration (in milliseconds)
export const SPLASH_TIMING = {
  // Total splash screen duration
  totalDuration: 8000,
  
  // Individual animation timing
  backgroundFadeIn: 1000,
  textAnimationDelay: 1000,
  textCharacterStagger: 100, // Delay between each letter animation
  
  // Card animations
  cardAnimationDurations: {
    capture: 15000,
    organize: 17000, 
    sort: 19000,
    transform: 16000,
  },
  
  cardAnimationDelays: {
    capture: 0,
    organize: 2000,
    sort: 4000, 
    transform: 1000,
  },
  
  // Floating elements
  floatingElementDelays: [500, 1000, 1500, 2000, 2500, 3000],
  floatingElementDuration: 2000,
};

// Layout configuration
export const SPLASH_LAYOUT = {
  // Card dimensions
  cardWidth: 160,
  cardHeight: 192,
  cardImageHeight: 128,
  cardBorderRadius: 12,
  
  // Text sizing
  textSize: {
    large: 72,  // For screens > 400px width
    small: 60,  // For smaller screens
  },
  
  // Floating element positions (percentages)
  floatingElements: [
    { leftPercent: 25, topPercent: 25, size: 12 },
    { leftPercent: 75, topPercent: 33, size: 8 },
    { leftPercent: 17, topPercent: 50, size: 10 },
    { leftPercent: 83, topPercent: 25, size: 8 },
    { leftPercent: 75, topPercent: 75, size: 12 },
    { leftPercent: 33, topPercent: 17, size: 6 },
  ],
};

// Card content configuration
export const SPLASH_CONTENT = {
  cards: [
    {
      key: 'capture',
      title: '📸 Capture',
      subtitle: 'Every precious moment',
      initialRotation: -8,
    },
    {
      key: 'organize', 
      title: '🖼️ Organize',
      subtitle: 'With elegant ease',
      initialRotation: 10,
    },
    {
      key: 'sort',
      title: '📂 Sort', 
      subtitle: 'Intelligently perfect',
      initialRotation: 4,
    },
    {
      key: 'transform',
      title: '✨ Transform',
      subtitle: 'Pure digital magic', 
      initialRotation: -14,
    },
  ],
  
  // Main text
  mainText: 'SortxPort',
  accentCharacter: 'x', // Which character gets special styling
};

// Performance configuration
export const SPLASH_PERFORMANCE = {
  // Reduce animations on lower-end devices
  enableHighPerformanceMode: true,
  
  // Shadow and blur settings
  enableShadows: true,
  enableBlur: false, // Disable blur for better performance
  
  // Animation frame rate
  useNativeDriver: true,
};

// Combined configuration object
export const SPLASH_CONFIG = {
  images: SPLASH_IMAGES,
  colors: SPLASH_COLORS,
  timing: SPLASH_TIMING,
  layout: SPLASH_LAYOUT,
  content: SPLASH_CONTENT,
  performance: SPLASH_PERFORMANCE,
};

export default SPLASH_CONFIG;
