import { Request, Response, NextFunction } from 'express';
import { ApiError, ApiResponse } from '../types/api';
import { ZodError } from 'zod';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string || 
                   Math.random().toString(36).substring(7);

  // Log error (in production, use proper logging service)
  console.error(`[${requestId}] Error:`, {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    url: req.url,
    method: req.method,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';

  // Handle different error types
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code || 'API_ERROR';
  } else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
    
    // Include validation details in development
    if (process.env.NODE_ENV === 'development') {
      message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    }
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Authentication failed';
    code = 'AUTH_ERROR';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    code = 'INVALID_ID';
  }

  // Don't expose internal errors in production
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Something went wrong';
  }

  const response: ApiResponse = {
    success: false,
    error: message,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: '1.0.0'
    }
  };

  // Add error code for non-500 errors
  if (statusCode !== 500) {
    (response as any).code = code;
  }

  // Add validation details in development
  if (error instanceof ZodError && process.env.NODE_ENV === 'development') {
    (response as any).validationErrors = error.errors;
  }

  res.status(statusCode).json(response);
}

// Async error wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler
export function notFoundHandler(req: Request, res: Response) {
  const response: ApiResponse = {
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substring(7),
      version: '1.0.0'
    }
  };

  res.status(404).json(response);
}
