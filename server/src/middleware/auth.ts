import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthenticationError } from '../types/api';
import { AuthenticatedUser, RequestContext } from '../types/api';

// Extend Request interface to include user and context
declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
      context: RequestContext;
    }
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    
    // Verify JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Get user profile with credits and tier info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('credits, tier, email')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn(`Profile not found for user ${user.id}:`, profileError);
      // Create basic user context even if profile is missing
    }

    // Create authenticated user context
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email || profile?.email,
      credits: profile?.credits || 0,
      tier: profile?.tier || 'free'
    };

    // Create request context
    const requestContext: RequestContext = {
      user: authenticatedUser,
      requestId: generateRequestId(),
      startTime: Date.now()
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
        startTime: Date.now()
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
      startTime: Date.now()
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

// Credit check middleware
export function requireCredits(minCredits: number = 1) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (req.user.credits < minCredits) {
      const error = new AuthenticationError(`Insufficient credits. Required: ${minCredits}, Available: ${req.user.credits}`);
      error.statusCode = 402; // Payment Required
      throw error;
    }

    next();
  };
}

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Middleware to update user credits after successful operations
export function updateCreditsMiddleware(creditCost: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original send method
    const originalSend = res.send;
    
    // Override send to update credits on successful response
    res.send = function(data) {
      // Only deduct credits on successful responses (200-299)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        // Update credits in background (don't block response)
        updateUserCredits(req.user.id, -creditCost).catch(error => {
          console.error('Failed to update user credits:', error);
        });
      }
      
      return originalSend.call(this, data);
    };

    next();
  };
}

// Helper function to update user credits
async function updateUserCredits(userId: string, creditChange: number): Promise<void> {
  const { error } = await supabase
    .rpc('update_user_credits', {
      user_id: userId,
      credit_change: creditChange
    });

  if (error) {
    console.error('Error updating user credits:', error);
    throw error;
  }
}
