/**
 * Configuration Manager
 * 
 * Centralized configuration for the SortxPort application.
 * Handles environment variables, API endpoints, and feature flags.
 */

// Environment Detection
const isDevelopment = __DEV__;
const isWeb = typeof window !== 'undefined';
const isAndroidEmulator = !isWeb && isDevelopment;

// LCEL Server Configuration
export const LCEL_CONFIG = {
  // Server URL - use environment variable or fallback based on platform
  // For USB debugging on Android: use your computer's IP address
  // For iOS simulator: use localhost
  // For Android emulator: use 10.0.2.2
  SERVER_URL: process.env.EXPO_PUBLIC_LCEL_SERVER_URL || 
    (isDevelopment ? 
      'http://localhost:3001' : // Change this to your computer's IP for USB debugging
      'https://your-production-server.com'),
  
  // API Endpoints
  ENDPOINTS: {
    SORT: '/api/lcel/sort',
    TEST: '/api/lcel/test',
    STATUS: '/api/lcel/status',
    HEALTH: '/api/lcel/health'
  },
  
  // Request Configuration
  TIMEOUT: 60000, // 60 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second base delay
  
  // Rate Limiting
  MAX_IMAGES_PER_REQUEST: 100,
  MAX_QUERY_LENGTH: 500,
  
  // Feature Flags
  FEATURES: {
    VISION_ANALYSIS: true,
    RETRY_ON_FAILURE: true,
    PROGRESS_TRACKING: true,
    COST_ESTIMATION: true
  }
};

// Supabase Configuration
export const SUPABASE_CONFIG = {
  // Edge Functions
  FUNCTIONS: {
    SORT_BY_LANGUAGE: 'sort-by-language',
    ATLAS_GENERATOR: 'atlas-generator',
    BULK_NSFW_ANALYZE: 'bulk-nsfw-analyze'
  }
};

// Credit System Configuration
export const CREDIT_CONFIG = {
  COSTS: {
    BASIC_SORT: 1,
    VISION_SORT: 3,
    SMART_ALBUM: 2,
    THUMBNAIL_SELECTION: 2,
    AUTO_SORT: 5
  },
  
  // Cost multipliers based on image count
  VOLUME_MULTIPLIERS: {
    SMALL: { threshold: 10, multiplier: 1.0 },
    MEDIUM: { threshold: 50, multiplier: 1.2 },
    LARGE: { threshold: 100, multiplier: 1.5 }
  }
};

// Performance Configuration
export const PERFORMANCE_CONFIG = {
  // Image processing
  MAX_CONCURRENT_REQUESTS: isWeb ? 6 : 4,
  IMAGE_CACHE_SIZE: 100,
  THUMBNAIL_CACHE_SIZE: 500,
  
  // Network
  CONNECTION_TIMEOUT: 30000,
  READ_TIMEOUT: 60000,
  
  // Memory management
  MAX_MEMORY_USAGE: isWeb ? 512 : 256, // MB
  GARBAGE_COLLECTION_INTERVAL: 300000 // 5 minutes
};

// Debug Configuration
export const DEBUG_CONFIG = {
  ENABLED: isDevelopment,
  LOG_LEVEL: isDevelopment ? 'debug' : 'error',
  LOG_API_CALLS: isDevelopment,
  LOG_PERFORMANCE: isDevelopment,
  SHOW_PROGRESS_DETAILS: isDevelopment
};

// Export combined configuration
export const CONFIG = {
  LCEL: LCEL_CONFIG,
  SUPABASE: SUPABASE_CONFIG,
  CREDIT: CREDIT_CONFIG,
  PERFORMANCE: PERFORMANCE_CONFIG,
  DEBUG: DEBUG_CONFIG,
  
  // Environment flags
  IS_DEVELOPMENT: isDevelopment,
  IS_WEB: isWeb,
  
  // Version info
  VERSION: '1.0.0',
  BUILD_DATE: new Date().toISOString()
};

// Configuration validation
export function validateConfiguration(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check LCEL server URL
  if (!LCEL_CONFIG.SERVER_URL) {
    errors.push('LCEL server URL is not configured');
  }
  
  // Validate URL format
  try {
    new URL(LCEL_CONFIG.SERVER_URL);
  } catch {
    errors.push('LCEL server URL is not a valid URL');
  }
  
  // Check timeout values
  if (LCEL_CONFIG.TIMEOUT < 1000) {
    errors.push('LCEL timeout is too low (minimum 1000ms)');
  }
  
  // Check retry limits
  if (LCEL_CONFIG.MAX_RETRIES < 1 || LCEL_CONFIG.MAX_RETRIES > 5) {
    errors.push('LCEL max retries should be between 1 and 5');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Environment-specific overrides
if (isDevelopment) {
  // Development overrides
  LCEL_CONFIG.FEATURES.PROGRESS_TRACKING = true;
  DEBUG_CONFIG.LOG_API_CALLS = true;
} else {
  // Production overrides
  DEBUG_CONFIG.ENABLED = false;
  DEBUG_CONFIG.LOG_LEVEL = 'error';
}

export default CONFIG;
