import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../types/api.js';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class MemoryRateLimitStore {
  private store: RateLimitStore = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      Object.keys(this.store).forEach(key => {
        if (this.store[key].resetTime <= now) {
          delete this.store[key];
        }
      });
    }, 5 * 60 * 1000);
  }

  get(key: string): { count: number; resetTime: number } | undefined {
    return this.store[key];
  }

  set(key: string, value: { count: number; resetTime: number }): void {
    this.store[key] = value;
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = this.store[key];

    if (!existing || existing.resetTime <= now) {
      // Create new or reset expired
      this.store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
    } else {
      // Increment existing
      this.store[key].count++;
    }

    return this.store[key];
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store = {};
  }
}

const store = new MemoryRateLimitStore();

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const current = store.increment(key, windowMs);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, maxRequests - current.count).toString(),
      'X-RateLimit-Reset': new Date(current.resetTime).toISOString()
    });

    if (current.count > maxRequests) {
      throw new RateLimitError(`Too many requests. Limit: ${maxRequests} per ${windowMs}ms`);
    }

    // Track response to potentially skip counting
    if (skipSuccessfulRequests || skipFailedRequests) {
      const originalSend = res.send;
      res.send = function(data) {
        const shouldSkip = 
          (skipSuccessfulRequests && res.statusCode < 400) ||
          (skipFailedRequests && res.statusCode >= 400);

        if (shouldSkip && current.count > 0) {
          // Decrement count for skipped requests
          store.set(key, {
            count: current.count - 1,
            resetTime: current.resetTime
          });
        }

        return originalSend.call(this, data);
      };
    }

    next();
  };
}

// Default rate limiter for the application
export const rateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: true // Don't count failed requests against limit
});

// Strict rate limiter for expensive operations
export const strictRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `strict:user:${userId}` : `strict:ip:${req.ip}`;
  }
});

// Vision API rate limiter (very strict)
export const visionRateLimiter = createRateLimiter({
  windowMs: 300000, // 5 minutes
  maxRequests: 5,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `vision:user:${userId}` : `vision:ip:${req.ip}`;
  }
});

// Cleanup on process exit
process.on('SIGTERM', () => store.destroy());
process.on('SIGINT', () => store.destroy());
