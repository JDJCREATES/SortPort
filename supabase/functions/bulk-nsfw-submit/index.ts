import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  StartMediaAnalysisJobCommand,  // ✅ Only this for bulk processing
  RekognitionServiceException
} from "npm:@aws-sdk/client-rekognition@^3.840.0"


// Strict TypeScript interfaces
interface BulkModerationRequest {
  storagePaths: string[]  // ✅ Changed to storage paths
  bucketPath: string
  userId: string
  totalImages: number
  settings?: {
    confidence_threshold?: number
    categories?: string[]
    max_concurrent?: number
  }
}

interface BulkJobRecord {
  id: string
  user_id: string
  status: 'uploading' | 'submitted' | 'processing' | 'completed' | 'failed'
  total_images: number
  processed_images: number
  nsfw_detected: number
  s3_job_id?: string
  bucket_path: string
  created_at: string
  submitted_at?: string
  completed_at?: string
  error_message?: string
}

interface BulkModerationResponse {
  jobId: string
  awsJobId?: string
  status: string
  totalImages: number
  request_id: string
}

interface ErrorResponse {
  error: string
  details?: string
  type: string
  request_id: string
}

// Constants
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Batch-ID, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

const CONFIG = {
  MAX_IMAGE_SIZE_MB: 5,
  MAX_BATCH_SIZE: 5000,
  REQUEST_TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE_MS: 1000,
  RETRY_DELAY_MAX_MS: 5000,
} as const

// Enhanced logging utility with strict typing
function logWithContext(
  level: 'INFO' | 'WARN' | 'ERROR', 
  message: string, 
  context?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    ...context
  }
  console.log(JSON.stringify(logEntry))
}

// Custom error classes with strict typing
class ValidationError extends Error {
  public readonly name = 'ValidationError'
  
  constructor(message: string, public readonly details?: string) {
    super(message)
  }
}

class ConfigurationError extends Error {
  public readonly name = 'ConfigurationError'
  
  constructor(message: string, public readonly details?: string) {
    super(message)
  }
}

class AWSError extends Error {
  public readonly name = 'AWSError'
  
  constructor(message: string, public readonly awsErrorCode?: string) {
    super(message)
  }
}

// AWS Client Manager with strict typing
class AWSClientManager {
  private static client: RekognitionClient | null = null
  
  static validateEnvironment(): { region: string } {
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1'
    
    logWithContext('INFO', 'Validating AWS environment', {
      hasAccessKey: !!AWS_ACCESS_KEY_ID,
      hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
      accessKeyPrefix: AWS_ACCESS_KEY_ID?.substring(0, 4) + '...',
    })
    
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new ConfigurationError(
        'AWS credentials not configured',
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are required'
      )
    }
    
    // Validate credential format with strict regex
    if (!AWS_ACCESS_KEY_ID.match(/^AKIA[0-9A-Z]{16}$/)) {
      throw new ConfigurationError(
        'Invalid AWS Access Key ID format',
        'Access Key ID should start with AKIA and be 20 characters long'
      )
    }
    
    if (AWS_SECRET_ACCESS_KEY.length !== 40) {
      throw new ConfigurationError(
        'Invalid AWS Secret Access Key format',
        'Secret Access Key should be 40 characters long'
      )
    }
    
    return { region: AWS_REGION }
  }
  
  static getClient(): RekognitionClient {
    if (!this.client) {
      const { region } = this.validateEnvironment()
      
      this.client = new RekognitionClient({
        region,
        credentials: {
          accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
          secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
        },
        maxAttempts: CONFIG.MAX_RETRIES,
        requestHandler: {
          requestTimeout: CONFIG.REQUEST_TIMEOUT_MS,
        },
      })
      
      logWithContext('INFO', 'AWS Rekognition client initialized', { region })
    }
    
    return this.client
  }
  
  static async startBulkModerationJob(
    bucketPath: string, 
    jobId: string,
    storagePaths: string[]
  ): Promise<string> {
    const client = this.getClient()
    const supabaseStorageUrl = Deno.env.get('SUPABASE_STORAGE_S3_BUCKET')
    const snsTopicArn = Deno.env.get('AWS_SNS_TOPIC_ARN')
    const snsRoleArn = Deno.env.get('AWS_SNS_ROLE_ARN')
    
    if (!supabaseStorageUrl) {
      throw new ConfigurationError(
        'Supabase storage bucket not configured',
        'SUPABASE_STORAGE_S3_BUCKET environment variable is required'
      )
    }
    
    logWithContext('INFO', 'Starting AWS bulk media analysis job', {
      bucketPath,
      jobId,
      bucket: supabaseStorageUrl,
      imageCount: storagePaths.length,
      hasSNS: !!snsTopicArn
    })
    
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      
      // ✅ Create manifest from existing storage paths
      const manifestLines = storagePaths.map(path => JSON.stringify({
        "source-ref": `s3://${supabaseStorageUrl}/${path}`
      }))
      
      const manifestKey = `${bucketPath}/manifest.jsonl`
      
      const { error: manifestError } = await supabase.storage
        .from('nsfw-temp-processing')
        .upload(manifestKey, manifestLines.join('\n'), {
          contentType: 'application/jsonl',
          upsert: true
        })
      
      if (manifestError) {
        throw new Error(`Failed to upload manifest: ${manifestError.message}`)
      }
      
      // ✅ Start AWS Media Analysis Job
      const command = new StartMediaAnalysisJobCommand({
        JobName: `bulk-moderation-${jobId}`,
        OperationsConfig: {
          DetectModerationLabels: { 
            MinConfidence: 50
          }
        },
        Input: {
          S3Object: { 
            Bucket: supabaseStorageUrl, 
            Name: manifestKey 
          }
        },
        OutputConfig: {
          S3Bucket: supabaseStorageUrl,
          S3KeyPrefix: `${bucketPath}/results/`
        },
        ...(snsTopicArn && snsRoleArn ? {
          NotificationChannel: {
            SNSTopicArn: snsTopicArn,
            RoleArn: snsRoleArn
          }
        } : {})
      })

      const response = await client.send(command)
      
      if (!response.JobId) {
        throw new AWSError('AWS did not return a job ID')
      }
      
      logWithContext('INFO', 'AWS bulk media analysis job started', {
        awsJobId: response.JobId,
        jobName: `bulk-moderation-${jobId}`,
        manifestPath: manifestKey,
        imageCount: storagePaths.length
      })
      
      return response.JobId
      
    } catch (error: any) {
      if (error instanceof RekognitionServiceException) {
        throw new AWSError(
          `AWS Rekognition error: ${error.message}`,
          error.name
        )
      }
      throw error
    }
  }
}

// Image Validator with strict typing
class ImageValidator {
  static validateImageData(base64Data: string, imageId: string): Uint8Array {
    if (!base64Data || typeof base64Data !== 'string') {
      throw new ValidationError(
        `Invalid base64 data for image ${imageId}`,
        'Data is empty or not a string'
      )
    }
    
    // Remove data URL prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '')
    
    if (!cleanBase64) {
      throw new ValidationError(
        `Invalid base64 data for image ${imageId}`,
        'No data after cleaning data URL prefix'
      )
    }
    
    try {
      // Validate base64 format with strict regex
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
        throw new ValidationError(
          `Invalid base64 format for image ${imageId}`,
          'Contains invalid characters for base64 encoding'
        )
      }
      
      const imageBuffer = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))
      
      if (imageBuffer.length === 0) {
        throw new ValidationError(
          `Empty image buffer for image ${imageId}`,
          'Decoded base64 resulted in empty buffer'
        )
      }
      
      // Check file size
      const sizeInMB = imageBuffer.length / (1024 * 1024)
      if (sizeInMB > CONFIG.MAX_IMAGE_SIZE_MB) {
        throw new ValidationError(
          `Image ${imageId} too large: ${sizeInMB.toFixed(2)}MB`,
          `Maximum allowed size is ${CONFIG.MAX_IMAGE_SIZE_MB}MB`
        )
      }
      
      // Basic image format validation
      if (!this.isValidImageFormat(imageBuffer)) {
        throw new ValidationError(
          `Invalid image format for image ${imageId}`,
          'Image does not have valid magic bytes for supported formats'
        )
      }
      
      return imageBuffer
      
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }
      throw new ValidationError(
        `Failed to decode base64 for image ${imageId}`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  
  private static isValidImageFormat(buffer: Uint8Array): boolean {
    if (buffer.length < 8) return false
    
    const magicBytes = Array.from(buffer.slice(0, 8))
    
    // JPEG: FF D8 FF
    if (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF) {
      return true
    }
    
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && 
        magicBytes[2] === 0x4E && magicBytes[3] === 0x47) {
      return true
    }
    
    // GIF: 47 49 46 38
    if (magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && 
        magicBytes[2] === 0x46 && magicBytes[3] === 0x38) {
      return true
    }
    
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && 
        magicBytes[2] === 0x46 && magicBytes[3] === 0x46) {
      return true
    }
    
    // BMP: 42 4D
    if (magicBytes[0] === 0x42 && magicBytes[1] === 0x4D) {
      return true
    }
    
    return false
  }
}

// Request validator with strict typing
function validateBulkRequest(body: unknown): BulkModerationRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError(
      'Invalid request body',
      'Request body must be a valid JSON object'
    )
  }
  
  const request = body as Record<string, unknown>
  
  if (!request.storagePaths || !Array.isArray(request.storagePaths)) {
    throw new ValidationError(
      'Missing storagePaths array',
      'Request must contain a storagePaths array'
    )
  }
  
  if (!request.bucketPath || typeof request.bucketPath !== 'string') {
    throw new ValidationError(
      'Missing bucketPath',
      'Request must contain a valid bucketPath string'
    )
  }
  
  if (!request.userId || typeof request.userId !== 'string') {
    throw new ValidationError(
      'Missing userId',
      'Request must contain a valid userId string'
    )
  }
  
  if (!request.totalImages || typeof request.totalImages !== 'number') {
    throw new ValidationError(
      'Missing totalImages',
      'Request must contain a valid totalImages number'
    )
  }
  
  if (request.storagePaths.length === 0) {
    throw new ValidationError(
      'Empty storagePaths array',
      'At least one storage path is required'
    )
  }
  
  if (request.storagePaths.length > CONFIG.MAX_BATCH_SIZE) {
    throw new ValidationError(
      'Batch too large',
      `Maximum batch size is ${CONFIG.MAX_BATCH_SIZE} images`
    )
  }
  
  // Validate storage paths
  for (let i = 0; i < request.storagePaths.length; i++) {
    const path = request.storagePaths[i]
    if (!path || typeof path !== 'string') {
      throw new ValidationError(
        `Invalid storage path at index ${i}`,
        'Each storage path must be a valid string'
      )
    }
  }
  
  return {
    storagePaths: request.storagePaths as string[],
    bucketPath: request.bucketPath as string,
    userId: request.userId as string,
    totalImages: request.totalImages as number,
    settings: request.settings as BulkModerationRequest['settings']
  }
}

// Error response handler with strict typing
function getErrorResponse(error: unknown, requestId?: string): { status: number; body: ErrorResponse } {
  logWithContext('ERROR', 'Creating error response', {
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
    requestId,
  })
  
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: error.message,
        details: error.details,
        type: 'validation_error',
        request_id: requestId || 'unknown',
      }
    }
  }
  
  if (error instanceof ConfigurationError) {
    return {
      status: 500,
      body: {
        error: error.message,
        details: error.details,
        type: 'configuration_error',
        request_id: requestId || 'unknown',
      }
    }
  }
  
  if (error instanceof AWSError) {
    return {
      status: 502,
      body: {
        error: error.message,
        details: error.awsErrorCode ? `AWS Error Code: ${error.awsErrorCode}` : undefined,
        type: 'aws_error',
        request_id: requestId || 'unknown',
      }
    }
  }
  
  if (error instanceof RekognitionServiceException) {
    // Type guard to safely access error properties
    const errorName = (error as any).name || 'UnknownRekognitionError';
    const errorMessage = (error as any).message || 'Unknown AWS Rekognition error';
    
    const statusMap: Record<string, number> = {
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
      status: statusMap[errorName] || 500,
      body: {
        error: errorMessage,
        details: `AWS Rekognition error: ${errorName}`,
        type: 'aws_rekognition_error',
        request_id: requestId || 'unknown',
      }
    }
  }

  
  // Generic error fallback
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      details: 'An unexpected error occurred while processing your request',
      type: 'internal_error',
      request_id: requestId || 'unknown',
    }
  }
}

// Performance monitor for tracking processing times
class PerformanceMonitor {
  private readonly startTime: number;
  private readonly checkpoints: Map<string, number> = new Map();
  
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
}

// Main request handler
serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const monitor = new PerformanceMonitor();
  
  logWithContext('INFO', 'Incoming bulk submit request', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers.get('User-Agent') || 'unknown',
    contentType: req.headers.get('Content-Type') || 'unknown',
  });
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    logWithContext('INFO', 'CORS preflight handled', { requestId });
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    });
  }
  
  // Only allow POST requests
  if (req.method !== "POST") {
    logWithContext('ERROR', 'Method not allowed', { 
      method: req.method, 
      requestId 
    });
    
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        details: 'Only POST requests are supported',
        type: 'method_error',
        request_id: requestId,
      } satisfies ErrorResponse),
      {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      }
    );
  }
  
  try {
    // Validate AWS environment early
    monitor.checkpoint('aws_validation_start');
    AWSClientManager.validateEnvironment();
    monitor.checkpoint('aws_validation_complete');
    
    // Initialize Supabase client
    monitor.checkpoint('supabase_init_start');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new ConfigurationError(
        'Supabase configuration missing',
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required'
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    monitor.checkpoint('supabase_init_complete');

    // Parse and validate request
    monitor.checkpoint('request_parsing_start');
    let rawBody: string;
    try {
      // ✅ Add detailed logging before reading body
      logWithContext('INFO', 'About to read request body', {
        requestId,
        method: req.method,
        contentType: req.headers.get('Content-Type'),
        contentLength: req.headers.get('Content-Length'),
        hasBody: req.body !== null,
        bodyReadable: req.bodyUsed === false
      });

      rawBody = await req.text();

      
      logWithContext('INFO', 'Request body read successfully', {
        requestId,
        bodyLength: rawBody.length,

        bodyPreview: rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : ''),
        bodyType: typeof rawBody,
        isEmpty: rawBody.length === 0,
        isWhitespace: rawBody.trim().length === 0
      });
      
    } catch (parseError) {
      logWithContext('ERROR', 'Failed to read request body', {
        requestId,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        parseErrorName: parseError instanceof Error ? parseError.name : 'Unknown'
      });
      
      throw new ValidationError(
        'Failed to read request body',
        parseError instanceof Error ? parseError.message : 'Unknown parsing error'
      );
    }


    // ✅ Add validation before JSON parsing
    if (!rawBody || rawBody.trim().length === 0) {
      logWithContext('ERROR', 'Empty request body detected', {
        requestId,
        rawBodyLength: rawBody?.length || 0,
        rawBodyContent: rawBody || 'null/undefined'
      });
      
      throw new ValidationError(
        'Empty request body',
        'Request body is empty or contains only whitespace'
      );
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
      
      logWithContext('INFO', 'JSON parsing successful', {
        requestId,
        parsedBodyType: typeof parsedBody,
        isObject: typeof parsedBody === 'object' && parsedBody !== null,
        hasImages: parsedBody && typeof parsedBody === 'object' && 'images' in parsedBody,
        hasUserId: parsedBody && typeof parsedBody === 'object' && 'userId' in parsedBody
      });
      
    } catch (jsonError) {
      logWithContext('ERROR', 'JSON parsing failed', {
        requestId,
        jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
        rawBodySample: rawBody.substring(0, 200)
      });
      
      throw new ValidationError(
        'Invalid JSON in request body',
        jsonError instanceof Error ? jsonError.message : 'JSON parsing failed'
      );
    }
    
    const request = validateBulkRequest(parsedBody);
    monitor.checkpoint('request_parsing_complete');
    
    logWithContext('INFO', 'Request validated successfully', {
      requestId,
      userId: request.userId,
      imageCount: request.storagePaths.length,
      hasSettings: !!request.settings,
      validationTime: monitor.getCheckpointTime('request_parsing_complete')
    });

    // Create job record
    monitor.checkpoint('job_creation_start');
    const bucketPath = `bulk-${Date.now()}-${request.userId}`;
    
    const { data: job, error: jobError } = await supabase
      .from('nsfw_bulk_jobs')
      .insert({
        user_id: request.userId,
        total_images: request.storagePaths.length,
        bucket_path: request.bucketPath,
        status: 'submitted' as const
      })
      .select()
      .single();

    if (jobError) {
      logWithContext('ERROR', 'Failed to create job record', { 
        jobError: jobError.message,
        requestId 
      });
      throw new Error(`Failed to create job record: ${jobError.message}`);
    }

    const jobId = job.id as string;
    monitor.checkpoint('job_creation_complete');
    
    logWithContext('INFO', 'Job record created', {
      requestId,
      jobId,
      bucketPath,
      creationTime: monitor.getCheckpointTime('job_creation_complete')
    });

    // Validate and upload all images concurrently
    monitor.checkpoint('storage_validation_start');

    // ✅ Validate that all files exist in nsfw-temp-processing bucket
    logWithContext('INFO', 'Validating uploaded files in storage', {
      requestId,
      bucketPath: request.bucketPath,
      fileCount: request.storagePaths.length
    });

    // Verify files exist in storage
    const { data: files, error: listError } = await supabase.storage
      .from('nsfw-temp-processing')
      .list(request.bucketPath);

    if (listError) {
      throw new Error(`Failed to list files in bucket: ${listError.message}`);
    }

    if (!files || files.length === 0) {
      throw new ValidationError(
        'No files found in storage',
        `No files found in bucket path: ${request.bucketPath}`
      );
    }

    const uploadedFileNames = files.map(f => `${request.bucketPath}/${f.name}`);
    const missingFiles = request.storagePaths.filter(path => !uploadedFileNames.includes(path));

    if (missingFiles.length > 0) {
      throw new ValidationError(
        'Missing files in storage',
        `Files not found: ${missingFiles.slice(0, 5).join(', ')}${missingFiles.length > 5 ? '...' : ''}`
      );
    }

    monitor.checkpoint('storage_validation_complete');

    logWithContext('INFO', 'All files validated in nsfw-temp-processing bucket', {
      requestId,
      validatedCount: request.storagePaths.length,
      bucketPath: request.bucketPath,
      validationTime: monitor.getCheckpointTime('storage_validation_complete') - 
                  monitor.getCheckpointTime('storage_validation_start')
    });

    // Update job status to submitted
    monitor.checkpoint('job_update_start');
    const { error: updateError } = await supabase
      .from('nsfw_bulk_jobs')
      .update({ 
        status: 'submitted' as const, 
        submitted_at: new Date().toISOString() 
      })
      .eq('id', jobId);
      
    if (updateError) {
      logWithContext('WARN', 'Failed to update job status to submitted', {
        updateError: updateError.message,
        requestId
      });
    }
    monitor.checkpoint('job_update_complete');

    // Start AWS bulk processing job
    monitor.checkpoint('aws_job_start');
    try {
      const awsJobId = await AWSClientManager.startBulkModerationJob(
        request.bucketPath, 
        jobId, 
        request.storagePaths  // ✅ Pass storage paths for manifest creation
      );
      monitor.checkpoint('aws_job_complete');
      
      // Update job with AWS job ID
      const { error: awsUpdateError } = await supabase
        .from('nsfw_bulk_jobs')
        .update({ 
          s3_job_id: awsJobId,
          status: 'processing' as const
        })
        .eq('id', jobId);
        
      if (awsUpdateError) {
        logWithContext('WARN', 'Failed to update job with AWS job ID', {
          awsUpdateError: awsUpdateError.message,
          requestId
        });
      }

      const totalProcessingTime = monitor.getElapsedMs();
      
      logWithContext('INFO', 'Bulk job submission completed successfully', {
        requestId,
        jobId,
        awsJobId,
        totalImages: request.storagePaths.length,
        totalProcessingTime,
        storageValidationTime: monitor.getCheckpointTime('storage_validation_complete') - 
                        monitor.getCheckpointTime('storage_validation_start'),
        awsJobTime: monitor.getCheckpointTime('aws_job_complete') - 
                   monitor.getCheckpointTime('aws_job_start')
      });

      const response: BulkModerationResponse = {
        jobId,
        awsJobId,
        status: 'processing',
        totalImages: request.storagePaths.length,
        request_id: requestId
      };

      return new Response(
        JSON.stringify(response),
        { 
          headers: { 
            ...CORS_HEADERS, 
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            'X-Processing-Time': totalProcessingTime.toString()
          },
          status: 200 
        }
      );
      
    } catch (awsError) {
      monitor.checkpoint('aws_job_failed');
      
      logWithContext('ERROR', 'AWS job submission failed', { 
        awsError: awsError instanceof Error ? awsError.message : String(awsError),
        requestId,
        awsJobTime: monitor.getCheckpointTime('aws_job_failed') - 
                   monitor.getCheckpointTime('aws_job_start')
      });
      
      // Update job status to failed
      await supabase
        .from('nsfw_bulk_jobs')
        .update({ 
          status: 'failed' as const,
          error_message: awsError instanceof Error ? awsError.message : 'AWS job submission failed'
        })
        .eq('id', jobId);
      
      throw awsError;
    }

  } catch (error) {
    const totalProcessingTime = monitor.getElapsedMs();
    
    logWithContext('ERROR', 'Bulk submission failed', {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      requestId,
      totalProcessingTime,
      stack: error instanceof Error ? error.stack?.substring(0, 1000) : undefined,
    });
    
    const errorResponse = getErrorResponse(error, requestId);
    
    return new Response(
      JSON.stringify({
        ...errorResponse.body,
        processing_time_ms: totalProcessingTime
      }),
      {
        status: errorResponse.status,
        headers: { 
          ...CORS_HEADERS, 
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Processing-Time': totalProcessingTime.toString()
        }
      }
    );
  }
});

// Health check endpoint
serve(async (req: Request): Promise<Response> => {
  if (req.method === "GET" && new URL(req.url).pathname === "/health") {
    logWithContext('INFO', 'Health check requested');
    
    try {
      // Quick environment validation
      const { region } = AWSClientManager.validateEnvironment();
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      const healthStatus = {
        status: "healthy" as const,
        timestamp: new Date().toISOString(),
        version: "3.0.0",
        environment: {
          hasAwsCredentials: true,
          awsRegion: region,
          hasSupabaseConfig: !!(supabaseUrl && supabaseServiceKey),
        },
        config: {
          maxImageSizeMB: CONFIG.MAX_IMAGE_SIZE_MB,
          maxBatchSize: CONFIG.MAX_BATCH_SIZE,
          requestTimeoutMs: CONFIG.REQUEST_TIMEOUT_MS,
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
          status: "unhealthy" as const,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        }),
        {
          status: 503,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      );
    }
  }
  
  // If not a health check, continue with normal processing
  // This allows the main handler to process the request
  throw new Error('Route not found');
});

// Export types for testing/external use
export type {
  BulkModerationRequest,
  BulkJobRecord,
  BulkModerationResponse,
  ErrorResponse
};

// Export classes for testing
export {
  AWSClientManager,
  ImageValidator,
  PerformanceMonitor,
  ValidationError,
  ConfigurationError,
  AWSError
};
