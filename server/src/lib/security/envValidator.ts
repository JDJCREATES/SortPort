/**
 * Environment Variable Validation and Security Configuration
 * 
 * Validates all required environment variables at startup and provides
 * secure configuration management for the SortxPort server.
 */

interface RequiredEnvVars {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_API_KEY: string;
  NODE_ENV: 'development' | 'production' | 'test';
}

interface OptionalEnvVars {
  PORT?: string;
  REDIS_URL?: string;
  TOKEN_CACHE_TTL?: string;
  MAX_CONCURRENT_SESSIONS?: string;
  ENABLE_TOKEN_BLACKLIST?: string;
  ENABLE_AUTH_RATE_LIMITING?: string;
  SESSION_TIMEOUT?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
}

interface SecurityConfig {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  server: {
    port: number;
    host: string;
  };
  database: {
    url: string;
    serviceKey: string;
    anonKey: string;
  };
  external: {
    openaiApiKey: string;
    redisUrl?: string;
  };
  auth: {
    tokenCacheTTL: number;
    maxConcurrentSessions: number;
    enableTokenBlacklist: boolean;
    enableRateLimiting: boolean;
    sessionTimeout: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

class EnvironmentValidator {
  private static instance: EnvironmentValidator;
  private config: SecurityConfig | null = null;

  private constructor() {}

  static getInstance(): EnvironmentValidator {
    if (!EnvironmentValidator.instance) {
      EnvironmentValidator.instance = new EnvironmentValidator();
    }
    return EnvironmentValidator.instance;
  }

  /**
   * Validate all environment variables and return secure configuration
   */
  validateAndGetConfig(): SecurityConfig {
    if (this.config) {
      return this.config;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required environment variables
    const requiredVars: (keyof RequiredEnvVars)[] = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY', 
      'SUPABASE_ANON_KEY',
      'OPENAI_API_KEY',
      'NODE_ENV'
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Validate NODE_ENV
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
      errors.push(`Invalid NODE_ENV: ${nodeEnv}. Must be 'development', 'production', or 'test'`);
    }

    // Validate URL formats
    if (process.env.SUPABASE_URL && !this.isValidUrl(process.env.SUPABASE_URL)) {
      errors.push('SUPABASE_URL is not a valid URL');
    }

    if (process.env.REDIS_URL && !this.isValidUrl(process.env.REDIS_URL)) {
      errors.push('REDIS_URL is not a valid URL');
    }

    // Validate API key formats
    if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-')) {
      warnings.push('OPENAI_API_KEY does not have expected format (should start with "sk-")');
    }

    // Check for development-only settings in production
    if (nodeEnv === 'production') {
      if (!process.env.REDIS_URL) {
        warnings.push('REDIS_URL not set in production - using in-memory cache (not recommended)');
      }
      
      if (process.env.ENABLE_TOKEN_BLACKLIST !== 'true') {
        warnings.push('Token blacklisting not enabled in production');
      }
    }

    // Throw errors if any critical issues found
    if (errors.length > 0) {
      throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
    }

    // Log warnings
    if (warnings.length > 0) {
      console.warn('Environment validation warnings:');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    // Build configuration
    this.config = this.buildConfig();
    return this.config;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private buildConfig(): SecurityConfig {
    const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
    
    return {
      isProduction: nodeEnv === 'production',
      isDevelopment: nodeEnv === 'development',
      isTest: nodeEnv === 'test',
      
      server: {
        port: parseInt(process.env.PORT || '3001'),
        host: process.env.HOST || 'localhost'
      },
      
      database: {
        url: process.env.SUPABASE_URL!,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        anonKey: process.env.SUPABASE_ANON_KEY!
      },
      
      external: {
        openaiApiKey: process.env.OPENAI_API_KEY!,
        redisUrl: process.env.REDIS_URL
      },
      
      auth: {
        tokenCacheTTL: parseInt(process.env.TOKEN_CACHE_TTL || '300'),
        maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5'),
        enableTokenBlacklist: process.env.ENABLE_TOKEN_BLACKLIST === 'true',
        enableRateLimiting: process.env.ENABLE_AUTH_RATE_LIMITING === 'true',
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400')
      },
      
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
      }
    };
  }

  /**
   * Get configuration safely (validates first if needed)
   */
  getConfig(): SecurityConfig {
    return this.config || this.validateAndGetConfig();
  }

  /**
   * Check if we're in a secure production environment
   */
  isSecureProduction(): boolean {
    const config = this.getConfig();
    return config.isProduction && 
           config.external.redisUrl !== undefined &&
           config.auth.enableTokenBlacklist;
  }
}

export const envValidator = EnvironmentValidator.getInstance();
export type { SecurityConfig };
