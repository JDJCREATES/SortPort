import { z } from 'zod';

// Base API response structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Sorting request schemas
export const SortRequestSchema = z.object({
  query: z.string().min(1).max(500),
  userId: z.string().uuid(),
  imageIds: z.array(z.string().uuid()).optional(),
  albumId: z.string().optional(),
  sortType: z.enum(['tone', 'scene', 'custom', 'thumbnail', 'smart_album']).default('custom'),
  useVision: z.boolean().default(false),
  maxResults: z.number().min(1).max(1000).default(100)
});

export type SortRequest = z.infer<typeof SortRequestSchema>;

// Sort response
export interface SortResponse {
  sortedImages: SortedImage[];
  reasoning: string;
  confidence: number;
  usedVision: boolean;
  processingTime: number;
  cost: {
    credits: number;
    breakdown: {
      embedding: number;
      vision: number;
      processing: number;
    };
  };
}

// Image with sort metadata
export interface SortedImage {
  id: string;
  originalPath: string;
  virtualName: string | null;
  sortScore: number;
  reasoning: string;
  position: number;
  metadata?: {
    tone?: string;
    scene?: string;
    features?: string[];
  };
}

// Atlas generation schemas
export const AtlasRequestSchema = z.object({
  userId: z.string().uuid(),
  imageIds: z.array(z.string().uuid()).min(1).max(9),
  purpose: z.enum(['sorting', 'thumbnail', 'analysis']),
  cacheKey: z.string().optional()
});

export type AtlasRequest = z.infer<typeof AtlasRequestSchema>;

export interface AtlasResponse {
  atlasUrl: string;
  imageMap: AtlasImageMap;
  cacheKey: string;
  expiresAt: string;
}

export interface AtlasImageMap {
  [position: string]: {
    imageId: string;
    originalPath: string;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

// Error types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, public details?: any) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'AUTH_ERROR');
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(429, message, 'RATE_LIMIT_ERROR');
  }
}

// User context from auth middleware
export interface AuthenticatedUser {
  id: string;
  email?: string;
  credits: number;
  tier: 'free' | 'pro' | 'enterprise';
  lastActive?: Date;
  sessionId?: string;
  preferences?: Record<string, any>;
  subscriptionStatus?: string;
  rateLimitTier?: string;
}

// Request context
export interface RequestContext {
  user: AuthenticatedUser;
  requestId: string;
  startTime: number;
  userAgent?: string;
  ip?: string;
  metadata?: Record<string, any>;
}
