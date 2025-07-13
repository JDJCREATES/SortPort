/**
 * Production-Ready Supabase Edge Function for AWS Rekognition Content Moderation
 * Features: True batch processing, concurrent requests, robust error handling, rate limiting
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

interface ModerationSettings {
  confidence_threshold?: number;
  categories?: string[];
  include_all_labels?: boolean;
  max_concurrent?: number; // New: control concurrency
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
  retry_count?: number; // New: track retries
}

interface BatchModerationResponse {
  batch_id: string;
  total_images: number;
  successful: number;
  failed: number;
  results: ModerationResult[];
  total_processing_time_ms: number;
  average_processing_time_ms: number; // New: performance metric
  throughput_images_per_second: number; // New: performance metric
  rate_limit_info?: {
    remaining_requests: number;
    reset_time: string;
  };
}

// Add this type definition near the other interfaces (around line 50)
interface SingleModerationResponse extends ModerationResult {
  rate_limit_info?: {
    remaining_requests: number;
    reset_time: string;
  };
}

// Enhanced Configuration - MOVED TO TOP
const CONFIG = {
  // AWS Rekognition limits and optimization
  MAX_IMAGE_SIZE_MB: 5,
  MAX_BATCH_SIZE: 25, // Increased for better throughput
  MAX_CONCURRENT_REQUESTS: 8, // Increased concurrency
  OPTIMAL_CONCURRENT_REQUESTS: 6, // Sweet spot for AWS limits
  
  // Default moderation settings
  DEFAULT_CONFIDENCE_THRESHOLD: 80,
  MIN_CONFIDENCE_FOR_API: 50,
  
  // Enhanced rate limiting
  RATE_LIMIT_PER_SECOND: 10, // AWS allows up to 50/sec for DetectModerationLabels
  RATE_LIMIT_BURST: 20,
  RATE_LIMIT_WINDOW_MS: 1000,
  
  // Optimized timeouts
  REQUEST_TIMEOUT_MS: 15000, // Reduced for faster failure detection
  BATCH_TIMEOUT_MS: 180000, // 3 minutes for large batches
  SINGLE_IMAGE_TIMEOUT_MS: 8000, // Individual image timeout
  
  // Enhanced retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE_MS: 500, // Exponential backoff base
  RETRY_DELAY_MAX_MS: 5000,
  
  // Performance optimization
  CHUNK_SIZE: 6, // Process in chunks for optimal performance
  MEMORY_CLEANUP_INTERVAL: 50, // Clean up every N images
} as const;

// Add this near the top of the file, after the CONFIG definition (around line 100):
const globalRateLimiter = new SlidingWindowRateLimiter(CONFIG.RATE_LIMIT_PER_SECOND);

// NSFW Categories (comprehensive list)
const NSFW_CATEGORIES = [
  'Explicit Nudity',
  'Nudity',
  'Sexual Activity',
  'Partial Nudity',
  'Sexual Situations',
  'Adult Toys',
  'Female Swimwear Or Underwear',
  'Male Swimwear Or Underwear',
  'Revealing Clothes',
  'Graphic Violence Or Gore',
  'Physical Violence',
  'Weapon Violence',
  'Weapons',
  'Self Injury',
  'Emaciated Bodies',
  'Corpses',
  'Hanging',
  'Air Crash',
  'Explosions And Blasts',
  'Drug Products',
  'Drug Use',
  'Pills',
  'Drug Paraphernalia',
  'Tobacco Products',
  'Smoking',
  'Drinking',
  'Alcoholic Beverages',
  'Gambling',
  'Hate Symbols',
  'Nazi Party',
  'White Supremacy',
  'Extremist',
] as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Batch-ID, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const;

// Enhanced logging utility - make context parameter optional
function logWithContext(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: any): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...context
  };
  
  console.log(JSON.stringify(logEntry));
}

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
  
  logWithContext('INFO', 'Validating AWS environment', {
    hasAccessKey: !!AWS_ACCESS_KEY_ID,
    hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION,
    accessKeyPrefix: AWS_ACCESS_KEY_ID?.substring(0, 4) + '...',
  });
  
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    logWithContext('ERROR', 'AWS credentials missing', {
      AWS_ACCESS_KEY_ID: !!AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: !!AWS_SECRET_ACCESS_KEY,
    });
    throw new ConfigurationError(
      'AWS credentials not configured',
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required'
    );
  }
  
  // Validate credential format
  if (!AWS_ACCESS_KEY_ID.match(/^AKIA[0-9A-Z]{16}$/)) {
    logWithContext('ERROR', 'Invalid AWS Access Key ID format', {
      accessKeyId: AWS_ACCESS_KEY_ID.substring(0, 8) + '...',
      length: AWS_ACCESS_KEY_ID.length,
    });
    throw new ConfigurationError(
      'Invalid AWS Access Key ID format',
      'Access Key ID should start with AKIA and be 20 characters long'
    );
  }
  
  if (AWS_SECRET_ACCESS_KEY.length !== 40) {
    logWithContext('ERROR', 'Invalid AWS Secret Access Key format', {
      length: AWS_SECRET_ACCESS_KEY.length,
    });
    throw new ConfigurationError(
      'Invalid AWS Secret Access Key format',
      'Secret Access Key should be 40 characters long'
    );
  }
  
  try {
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
    
    logWithContext('INFO', 'AWS Rekognition client initialized successfully', {
      region: AWS_REGION,
    });
    
    return { client, region: AWS_REGION };
  } catch (error) {
    logWithContext('ERROR', 'Failed to initialize AWS Rekognition client', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ConfigurationError(
      'Failed to initialize AWS Rekognition client',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

function logImageDetails(imageBuffer: Uint8Array, imageId: string): void {
  const size = imageBuffer.length;
  const sizeMB = (size / (1024 * 1024)).toFixed(2);
  
  // Check image format
  let format = 'unknown';
  if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
    format = 'JPEG';
  } else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
    format = 'PNG';
  } else if (imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45 && imageBuffer[10] === 0x42 && imageBuffer[11] === 0x50) {
    format = 'WebP';
  }
  
  logWithContext('INFO', `Image details for ${imageId}`, {
    format,
    sizeMB,
    sizeBytes: size,
    header: Array.from(imageBuffer.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')),
  });
}

// Enhanced image validation with better error messages
function validateImageData(base64Data: string, imageId: string): Uint8Array {
  if (!base64Data || typeof base64Data !== 'string') {
    throw new Error(`Invalid base64 data for image ${imageId}: data is empty or not a string`);
  }
  
  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
  
  if (!cleanBase64) {
    throw new Error(`Invalid base64 data for image ${imageId}: no data after cleaning`);
  }
  
  try {
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
      throw new Error(`Invalid base64 format for image ${imageId}`);
    }
    
    const imageBuffer = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));
    
    if (imageBuffer.length === 0) {
      throw new Error(`Empty image buffer for image ${imageId}`);
    }
    
    // Check file size
    const sizeInMB = imageBuffer.length / (1024 * 1024);
    if (sizeInMB > CONFIG.MAX_IMAGE_SIZE_MB) {
      throw new Error(`Image ${imageId} too large: ${sizeInMB.toFixed(2)}MB (max: ${CONFIG.MAX_IMAGE_SIZE_MB}MB)`);
    }
    
    // Basic image format validation (check magic bytes)
    const isValidImage = isValidImageFormat(imageBuffer);
    if (!isValidImage) {
      throw new Error(`Invalid image format for image ${imageId}`);
    }
    
    return imageBuffer;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to decode base64 for image ${imageId}: ${String(error)}`);
  }
}

function validateBatchRequest(body: any): ModerationRequest {
  logWithContext('INFO', 'Validating batch request', {
    bodyType: typeof body,
    hasImages: !!body?.images,
    hasImageBase64: !!body?.image_base64,
    hasImageId: !!body?.image_id,
  });
  
  if (!body || typeof body !== 'object') {
    logWithContext('ERROR', 'Invalid request body', { bodyType: typeof body });
    throw new ValidationError('Invalid request body', 'Request body must be a valid JSON object');
  }
  
  // Handle both single image and batch requests
  if (body.image_base64 && body.image_id) {
    logWithContext('INFO', 'Converting single image request to batch format', {
      imageId: body.image_id,
      base64Length: body.image_base64?.length || 0,
    });
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
    logWithContext('ERROR', 'Missing or invalid images array', {
      hasImages: !!body.images,
      imagesType: typeof body.images,
      isArray: Array.isArray(body.images),
    });
    throw new ValidationError('Missing images array', 'Request must contain an images array');
  }
  
  if (body.images.length === 0) {
    console.log(`[${new Date().toISOString()}] [ERROR] Empty images array`);
    throw new ValidationError('Empty images array', 'At least one image is required');
  }
  
  if (body.images.length > CONFIG.MAX_BATCH_SIZE) {
    logWithContext('ERROR', 'Batch too large', {
      imageCount: body.images.length,
      maxBatchSize: CONFIG.MAX_BATCH_SIZE,
    });
    throw new ValidationError(
      'Batch too large',
      `Maximum batch size is ${CONFIG.MAX_BATCH_SIZE} images`
    );
  }
  
  // Validate each image in the batch
  for (let i = 0; i < body.images.length; i++) {
    const image = body.images[i];
    if (!image.image_base64 || !image.image_id) {
      logWithContext('ERROR', `Invalid image at index ${i}`, {
        index: i,
        hasBase64: !!image.image_base64,
        hasId: !!image.image_id,
        imageId: image.image_id,
      });
      throw new ValidationError(
        `Invalid image at index ${i}`,
        'Each image must have image_base64 and image_id fields'
      );
    }
  }
  
  const batchId = body.batch_id || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logWithContext('INFO', 'Batch request validated successfully', {
    batchId,
    imageCount: body.images.length,
  });
  
  return {
    images: body.images,
    batch_id: batchId,
    settings: body.settings || {}
  };
}

// Error handling utilities
function calculateRetryDelay(retryCount: number): number {
  const baseDelay = CONFIG.RETRY_DELAY_BASE_MS;
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * baseDelay; // Add jitter to prevent thundering herd
  return Math.min(exponentialDelay + jitter, CONFIG.RETRY_DELAY_MAX_MS);
}

function isRetryableError(error: any): boolean {
  if (error instanceof RekognitionServiceException) {
    const retryableErrors = [
      'ThrottlingException',
      'ServiceUnavailableException', 
      'InternalServerError',
      'RequestTimeoutException',
      'ServiceQuotaExceededException'
    ];
    return retryableErrors.includes(error.name);
  }
  
  // Network and timeout errors
  if (error.name === 'NetworkError' || 
      error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('timeout')) {
    return true;
  }
  
  return false;
}

function getErrorResponse(error: any, requestId?: string): { status: number; body: any } {
  logWithContext('ERROR', 'Creating error response', {
    errorName: error.name,
    errorMessage: error.message,
    requestId,
    stack: error.stack?.substring(0, 500), // Truncate stack trace
  });
  
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: error.message,
        details: error.details,
        type: 'validation_error',
        request_id: requestId,
      }
    };
  }
  
  if (error instanceof ConfigurationError) {
    return {
      status: 500,
      body: {
        error: error.message,
        details: error.details,
        type: 'configuration_error',
        request_id: requestId,
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
        aws_error_code: error.name,
        request_id: requestId,
      }
    };
  }
  
  // Generic error
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      details: 'An unexpected error occurred while processing your request',
      type: 'internal_error',
      request_id: requestId,
    }
  };
}

  // Utility function to generate unique batch IDs
function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Enhanced Rate Limiter with sliding window
class SlidingWindowRateLimiter {
  private requests: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;
  
  constructor(maxRequests: number, windowMs: number = CONFIG.RATE_LIMIT_WINDOW_MS) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  canMakeRequest(): boolean {
    const now = Date.now();
    this.cleanupOldRequests(now);
    return this.requests.length < this.maxRequests;
  }
  
  recordRequest(): void {
    const now = Date.now();
    this.cleanupOldRequests(now);
    this.requests.push(now);
  }
  
  private cleanupOldRequests(now: number): void {
    this.requests = this.requests.filter(time => now - time < this.windowMs);
  }
  
  getRemainingRequests(): number {
    const now = Date.now();
    this.cleanupOldRequests(now);
    return Math.max(0, this.maxRequests - this.requests.length);
  }
  
  getResetTime(): string {
    if (this.requests.length === 0) return new Date().toISOString();
    const oldestRequest = Math.min(...this.requests);
    return new Date(oldestRequest + this.windowMs).toISOString();
  }
  
  async waitForAvailability(): Promise<void> {
    while (!this.canMakeRequest()) {
      const waitTime = Math.min(100, this.windowMs / 10);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Enhanced Performance Monitor

class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();
  
  constructor() {
    this.startTime = performance.now();
  }
  
  checkpoint(name: string): void {
    this.checkpoints.set(name, performance.now());
  }
  
  getCheckpointTime(name: string): number {
    const time = this.checkpoints.get(name);
    return time ? Math.round(time - this.startTime) : 0;
  }
  
  getElapsedMs(): number {
    return Math.round(performance.now() - this.startTime);
  }
  
  getThroughput(itemCount: number): number {
    const elapsedSeconds = this.getElapsedMs() / 1000;
    return elapsedSeconds > 0 ? itemCount / elapsedSeconds : 0;
  }
  
  static async timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = performance.now();
    const result = await fn();
    const timeMs = Math.round(performance.now() - start);
    return { result, timeMs };
  }
}

// Core Processing Functions (continued)
async function processImageWithRetry(
  client: RekognitionClient,
  imageBuffer: Uint8Array,
  imageId: string,
  settings: ModerationSettings,
  rateLimiter: SlidingWindowRateLimiter,
  retryCount = 0
): Promise<ModerationResult> {
  const monitor = new PerformanceMonitor();
  
  try {
    // Wait for rate limit availability
    await rateLimiter.waitForAvailability();
    rateLimiter.recordRequest();
    
    logWithContext('INFO', `Processing image ${imageId}`, {
      attempt: retryCount + 1,
      bufferSize: imageBuffer.length,
      remainingRequests: rateLimiter.getRemainingRequests()
    });
    
    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: imageBuffer },
      MinConfidence: CONFIG.MIN_CONFIDENCE_FOR_API,
    });
    
    // Add timeout to individual requests
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), CONFIG.SINGLE_IMAGE_TIMEOUT_MS);
    });
    
    const response = await Promise.race([
      client.send(command),
      timeoutPromise
    ]);
    
    const moderationLabels = response.ModerationLabels || [];
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
    
    const result: ModerationResult = {
      image_id: imageId,
      is_nsfw: isNsfw,
      moderation_labels: moderationLabels.map((label: any) => ({
        Name: label.Name || '',
        Confidence: label.Confidence || 0,
        ParentName: label.ParentName || undefined,
        Instances: label.Instances?.map((instance: any) => ({
          BoundingBox: instance.BoundingBox ? {
            Width: instance.BoundingBox.Width || 0,
            Height: instance.BoundingBox.Height || 0,
            Left: instance.BoundingBox.Left || 0,
            Top: instance.BoundingBox.Top || 0,
          } : undefined,
          Confidence: instance.Confidence || 0,
        })) || undefined,
      })),
      confidence_score: maxConfidence,
      processing_time_ms: monitor.getElapsedMs(),
      retry_count: retryCount,
    };
    
    logWithContext('INFO', `Image ${imageId} processed successfully`, {
      isNsfw,
      confidence: maxConfidence.toFixed(2),
      processingTime: monitor.getElapsedMs(),
      retryCount
    });
    
    return result;
    
  } catch (error) {
    logWithContext('ERROR', `Error processing image ${imageId}`, {
      attempt: retryCount + 1,
      error: error instanceof Error ? error.message : String(error),
      isRetryable: isRetryableError(error)
    });
    
    // Handle retryable errors with exponential backoff
    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError(error)) {
      const delayMs = calculateRetryDelay(retryCount);
      logWithContext('WARN', `Retrying image ${imageId}`, {
        attempt: retryCount + 1,
        delayMs,
        maxRetries: CONFIG.MAX_RETRIES
      });
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return processImageWithRetry(client, imageBuffer, imageId, settings, rateLimiter, retryCount + 1);
    }
    
    // Return error result
    return {
      image_id: imageId,
      is_nsfw: false,
      moderation_labels: [],
      confidence_score: 0,
      processing_time_ms: monitor.getElapsedMs(),
      retry_count: retryCount,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function processBatchConcurrent(
  client: RekognitionClient,
  request: ModerationRequest,
  rateLimiter: SlidingWindowRateLimiter
): Promise<BatchModerationResponse> {
  const batchMonitor = new PerformanceMonitor();
  const settings = request.settings || {};
  const maxConcurrent = Math.min(
    settings.max_concurrent || CONFIG.OPTIMAL_CONCURRENT_REQUESTS,
    CONFIG.MAX_CONCURRENT_REQUESTS
  );
  
  logWithContext('INFO', `Starting concurrent batch processing`, {
    batchId: request.batch_id,
    imageCount: request.images.length,
    maxConcurrent,
    settings
  });
  
  batchMonitor.checkpoint('validation_start');
  
  // Pre-validate all images concurrently
  const validationPromises = request.images.map(async (imageData, index) => {
    try {
      const imageBuffer = validateImageData(imageData.image_base64, imageData.image_id);
      return { index, imageData, imageBuffer, error: null };
    } catch (error) {
      logWithContext('ERROR', `Validation failed for image ${imageData.image_id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return { 
        index, 
        imageData, 
        imageBuffer: null, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  });
  
  const validationResults = await Promise.all(validationPromises);
  batchMonitor.checkpoint('validation_complete');
  
  // Separate valid and invalid images
  const validImages = validationResults.filter(r => r.imageBuffer !== null);
  const invalidImages = validationResults.filter(r => r.imageBuffer === null);
  
  logWithContext('INFO', `Validation complete`, {
    validImages: validImages.length,
    invalidImages: invalidImages.length,
    validationTime: batchMonitor.getCheckpointTime('validation_complete')
  });
  
  // Process valid images with controlled concurrency
  const results: ModerationResult[] = [];
  const chunks = [];
  
  // Create chunks for concurrent processing
  for (let i = 0; i < validImages.length; i += maxConcurrent) {
    chunks.push(validImages.slice(i, i + maxConcurrent));
  }
  
  batchMonitor.checkpoint('processing_start');
  let processedCount = 0;
  
  for (const chunk of chunks) {
    logWithContext('INFO', `Processing chunk`, {
      chunkSize: chunk.length,
      processedSoFar: processedCount,
      totalValid: validImages.length
    });
    
    // Process chunk concurrently
    const chunkPromises = chunk.map(async ({ imageData, imageBuffer }) => {
      try {
        const result = await processImageWithRetry(client, imageBuffer!, imageData.image_id, settings, rateLimiter);
        return result;
      } catch (error) {
        return {
          image_id: imageData.image_id,
          is_nsfw: false,
          moderation_labels: [],
          confidence_score: 0,
          processing_time_ms: 0,
          retry_count: 0,
          error: error instanceof Error ? error.message : 'Processing failed'
        };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    processedCount += chunk.length;
    
    // Memory cleanup and brief pause
    if (processedCount % CONFIG.MEMORY_CLEANUP_INTERVAL === 0) {
      if (typeof Deno !== 'undefined' && Deno.core?.ops?.op_gc) {
        Deno.core.ops.op_gc();
      }
      
      logWithContext('INFO', `Memory cleanup performed`, {
        processedCount,
        memoryUsage: getMemoryUsage()
      });
    }
    
    // Brief pause between chunks
    if (processedCount < validImages.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  batchMonitor.checkpoint('processing_complete');
  
  // Add error results for invalid images
  for (const { imageData, error } of invalidImages) {
    results.push({
      image_id: imageData.image_id,
      is_nsfw: false,
      moderation_labels: [],
      confidence_score: 0,
      processing_time_ms: 0,
      retry_count: 0,
      error: error || 'Image validation failed'
    });
  }


  
  // Calculate comprehensive metrics
  const totalProcessingTime = batchMonitor.getElapsedMs();
  const successfulResults = results.filter(r => !r.error);
  const failedResults = results.filter(r => r.error);
  const averageProcessingTime = successfulResults.length > 0 
    ? successfulResults.reduce((sum, r) => sum + r.processing_time_ms, 0) / successfulResults.length 
    : 0;
  const throughput = batchMonitor.getThroughput(request.images.length);
  
  logWithContext('INFO', `Batch processing complete`, {
    batchId: request.batch_id,
    totalImages: request.images.length,
    successful: successfulResults.length,
    failed: failedResults.length,
    totalTime: totalProcessingTime,
    averageTime: Math.round(averageProcessingTime),
    throughput: throughput.toFixed(2),
    validationTime: batchMonitor.getCheckpointTime('validation_complete'),
    processingTime: batchMonitor.getCheckpointTime('processing_complete') - batchMonitor.getCheckpointTime('processing_start')
  });
  
  return {
    batch_id: request.batch_id || generateBatchId(),
    total_images: request.images.length,
    successful: successfulResults.length,
    failed: failedResults.length,
    results,
    total_processing_time_ms: totalProcessingTime,
    average_processing_time_ms: Math.round(averageProcessingTime),
    throughput_images_per_second: parseFloat(throughput.toFixed(2)),
    rate_limit_info: {
      remaining_requests: rateLimiter.getRemainingRequests(),
      reset_time: rateLimiter.getResetTime(),
    },
  };
}


// Main request handler
serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const requestMonitor = new PerformanceMonitor();
  
  logWithContext('INFO', `Incoming request`, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers.get('User-Agent') || 'unknown',
    contentType: req.headers.get('Content-Type') || 'unknown',
  });
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log(`[${new Date().toISOString()}] [INFO] CORS preflight handled for ${requestId}`);
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    });
  }
  
  // Only allow POST requests
  if (req.method !== "POST") {
    logWithContext('ERROR', `Method not allowed for ${requestId}`, {
      method: req.method,
    });
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        details: 'Only POST requests are supported',
        type: 'method_error',
        request_id: requestId,
      }),
      {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      }
    );
  }
  
  try {
    // Validate environment and initialize client
    logWithContext('INFO', `Validating AWS environment for ${requestId}`);
    const { client, region } = validateEnvironment();
    logWithContext('INFO', `AWS client initialized for ${requestId}`, { region });
    
    // Parse and validate request
    let body: any;
    try {
      logWithContext('INFO', `Parsing request body for ${requestId}`);
      const rawBody = await req.text();
      logWithContext('INFO', `Raw body received for ${requestId}`, {
        length: rawBody.length,
        preview: rawBody.substring(0, 200) + (rawBody.length > 200 ? '...' : ''),
      });
      body = JSON.parse(rawBody);
      logWithContext('INFO', `Request body parsed successfully for ${requestId}`, {
        hasImages: !!body?.images,
        hasImageBase64: !!body?.image_base64,
        imageCount: body?.images?.length || (body?.image_base64 ? 1 : 0),
      });
    } catch (error) {
      logWithContext('ERROR', `JSON parse error for ${requestId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ValidationError('Invalid JSON in request body', 'Request must contain valid JSON');
    }
    
    const request = validateBatchRequest(body);
    logWithContext('INFO', `Processing request for ${requestId}`, {
      batchId: request.batch_id,
      imageCount: request.images.length,
    });
    
    // Check rate limits
    if (!globalRateLimiter.canMakeRequest()) {
      logWithContext('WARN', `Rate limit exceeded for ${requestId}`, {
        remainingRequests: globalRateLimiter.getRemainingRequests(),
        resetTime: globalRateLimiter.getResetTime(),
      });
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          details: 'Too many requests. Please try again later.',
          type: 'rate_limit_error',
          request_id: requestId,
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
            'Retry-After': '1',
            'X-Request-ID': requestId,
          }
        }
      );
    }
    
    // Process the batch
    logWithContext('INFO', `Starting batch processing for ${requestId}`);
    const result = await Promise.race([
      processEnhancedBatch(client, request, globalRateLimiter),
      new Promise<never>((_, reject) => 
        setTimeout(() => {
          logWithContext('ERROR', `Request timeout`, {
            timeoutMs: CONFIG.BATCH_TIMEOUT_MS,
          });
          reject(new Error('Request timeout'));
        }, CONFIG.BATCH_TIMEOUT_MS)
      )
    ]);
    
    // Determine response format based on request type
    const isSingleRequest = request.images.length === 1 && body.image_base64;
    
    if (isSingleRequest) {
      // Return single image response format for backward compatibility
      const singleResult = result.results[0];
      const singleResponse: SingleModerationResponse = {
        ...singleResult,
        rate_limit_info: result.rate_limit_info
      };
      
      logWithContext('INFO', `Single image processed successfully for ${requestId}`, {
        imageId: singleResult.image_id,
        isNsfw: singleResult.is_nsfw,
        processingTimeMs: requestMonitor.getElapsedMs(),
      });
      
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
      logWithContext('INFO', `Batch processed successfully for ${requestId}`, {
        batchId: result.batch_id,
        totalImages: result.total_images,
        successful: result.successful,
        failed: result.failed,
        processingTimeMs: requestMonitor.getElapsedMs(),
      });
      
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
    logWithContext('ERROR', `Request failed for ${requestId}`, {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack?.substring(0, 1000) : undefined,
      processingTimeMs: requestMonitor.getElapsedMs(),
    });
    
    const errorResponse = getErrorResponse(error, requestId);
    
    return new Response(
      JSON.stringify({
        ...errorResponse.body,
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

// Health check endpoint
serve(async (req: Request): Promise<Response> => {
  if (req.method === "GET" && new URL(req.url).pathname === "/health") {
    console.log(`[${new Date().toISOString()}] [INFO] Health check requested`);
    
    try {
      // Quick environment validation
      const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
      const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
      const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
      
      const healthStatus = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "2.1.0",
        environment: {
          hasAwsCredentials: !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY),
          awsRegion: AWS_REGION,
        },
        config: {
          maxImageSizeMB: CONFIG.MAX_IMAGE_SIZE_MB,
          maxBatchSize: CONFIG.MAX_BATCH_SIZE,
          rateLimitPerSecond: CONFIG.RATE_LIMIT_PER_SECOND,
        }
      };
      
      logWithContext('INFO', 'Health check completed', healthStatus);
      
      return new Response(
        JSON.stringify(healthStatus),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      logWithContext('ERROR', 'Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      return new Response(
        JSON.stringify({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 503,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      );
    }
  }
  
  // If not a health check, continue with normal processing
  return serve(req);
});

// Additional utility functions for production readiness

/**
 * Health check endpoint for monitoring
 */
async function healthCheck(): Promise<{ status: string; timestamp: string; version: string }> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  };
}

/**
 * Memory usage monitoring
 */
function getMemoryUsage(): { used: number; total: number; percentage: number } {
  if (typeof Deno !== 'undefined' && Deno.memoryUsage) {
    const usage = Deno.memoryUsage();
    return {
      used: usage.heapUsed,
      total: usage.heapTotal,
      percentage: (usage.heapUsed / usage.heapTotal) * 100
    };
  }
  return { used: 0, total: 0, percentage: 0 };
}

/**
 * Enhanced batch processing with adaptive concurrency
 */
class AdaptiveConcurrencyManager {
  private currentConcurrency: number;
  private readonly minConcurrency = 2;
  private readonly maxConcurrency = CONFIG.MAX_CONCURRENT_REQUESTS;
  private successRate = 1.0;
  private avgResponseTime = 1000;
  private readonly targetResponseTime = 2000; // 2 seconds target
  
  constructor(initialConcurrency = CONFIG.OPTIMAL_CONCURRENT_REQUESTS) {
    this.currentConcurrency = Math.min(initialConcurrency, this.maxConcurrency);
  }
  
  updateMetrics(successCount: number, totalCount: number, avgResponseTime: number): void {
    this.successRate = totalCount > 0 ? successCount / totalCount : 1.0;
    this.avgResponseTime = avgResponseTime;
    
    // Adaptive adjustment logic
    if (this.successRate < 0.9) {
      // High error rate, reduce concurrency
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.currentConcurrency * 0.8)
      );
    } else if (this.successRate > 0.95 && this.avgResponseTime < this.targetResponseTime) {
      // Good performance, try increasing concurrency
      this.currentConcurrency = Math.min(
        this.maxConcurrency,
        this.currentConcurrency + 1
      );
    } else if (this.avgResponseTime > this.targetResponseTime * 1.5) {
      // Slow responses, reduce concurrency
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        this.currentConcurrency - 1
      );
    }
  }
  
  getConcurrency(): number {
    return this.currentConcurrency;
  }
  
  getMetrics(): { concurrency: number; successRate: number; avgResponseTime: number } {
    return {
      concurrency: this.currentConcurrency,
      successRate: this.successRate,
      avgResponseTime: this.avgResponseTime
    };
  }
}

/**
 * Circuit breaker for AWS API calls
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly failureThreshold = 5;
  private readonly recoveryTimeMs = 30000; // 30 seconds
  private readonly testRequestInterval = 10000; // 10 seconds
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN - AWS API temporarily unavailable');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Enhanced batch processor with all production features
 */
async function processEnhancedBatch(
  client: RekognitionClient,
  request: ModerationRequest,
  rateLimiter: SlidingWindowRateLimiter
): Promise<BatchModerationResponse> {
  const batchMonitor = new PerformanceMonitor();
  const concurrencyManager = new AdaptiveConcurrencyManager();
  const circuitBreaker = new CircuitBreaker();
  const settings = request.settings || {};
  
  logWithContext('INFO', `Starting enhanced batch processing`, {
    batchId: request.batch_id,
    imageCount: request.images.length,
    initialConcurrency: concurrencyManager.getConcurrency(),
    memoryUsage: getMemoryUsage()
  });
  
  // Pre-validate all images
  batchMonitor.checkpoint('validation_start');
  const validationResults = await Promise.all(
    request.images.map(async (imageData, index) => {
      try {
        const imageBuffer = validateImageData(imageData.image_base64, imageData.image_id);
        return { index, imageData, imageBuffer, error: null };
      } catch (error) {
        return { 
          index, 
          imageData, 
          imageBuffer: null, 
          error: error instanceof Error ? error.message : 'Validation failed' 
        };
      }
    })
  );
  
  const validImages = validationResults.filter(r => r.imageBuffer !== null);
  const invalidImages = validationResults.filter(r => r.imageBuffer === null);
  batchMonitor.checkpoint('validation_complete');
  
  // Process with adaptive concurrency
  const results: ModerationResult[] = [];
  let processedCount = 0;
  let successCount = 0;
  const responseTimes: number[] = [];
  
  batchMonitor.checkpoint('processing_start');
  
  // Process in adaptive chunks
  while (processedCount < validImages.length) {
    const currentConcurrency = concurrencyManager.getConcurrency();
    const chunk = validImages.slice(processedCount, processedCount + currentConcurrency);
    
    logWithContext('INFO', `Processing adaptive chunk`, {
      chunkSize: chunk.length,
      concurrency: currentConcurrency,
      processedSoFar: processedCount,
      totalValid: validImages.length,
      concurrencyMetrics: concurrencyManager.getMetrics(),
      circuitBreakerState: circuitBreaker.getState()
    });
    
    // Process chunk with circuit breaker protection
    const chunkStartTime = performance.now();
    const chunkPromises = chunk.map(({ imageData, imageBuffer }) =>
      circuitBreaker.execute(() =>
        processImageWithRetry(
          client,
          imageBuffer!,
          imageData.image_id,
          settings,
          rateLimiter
        )
      ).catch(error => ({
        image_id: imageData.image_id,
        is_nsfw: false,
        moderation_labels: [],
        confidence_score: 0,
        processing_time_ms: 0,
        error: error instanceof Error ? error.message : 'Processing failed'
      } as ModerationResult))
    );
    
    const chunkResults = await Promise.all(chunkPromises);
    const chunkTime = performance.now() - chunkStartTime;
    
    // Update metrics
    const chunkSuccessCount = chunkResults.filter(r => !r.error).length;
    successCount += chunkSuccessCount;
    responseTimes.push(chunkTime / chunk.length); // Average per image
    
    // Update adaptive concurrency
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 1000; // Default fallback
    concurrencyManager.updateMetrics(successCount, processedCount + chunk.length, avgResponseTime);
    
    results.push(...chunkResults);
    processedCount += chunk.length;
    
    // Memory cleanup and brief pause
    if (processedCount % CONFIG.MEMORY_CLEANUP_INTERVAL === 0) {
      if (typeof Deno !== 'undefined' && Deno.core?.ops?.op_gc) {
        Deno.core.ops.op_gc();
      }
      
      logWithContext('INFO', `Memory cleanup performed`, {
        processedCount,
        memoryUsage: getMemoryUsage(),
        avgResponseTime: avgResponseTime.toFixed(2)
      });
    }
    
    // Brief pause between chunks
    if (processedCount < validImages.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  batchMonitor.checkpoint('processing_complete');
  
  // Add error results for invalid images
  for (const { imageData, error } of invalidImages) {
    results.push({
      image_id: imageData.image_id,
      is_nsfw: false,
      moderation_labels: [],
      confidence_score: 0,
      processing_time_ms: 0,
      error: error || 'Image validation failed'
    });
  }


  
  // Calculate comprehensive metrics
  const totalProcessingTime = batchMonitor.getElapsedMs();
  const successfulResults = results.filter(r => !r.error);
  const failedResults = results.filter(r => r.error);
  const averageProcessingTime = successfulResults.length > 0 
    ? successfulResults.reduce((sum, r) => sum + r.processing_time_ms, 0) / successfulResults.length 
    : 0;
  const throughput = batchMonitor.getThroughput(request.images.length);
  
  logWithContext('INFO', `Enhanced batch processing complete`, {
    batchId: request.batch_id,
    totalImages: request.images.length,
    successful: successfulResults.length,
    failed: failedResults.length,
    totalTime: totalProcessingTime,
    averageTime: Math.round(averageProcessingTime),
    throughput: throughput.toFixed(2),
    finalConcurrency: concurrencyManager.getConcurrency(),
    finalMemoryUsage: getMemoryUsage(),
    circuitBreakerFinalState: circuitBreaker.getState()
  });
  
  return {
    batch_id: request.batch_id || generateBatchId(),
    total_images: request.images.length,
    successful: successfulResults.length,
    failed: failedResults.length,
    results,
    total_processing_time_ms: totalProcessingTime,
    average_processing_time_ms: Math.round(averageProcessingTime),
    throughput_images_per_second: parseFloat(throughput.toFixed(2)),
    rate_limit_info: {
      remaining_requests: rateLimiter.getRemainingRequests(),
      reset_time: rateLimiter.getResetTime(),
    },
  };
}

// Export for testing (if needed)
export {
  CONFIG,
  SlidingWindowRateLimiter,
  PerformanceMonitor,
  AdaptiveConcurrencyManager,
  CircuitBreaker,
  processEnhancedBatch,
  validateImageData,
  isValidImageFormat,
  logWithContext
};

// Add this function after the utility functions section (around line 150):

// Enhanced image format validation
function isValidImageFormat(buffer: Uint8Array): boolean {
  if (buffer.length < 8) return false;
  
  // Check for common image format magic bytes
  const magicBytes = Array.from(buffer.slice(0, 8));
  
  // JPEG: FF D8 FF
  if (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF) {
    return true;
  }
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && 
      magicBytes[2] === 0x4E && magicBytes[3] === 0x47) {
    return true;
  }
  
  // GIF: 47 49 46 38
  if (magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && 
      magicBytes[2] === 0x46 && magicBytes[3] === 0x38) {
    return true;
  }
  
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && 
      magicBytes[2] === 0x46 && magicBytes[3] === 0x46) {
    return true;
  }
  
  // BMP: 42 4D
  if (magicBytes[0] === 0x42 && magicBytes[1] === 0x4D) {
    return true;
  }
  
  return false;
}
