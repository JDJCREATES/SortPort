/**
 * Production-Ready Supabase Edge Function for AWS Rekognition Content Moderation
 * Handles batch image moderation using Amazon Rekognition's DetectModerationLabels API
 * Features: Batch processing, comprehensive error handling, performance monitoring, rate limiting
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { 
  RekognitionClient, 
  DetectModerationLabelsCommand,
  RekognitionServiceException,
  type ModerationLabel as AWSModerationLabel,
  type Instance as AWSInstance
} from "npm:@aws-sdk/client-rekognition@^3.840.0"

// Types
interface ModerationRequest {
  images: Array<{
    image_base64: string;
    image_id: string;
  }>;
  batch_id?: string;
  settings?: ModerationSettings;
}

interface SingleModerationRequest {
  image_base64: string;
  image_id: string;
  settings?: ModerationSettings;
}

interface ModerationSettings {
  confidence_threshold?: number;
  categories?: string[];
  include_all_labels?: boolean;
}

interface ModerationLabel {
  Name: string;
  Confidence: number;
  ParentName?: string;
  Instances?: Array<{
    BoundingBox?: {
      Width: number;
      Height: number;
      Left: number;
      Top: number;
    };
    Confidence: number;
  }>;
}

interface ModerationResult {
  image_id: string;
  is_nsfw: boolean;
  moderation_labels: ModerationLabel[];
  confidence_score: number;
  processing_time_ms: number;
  error?: string;
}

interface BatchModerationResponse {
  batch_id: string;
  total_images: number;
  successful: number;
  failed: number;
  results: ModerationResult[];
  total_processing_time_ms: number;
  rate_limit_info?: {
    remaining_requests: number;
    reset_time: string;
  };
}

interface SingleModerationResponse extends ModerationResult {
  rate_limit_info?: {
    remaining_requests: number;
    reset_time: string;
  };
}

// Configuration
const CONFIG = {
  // AWS Rekognition limits
  MAX_IMAGE_SIZE_MB: 5,
  MAX_BATCH_SIZE: 10, // Conservative batch size for edge functions
  MAX_CONCURRENT_REQUESTS: 5,
  
  // Default moderation settings
  DEFAULT_CONFIDENCE_THRESHOLD: 80,
  MIN_CONFIDENCE_FOR_API: 50,
  
  // Rate limiting (AWS Rekognition default limits)
  RATE_LIMIT_PER_SECOND: 5,
  RATE_LIMIT_BURST: 10,
  
  // Timeouts
  REQUEST_TIMEOUT_MS: 30000,
  BATCH_TIMEOUT_MS: 120000,
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// NSFW Categories (comprehensive list)
const NSFW_CATEGORIES = [
  'Explicit Nudity',
  'Suggestive',
  'Violence',
  'Visually Disturbing',
  'Rude Gestures',
  'Drugs',
  'Tobacco',
  'Alcohol',
  'Gambling',
  'Hate Symbols',
  'Graphic Male Nudity',
  'Graphic Female Nudity',
  'Sexual Activity',
  'Illustrated Explicit Nudity',
  'Adult Toys',
  'Female Swimwear Or Underwear',
  'Male Swimwear Or Underwear',
  'Partial Nudity',
  'Barechested Male',
  'Revealing Clothes',
  'Graphic Violence Or Gore',
  'Physical Violence',
  'Weapon Violence',
  'Weapons',
  'Self Injury',
  'Emaciated Bodies',
  'Corpses',
  'Hanging'
] as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Batch-ID, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const;

// Utility Classes
class RateLimiter {
  private requests: number[] = [];
  
  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove requests older than 1 second
    this.requests = this.requests.filter(time => now - time < 1000);
    
    if (this.requests.length >= CONFIG.RATE_LIMIT_PER_SECOND) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
  
  getRemainingRequests(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 1000);
    return Math.max(0, CONFIG.RATE_LIMIT_PER_SECOND - this.requests.length);
  }
  
  getResetTime(): string {
    if (this.requests.length === 0) return new Date().toISOString();
    const oldestRequest = Math.min(...this.requests);
    return new Date(oldestRequest + 1000).toISOString();
  }
}

class PerformanceMonitor {
  private startTime: number;
  
  constructor() {
    this.startTime = performance.now();
  }
  
  getElapsedMs(): number {
    return Math.round(performance.now() - this.startTime);
  }
  
  static async timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = performance.now();
    const result = await fn();
    const timeMs = Math.round(performance.now() - start);
    return { result, timeMs };
  }
}

class ValidationError extends Error {
  constructor(message: string, public details?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class ConfigurationError extends Error {
  constructor(message: string, public details?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

// Validation Functions
function validateEnvironment(): { client: RekognitionClient; region: string } {
  const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
  const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
  
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new ConfigurationError(
      'AWS credentials not configured',
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required'
    );
  }
  
  // Validate credential format
  if (!AWS_ACCESS_KEY_ID.match(/^AKIA[0-9A-Z]{16}$/)) {
    throw new ConfigurationError(
      'Invalid AWS Access Key ID format',
      'Access Key ID should start with AKIA and be 20 characters long'
    );
  }
  
  if (AWS_SECRET_ACCESS_KEY.length !== 40) {
    throw new ConfigurationError(
      'Invalid AWS Secret Access Key format',
      'Secret Access Key should be 40 characters long'
    );
  }
  
  const client = new RekognitionClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
    maxAttempts: CONFIG.MAX_RETRIES,
    requestHandler: {
      requestTimeout: CONFIG.REQUEST_TIMEOUT_MS,
    },
  });
  
  return { client, region: AWS_REGION };
}

function validateImageData(image_base64: string, image_id: string): Uint8Array {
  if (!image_base64 || typeof image_base64 !== 'string') {
    throw new ValidationError(
      'Invalid image_base64',
      'image_base64 must be a non-empty string'
    );
  }
  
  if (!image_id || typeof image_id !== 'string') {
    throw new ValidationError(
      'Invalid image_id',
      'image_id must be a non-empty string'
    );
  }
  
  // Validate base64 format
  if (!image_base64.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
    throw new ValidationError(
      'Invalid base64 encoding',
      'image_base64 contains invalid characters'
    );
  }
  
  let imageBuffer: Uint8Array;
  try {
    const binaryString = atob(image_base64);
    imageBuffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imageBuffer[i] = binaryString.charCodeAt(i);
    }
  } catch (error) {
    throw new ValidationError(
      'Invalid base64 encoding',
      'Failed to decode base64 string'
    );
  }
  
  // Check image size
  const imageSizeMB = imageBuffer.length / (1024 * 1024);
  if (imageSizeMB > CONFIG.MAX_IMAGE_SIZE_MB) {
    throw new ValidationError(
      'Image too large',
      `Image size (${imageSizeMB.toFixed(2)}MB) exceeds ${CONFIG.MAX_IMAGE_SIZE_MB}MB limit`
    );
  }
  
  // Basic image format validation (check for common image headers)
  const isValidImage = (
    // JPEG
    (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) ||
    // PNG
    (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) ||
    // WebP
    (imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45 && imageBuffer[10] === 0x42 && imageBuffer[11] === 0x50)
  );
  
  if (!isValidImage) {
    throw new ValidationError(
      'Invalid image format',
      'Image must be in JPEG, PNG, or WebP format'
    );
  }
  
  return imageBuffer;
}

function validateBatchRequest(body: any): ModerationRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body', 'Request body must be a valid JSON object');
  }
  
  // Handle both single image and batch requests
  if (body.image_base64 && body.image_id) {
    // Single image request - convert to batch format
    return {
      images: [{
        image_base64: body.image_base64,
        image_id: body.image_id
      }],
      batch_id: body.batch_id || `single_${Date.now()}`,
      settings: body.settings
    };
  }
  
  if (!body.images || !Array.isArray(body.images)) {
    throw new ValidationError('Missing images array', 'Request must contain an images array');
  }
  
  if (body.images.length === 0) {
    throw new ValidationError('Empty images array', 'At least one image is required');
  }
  
  if (body.images.length > CONFIG.MAX_BATCH_SIZE) {
    throw new ValidationError(
      'Batch too large',
      `Maximum batch size is ${CONFIG.MAX_BATCH_SIZE} images`
    );
  }
  
  // Validate each image in the batch
  for (let i = 0; i < body.images.length; i++) {
    const image = body.images[i];
    if (!image.image_base64 || !image.image_id) {
      throw new ValidationError(
        `Invalid image at index ${i}`,
        'Each image must have image_base64 and image_id fields'
      );
    }
  }
  
  return {
    images: body.images,
    batch_id: body.batch_id || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    settings: body.settings || {}
  };
}

// Error handling utilities
function isRetryableError(error: any): boolean {
  if (error instanceof RekognitionServiceException) {
    // Retry on throttling and temporary service errors
    return ['ThrottlingException', 'ServiceUnavailableException', 'InternalServerError'].includes(error.name);
  }
  
  // Retry on network errors
  if (error.name === 'NetworkError' || error.code === 'ECONNRESET') {
    return true;
  }
  
  return false;
}

function getErrorResponse(error: any): { status: number; body: any } {
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: error.message,
        details: error.details,
        type: 'validation_error'
      }
    };
  }
  
  if (error instanceof ConfigurationError) {
    return {
      status: 500,
      body: {
        error: error.message,
        details: error.details,
        type: 'configuration_error'
      }
    };
  }
  
  if (error instanceof RekognitionServiceException) {
    const statusMap: { [key: string]: number } = {
      'InvalidImageFormatException': 400,
      'ImageTooLargeException': 400,
      'InvalidParameterException': 400,
      'AccessDeniedException': 403,
      'UnrecognizedClientException': 401,
      'ThrottlingException': 429,
      'ServiceUnavailableException': 503,
      'InternalServerError': 500,
    };
    
    return {
      status: statusMap[error.name] || 500,
      body: {
        error: error.message,
        details: `AWS Rekognition error: ${error.name}`,
        type: 'aws_error',
        aws_error_code: error.name
      }
    };
  }
  
  // Generic error
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      details: 'An unexpected error occurred while processing your request',
      type: 'internal_error'
    }
  };
}

// Core Processing Functions (continued)
async function processImageWithRetry(
  client: RekognitionClient,
  imageBuffer: Uint8Array,
  imageId: string,
  settings: ModerationSettings,
  retryCount = 0
): Promise<ModerationResult> {
  const monitor = new PerformanceMonitor();
  
  try {
    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: imageBuffer },
      MinConfidence: CONFIG.MIN_CONFIDENCE_FOR_API,
    });
    
    const response = await client.send(command);
    const moderationLabels = response.ModerationLabels || [];
    
    // Process results
    const confidenceThreshold = settings.confidence_threshold || CONFIG.DEFAULT_CONFIDENCE_THRESHOLD;
    const targetCategories = settings.categories || NSFW_CATEGORIES;
    
    let isNsfw = false;
    let maxConfidence = 0;
    
    for (const label of moderationLabels) {
      const confidence = label.Confidence || 0;
      maxConfidence = Math.max(maxConfidence, confidence);
      
      if (confidence >= confidenceThreshold) {
        const labelName = label.Name || '';
        const parentName = label.ParentName || '';
        
        if (targetCategories.some(category => 
          labelName.includes(category) || parentName.includes(category)
        )) {
          isNsfw = true;
          break;
        }
      }
    }
    
    return {
      image_id: imageId,
      is_nsfw: isNsfw,
      moderation_labels: moderationLabels.map((label: AWSModerationLabel) => ({
        Name: label.Name || '',
        Confidence: label.Confidence || 0,
        ParentName: label.ParentName,
        Instances: label.Instances?.map((instance: AWSInstance) => ({
          BoundingBox: instance.BoundingBox ? {
            Width: instance.BoundingBox.Width || 0,
            Height: instance.BoundingBox.Height || 0,
            Left: instance.BoundingBox.Left || 0,
            Top: instance.BoundingBox.Top || 0,
          } : undefined,
          Confidence: instance.Confidence || 0,
        })),
      })),
      confidence_score: maxConfidence,
      processing_time_ms: monitor.getElapsedMs(),
    };
    
  } catch (error) {
    // Handle retryable errors
    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError(error)) {
      console.warn(`⚠️ Retrying image ${imageId} (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES}):`, error);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS * Math.pow(2, retryCount)));
      return processImageWithRetry(client, imageBuffer, imageId, settings, retryCount + 1);
    }
    
    // Non-retryable error or max retries exceeded
    console.error(`❌ Failed to process image ${imageId}:`, error);
    return {
      image_id: imageId,
      is_nsfw: false,
      moderation_labels: [],
      confidence_score: 0,
      processing_time_ms: monitor.getElapsedMs(),
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function processBatch(
  client: RekognitionClient,
  request: ModerationRequest,
  rateLimiter: RateLimiter
): Promise<BatchModerationResponse> {
  const batchMonitor = new PerformanceMonitor();
  const results: ModerationResult[] = [];
  const settings = request.settings || {};
  
  console.log(`🔄 Processing batch ${request.batch_id} with ${request.images.length} images`);
  
  // Process images with controlled concurrency
  const semaphore = new Array(CONFIG.MAX_CONCURRENT_REQUESTS).fill(null);
  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  
  const processImage = async (imageData: { image_base64: string; image_id: string }) => {
    // Wait for rate limit
    while (!rateLimiter.canMakeRequest()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    try {
      // Validate and process image
      const imageBuffer = validateImageData(imageData.image_base64, imageData.image_id);
      const result = await processImageWithRetry(client, imageBuffer, imageData.image_id, settings);
      
      if (result.error) {
        failureCount++;
      } else {
        successCount++;
      }
      
      results.push(result);
      processedCount++;
      
      console.log(`✅ Processed image ${imageData.image_id} (${processedCount}/${request.images.length})`);
      
    } catch (error) {
      failureCount++;
      processedCount++;
      
      const errorResult: ModerationResult = {
        image_id: imageData.image_id,
        is_nsfw: false,
        moderation_labels: [],
        confidence_score: 0,
        processing_time_ms: 0,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
      
      results.push(errorResult);
      console.error(`❌ Failed to process image ${imageData.image_id}:`, error);
    }
  };
  
  // Process images in batches with concurrency control
  const chunks = [];
  for (let i = 0; i < request.images.length; i += CONFIG.MAX_CONCURRENT_REQUESTS) {
    chunks.push(request.images.slice(i, i + CONFIG.MAX_CONCURRENT_REQUESTS));
  }
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(processImage));
  }
  
  // Sort results by original order
  results.sort((a, b) => {
    const indexA = request.images.findIndex(img => img.image_id === a.image_id);
    const indexB = request.images.findIndex(img => img.image_id === b.image_id);
    return indexA - indexB;
  });
  
  const response: BatchModerationResponse = {
    batch_id: request.batch_id!,
    total_images: request.images.length,
    successful: successCount,
    failed: failureCount,
    results,
    total_processing_time_ms: batchMonitor.getElapsedMs(),
    rate_limit_info: {
      remaining_requests: rateLimiter.getRemainingRequests(),
      reset_time: rateLimiter.getResetTime()
    }
  };
  
  console.log(`✅ Batch ${request.batch_id} completed: ${successCount} successful, ${failureCount} failed, ${batchMonitor.getElapsedMs()}ms total`);
  
  return response;
}

// Global rate limiter instance
const globalRateLimiter = new RateLimiter();

// Main request handler
serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const requestMonitor = new PerformanceMonitor();
  
  console.log(`🚀 [${requestId}] ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    });
  }
  
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        details: 'Only POST requests are supported',
        type: 'method_error'
      }),
      {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      }
    );
  }
  
  try {
    // Validate environment and initialize client
    const { client, region } = validateEnvironment();
    console.log(`🔧 [${requestId}] AWS client initialized for region: ${region}`);
    
    // Parse and validate request
    let body: any;
    try {
      body = await req.json();
    } catch (error) {
      throw new ValidationError('Invalid JSON in request body', 'Request must contain valid JSON');
    }
    
    const request = validateBatchRequest(body);
    console.log(`📋 [${requestId}] Processing ${request.images.length} images in batch: ${request.batch_id}`);
    
    // Check rate limits
    if (!globalRateLimiter.canMakeRequest()) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          details: 'Too many requests. Please try again later.',
          type: 'rate_limit_error',
          rate_limit_info: {
            remaining_requests: globalRateLimiter.getRemainingRequests(),
            reset_time: globalRateLimiter.getResetTime()
          }
        }),
        {
          status: 429,
          headers: { 
            ...CORS_HEADERS, 
            'Content-Type': 'application/json',
            'Retry-After': '1'
          }
        }
      );
    }
    
    // Process the batch
    const result = await Promise.race([
      processBatch(client, request, globalRateLimiter),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), CONFIG.BATCH_TIMEOUT_MS)
      )
    ]);
    
    // Determine response format based on request type
    const isingleRequest = request.images.length === 1 && body.image_base64;
    
    if (isingleRequest) {
      // Return single image response format for backward compatibility
      const singleResult = result.results[0];
      const singleResponse: SingleModerationResponse = {
        ...singleResult,
        rate_limit_info: result.rate_limit_info
      };
      
      console.log(`✅ [${requestId}] Single image processed in ${requestMonitor.getElapsedMs()}ms`);
      
      return new Response(
        JSON.stringify(singleResponse),
        {
          status: 200,
          headers: { 
            ...CORS_HEADERS, 
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            'X-Processing-Time': requestMonitor.getElapsedMs().toString()
          }
        }
      );
    } else {
      // Return batch response format
      console.log(`✅ [${requestId}] Batch processed in ${requestMonitor.getElapsedMs()}ms`);
      
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: { 
            ...CORS_HEADERS, 
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            'X-Processing-Time': requestMonitor.getElapsedMs().toString(),
            'X-Batch-ID': result.batch_id
          }
        }
      );
    }
    
  } catch (error) {
    console.error(`❌ [${requestId}] Request failed:`, error);
    
    const errorResponse = getErrorResponse(error);
    
    return new Response(
      JSON.stringify({
        ...errorResponse.body,
        request_id: requestId,
        processing_time_ms: requestMonitor.getElapsedMs()
      }),
      {
        status: errorResponse.status,
        headers: { 
          ...CORS_HEADERS, 
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      }
    );
  }
});

// Health check endpoint (if needed)
// You can add a GET endpoint for health checks:
/*
if (req.method === "GET" && new URL(req.url).pathname === "/health") {
  return new Response(
    JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "2.0.0"
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    }
  );
}
*/