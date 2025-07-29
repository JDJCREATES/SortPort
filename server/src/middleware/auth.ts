import { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../types/api';
import { AuthenticatedUser, RequestContext } from '../types/api';
import { supabaseService } from '../lib/supabase/client';
import Redis from 'ioredis';

// Extend Request interface to include user and context
declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
      context: RequestContext;
    }
  }
}

// Configuration
interface AuthConfig {
  tokenCacheTTL: number;
  maxConcurrentSessions: number;
  enableTokenBlacklist: boolean;
  enableRateLimiting: boolean;
  sessionTimeout: number;
}

const authConfig: AuthConfig = {
  tokenCacheTTL: parseInt(process.env.TOKEN_CACHE_TTL || '300'), // 5 minutes
  maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5'),
  enableTokenBlacklist: process.env.ENABLE_TOKEN_BLACKLIST === 'true',
  enableRateLimiting: process.env.ENABLE_AUTH_RATE_LIMITING === 'true',
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400') // 24 hours
};

// Redis client for caching and session management
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

// Token validation cache
const tokenCache = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();

// Service class for authentication logic
class AuthService {
  private static instance: AuthService;
  
  private constructor() {}
  
  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    // Check cache first
    const cached = await this.getCachedToken(token);
    if (cached) {
      return cached;
    }

    // Check token blacklist
    if (authConfig.enableTokenBlacklist && await this.isTokenBlacklisted(token)) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify with Supabase
    const { data: { user }, error } = await supabaseService.auth.getUser(token);
    
    if (error || !user) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Get user profile with enhanced data
    const profile = await this.getUserProfile(user.id);
    
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email || profile?.email || '',
      credits: profile?.credits || 0,
      tier: profile?.tier || 'free',
      lastActive: new Date(),
      sessionId: this.generateSessionId()
    };

    // Cache the token
    await this.cacheToken(token, authenticatedUser);
    
    // Track session
    await this.trackSession(authenticatedUser);

    return authenticatedUser;
  }

  async getUserProfile(userId: string) {
    try {
      const { data: profile, error } = await supabaseService
        .from('user_profiles')
        .select('credits, tier, email, preferences, subscription_status, rate_limit_tier')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is OK
        console.warn(`Profile query error for user ${userId}:`, error);
      }

      return profile;
    } catch (error) {
      console.warn(`Failed to get profile for user ${userId}:`, error);
      return null;
    }
  }

  private async getCachedToken(token: string): Promise<AuthenticatedUser | null> {
    // Try Redis first
    if (redis) {
      try {
        const cached = await redis.get(`auth:token:${token}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.warn('Redis cache read error:', error);
      }
    }

    // Fallback to in-memory cache
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    return null;
  }

  private async cacheToken(token: string, user: AuthenticatedUser): Promise<void> {
    const expiresAt = Date.now() + (authConfig.tokenCacheTTL * 1000);
    
    // Cache in Redis
    if (redis) {
      try {
        await redis.setex(
          `auth:token:${token}`,
          authConfig.tokenCacheTTL,
          JSON.stringify(user)
        );
      } catch (error) {
        console.warn('Redis cache write error:', error);
      }
    }

    // Cache in memory as backup
    tokenCache.set(token, { user, expiresAt });
  }

  private async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!redis) return false;
    
    try {
      const blacklisted = await redis.exists(`auth:blacklist:${token}`);
      return blacklisted === 1;
    } catch (error) {
      console.warn('Blacklist check error:', error);
      return false;
    }
  }

  private async trackSession(user: AuthenticatedUser): Promise<void> {
    if (!redis) return;

    try {
      const sessionKey = `auth:sessions:${user.id}`;
      const sessionData = {
        sessionId: user.sessionId,
        lastActive: user.lastActive?.toISOString(),
        userAgent: '', // Will be set by middleware
        ip: '' // Will be set by middleware
      };

      // Store session with timeout
      await redis.setex(
        `${sessionKey}:${user.sessionId}`,
        authConfig.sessionTimeout,
        JSON.stringify(sessionData)
      );

      // Clean up old sessions if over limit
      await this.cleanupSessions(user.id);
    } catch (error) {
      console.warn('Session tracking error:', error);
    }
  }

  private async cleanupSessions(userId: string): Promise<void> {
    if (!redis) return;

    try {
      const sessionPattern = `auth:sessions:${userId}:*`;
      const sessions = await redis.keys(sessionPattern);
      
      if (sessions.length > authConfig.maxConcurrentSessions) {
        // Remove oldest sessions
        const sessionsToRemove = sessions.slice(0, sessions.length - authConfig.maxConcurrentSessions);
        if (sessionsToRemove.length > 0) {
          await redis.del(...sessionsToRemove);
        }
      }
    } catch (error) {
      console.warn('Session cleanup error:', error);
    }
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  async revokeToken(token: string): Promise<void> {
    if (!redis) return;

    try {
      // Add to blacklist
      await redis.setex(
        `auth:blacklist:${token}`,
        authConfig.tokenCacheTTL,
        '1'
      );

      // Remove from cache
      await redis.del(`auth:token:${token}`);
      tokenCache.delete(token);
    } catch (error) {
      console.warn('Token revocation error:', error);
    }
  }

  async updateUserCredits(userId: string, creditChange: number): Promise<void> {
    try {
      const { error } = await supabaseService
        .rpc('update_user_credits', {
          user_id: userId,
          credit_change: creditChange
        });

      if (error) {
        throw error;
      }

      // Invalidate cached user data
      if (redis) {
        const pattern = `auth:token:*`;
        const keys = await redis.keys(pattern);
        for (const key of keys) {
          const cached = await redis.get(key);
          if (cached) {
            const userData = JSON.parse(cached);
            if (userData.id === userId) {
              await redis.del(key);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error updating user credits:', error);
      throw error;
    }
  }
}

const authService = AuthService.getInstance();

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization header missing or invalid');
    }

    const token = authHeader.substring(7);
    
    // Use auth service for validation
    const authenticatedUser = await authService.validateToken(token);
    
    // Enhance with request-specific data
    authenticatedUser.lastActive = new Date();
    
    // Create request context
    const requestContext: RequestContext = {
      user: authenticatedUser,
      requestId: generateRequestId(),
      startTime: Date.now(),
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip || req.connection.remoteAddress || ''
    };

    // Attach to request
    req.user = authenticatedUser;
    req.context = requestContext;

    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestContext.requestId);

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
    } else {
      next(new AuthenticationError('Authentication failed'));
    }
  }
}

// Optional auth middleware (doesn't throw if no auth provided)
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      // No auth provided, continue without user context
      req.context = {
        user: null as any,
        requestId: generateRequestId(),
        startTime: Date.now(),
        userAgent: req.headers['user-agent'] || '',
        ip: req.ip || req.connection.remoteAddress || ''
      };
      res.setHeader('X-Request-ID', req.context.requestId);
      return next();
    }

    // If auth is provided, validate it
    await authMiddleware(req, res, next);
  } catch (error) {
    // For optional auth, continue without user context on auth failure
    req.context = {
      user: null as any,
      requestId: generateRequestId(),
      startTime: Date.now(),
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip || req.connection.remoteAddress || ''
    };
    res.setHeader('X-Request-ID', req.context.requestId);
    next();
  }
}

// Admin-only middleware
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    throw new AuthenticationError('Authentication required');
  }

  if (req.user.tier !== 'enterprise') {
    throw new AuthenticationError('Admin privileges required');
  }

  next();
}

// Credit check middleware with enhanced validation
export function requireCredits(minCredits: number = 1) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    // Get fresh credit balance for critical operations
    if (minCredits > 5) {
      try {
        const profile = await authService.getUserProfile(req.user.id);
        if (profile) {
          req.user.credits = profile.credits;
        }
      } catch (error) {
        console.warn('Failed to refresh credit balance:', error);
      }
    }

    if (req.user.credits < minCredits) {
      const error = new AuthenticationError(
        `Insufficient credits. Required: ${minCredits}, Available: ${req.user.credits}`
      );
      error.statusCode = 402; // Payment Required
      throw error;
    }

    next();
  };
}

// Enhanced middleware to update user credits after successful operations
export function updateCreditsMiddleware(creditCost: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;
    
    let responseSent = false;
    
    const handleSuccess = async () => {
      if (responseSent) return;
      responseSent = true;
      
      // Only deduct credits on successful responses (200-299)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        try {
          await authService.updateUserCredits(req.user.id, -creditCost);
          // Update local user object
          req.user.credits = Math.max(0, req.user.credits - creditCost);
        } catch (error) {
          console.error('Failed to update user credits:', error);
          // Don't fail the request, but log the error
        }
      }
    };
    
    // Override response methods
    res.send = function(data) {
      handleSuccess();
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      handleSuccess();
      return originalJson.call(this, data);
    };

    next();
  };
}

// Rate limiting based on user tier
export function tierBasedRateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    // Rate limits based on tier (requests per minute)
    const rateLimits = {
      free: 10,
      pro: 60,
      enterprise: 300
    };

    const userLimit = rateLimits[req.user.tier] || rateLimits.free;
    
    // This would integrate with a rate limiting service like Redis
    // For now, we'll pass the limit in headers for monitoring
    res.setHeader('X-RateLimit-Tier', req.user.tier);
    res.setHeader('X-RateLimit-Limit', userLimit.toString());
    
    next();
  };
}

// Session management middleware
export function requireActiveSession() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.sessionId) {
      throw new AuthenticationError('Active session required');
    }

    // Validate session is still active
    if (redis) {
      try {
        const sessionExists = await redis.exists(
          `auth:sessions:${req.user.id}:${req.user.sessionId}`
        );
        
        if (!sessionExists) {
          throw new AuthenticationError('Session expired or invalid');
        }
        
        // Extend session
        await redis.expire(
          `auth:sessions:${req.user.id}:${req.user.sessionId}`,
          authConfig.sessionTimeout
        );
      } catch (error) {
        console.warn('Session validation error:', error);
      }
    }

    next();
  };
}

// Utility functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export { authService };

// Service Authentication Middleware - for Edge Function to LCEL server communication
export const serviceAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Service authorization required',
        code: 'SERVICE_AUTH_REQUIRED'
      });
    }
    
    const token = authHeader.substring(7);
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceRoleKey || token !== serviceRoleKey) {
      return res.status(403).json({
        success: false,
        error: 'Invalid service authorization',
        code: 'SERVICE_AUTH_INVALID'
      });
    }
    
    // For service requests, create a mock user context from headers
    const userId = req.headers['x-user-id'] as string;
    const jobId = req.headers['x-job-id'] as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'X-User-ID header required for service requests',
        code: 'SERVICE_USER_ID_REQUIRED'
      });
    }
    
    // Create service user context
    req.user = {
      id: userId,
      email: `service+${userId}@internal.system`,
      credits: 999999, // Service requests have unlimited credits
      tier: 'enterprise' as const,
      sessionId: jobId || `service-${Date.now()}`,
      lastActive: new Date(),
      subscriptionStatus: 'active',
      rateLimitTier: 'unlimited'
    };
    
    req.context = {
      user: req.user, // Add user reference
      requestId: generateRequestId(),
      startTime: Date.now(),
      userAgent: req.headers['user-agent'] || 'Service/1.0',
      ip: '127.0.0.1', // Internal service IP
      metadata: {
        service: true, // Mark as service request
        jobId
      }
    };
    
    console.log(`🔧 Service auth successful for user ${userId}, job ${jobId}`);
    next();
    
  } catch (error) {
    console.error('Service auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Service authentication error',
      code: 'SERVICE_AUTH_ERROR'
    });
  }
};

// Legacy support for existing code
export async function updateUserCredits(userId: string, creditChange: number): Promise<void> {
  return authService.updateUserCredits(userId, creditChange);
}
