import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  StartMediaAnalysisJobCommand,
} from "npm:@aws-sdk/client-rekognition@^3.840.0"
import { 
  S3Client,
  ListObjectsV2Command as S3ListObjectsV2Command,
  HeadObjectCommand,
  HeadBucketCommand,
  GetBucketLocationCommand,
} from "npm:@aws-sdk/client-s3@^3.840.0"

// Interfaces
interface BulkSubmitRequest {
  jobId: string
  bucketName: string
  userId: string
  settings?: {
    confidence_threshold?: number
    categories?: string[]
  }
}

interface BulkSubmitResponse {
  jobId: string
  awsJobId: string
  awsBucketName: string
  status: string
  request_id: string
}

interface ErrorResponse {
  error: string
  details?: string
  type: string
  request_id: string
}

interface AWSError {
  name: string;
  message: string;
  Code?: string;
  $fault?: string;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    extendedRequestId?: string;
    cfId?: string;
    attempts?: number;
    totalRetryDelay?: number;
  };
}

// Constants
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

// AWS Clients
function getRekognitionClient(): RekognitionClient {
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  console.log(`🔧 Initializing Rekognition client in region: ${region}`);
  return new RekognitionClient({
    region,
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  });
}

function getS3Client(): S3Client {
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  console.log(`🔧 Initializing S3 client in region: ${region}`);
  return new S3Client({
    region,
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  });
}

// Helper function to get Rekognition service role
function ensureRekognitionServiceRole(requestId: string): string {
  try {
    // Check both possible environment variable names
    const roleArn = Deno.env.get('AWS_REKOGNITION_SERVICE_ROLE_ARN') || Deno.env.get('AWS_REKOGNITION_ROLE_ARN');
    if (roleArn) {
      // CRITICAL: Validate that the role ARN is actually an ARN, not a URL
      if (roleArn.startsWith('arn:aws:iam::')) {
        console.log(`🔑 [${requestId}] Using configured Rekognition service role: ${roleArn}`);
        return roleArn;
      } else {
        console.error(`❌ [${requestId}] Invalid service role ARN format: ${roleArn} (expected arn:aws:iam::...)`);
        console.error(`❌ [${requestId}] This looks like a URL, not an IAM role ARN!`);
      }
    }
    
    const accountId = Deno.env.get('AWS_ACCOUNT_ID');
    if (accountId) {
      const defaultRoleArn = `arn:aws:iam::${accountId}:role/RekognitionServiceRole`;
      console.log(`🔑 [${requestId}] Using default Rekognition service role: ${defaultRoleArn}`);
      return defaultRoleArn;
    }
    
    // HARDCODED FIX: Use the account ID from your logs since we know it
    const knownAccountId = '072928014978';
    const fixedRoleArn = `arn:aws:iam::${knownAccountId}:role/RekognitionServiceRole`;
    console.warn(`⚠️ [${requestId}] Using hardcoded account ID for service role: ${fixedRoleArn}`);
    console.warn(`⚠️ [${requestId}] To fix this properly, set AWS_ACCOUNT_ID environment variable to: ${knownAccountId}`);
    
    return fixedRoleArn;
    
  } catch (error) {
    // Fallback with known account ID
    const knownAccountId = '072928014978';
    const fallbackRoleArn = `arn:aws:iam::${knownAccountId}:role/RekognitionServiceRole`;
    console.error(`❌ [${requestId}] Failed to determine service role, using hardcoded fallback: ${fallbackRoleArn}`, error);
    return fallbackRoleArn;
  }
}

// Helper functions
function generateRequestId(): string {
  return `submit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ENHANCED: Verify S3 bucket and objects exist before starting Rekognition
async function verifyS3BucketAndObjects(bucketName: string, requestId: string): Promise<{
  exists: boolean;
  objectCount: number;
  objects: string[];
  error?: string;
}> {
  try {
    const region = Deno.env.get('AWS_REGION') || 'us-east-1';
    console.log(`🔍 [${requestId}] Verifying S3 bucket: ${bucketName} in region: ${region}`);
    
    const s3Client = getS3Client();
    
    // First, check bucket region and accessibility
    try {
      await s3Client.send(new HeadBucketCommand({
        Bucket: bucketName
      }));
      console.log(`🌍 [${requestId}] Bucket ${bucketName} is accessible from region: ${region}`);
      
      // Try to get the actual bucket location
      try {
        const locationResponse = await s3Client.send(new GetBucketLocationCommand({
          Bucket: bucketName
        }));
        const bucketRegion = locationResponse.LocationConstraint || 'us-east-1';
        console.log(`🌍 [${requestId}] Bucket ${bucketName} actual region: ${bucketRegion}`);
        
        if (bucketRegion !== region) {
          console.warn(`⚠️ [${requestId}] REGION MISMATCH: Bucket is in ${bucketRegion} but client is configured for ${region}`);
        }
      } catch (locationError) {
        console.warn(`⚠️ [${requestId}] Could not get bucket location:`, locationError);
      }
    } catch (headError) {
      console.error(`❌ [${requestId}] Bucket ${bucketName} not accessible:`, headError);
      return {
        exists: false,
        objectCount: 0,
        objects: [],
        error: `Bucket not accessible: ${headError instanceof Error ? headError.message : String(headError)}`
      };
    }
    
    // List objects in the input folder
    const listCommand = new S3ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'input/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    const objects = response.Contents || [];
    const objectKeys = objects
      .map(obj => obj.Key ?? '')
      .filter(key => key.endsWith('.jpg') || key.endsWith('.jpeg') || key.endsWith('.png'));
    
    console.log(`📊 [${requestId}] S3 verification results:`);
    console.log(`   - Bucket: ${bucketName}`);
    console.log(`   - Client Region: ${region}`);
    console.log(`   - Total objects: ${objects.length}`);
    console.log(`   - Image objects: ${objectKeys.length}`);
    console.log(`   - Object keys: ${objectKeys.slice(0, 5).join(', ')}${objectKeys.length > 5 ? '...' : ''}`);
    
    if (objectKeys.length === 0) {
      return {
        exists: false,
        objectCount: 0,
        objects: [],
        error: `No image files found in bucket ${bucketName}/input/`
      };
    }
    
    // Verify a few objects exist and are accessible
    const sampleKeys = objectKeys.slice(0, 3);
    for (const key of sampleKeys) {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: bucketName,
          Key: key
        });
        const headResponse = await s3Client.send(headCommand);
        console.log(`✅ [${requestId}] Verified object exists: ${key} (size: ${headResponse.ContentLength || 0} bytes)`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ [${requestId}] Object not accessible: ${key}`, error);
        return {
          exists: false,
          objectCount: objectKeys.length,
          objects: objectKeys,
          error: `Object ${key} not accessible: ${errorMessage}`
        };
      }
    }
    
    return {
      exists: true,
      objectCount: objectKeys.length,
      objects: objectKeys
    };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${requestId}] S3 verification failed:`, error);
    return {
      exists: false,
      objectCount: 0,
      objects: [],
      error: `S3 verification failed: ${errorMessage}`
    };
  }
}

// ENHANCED: Cleanup function with better error handling
async function cleanupTempBucket(bucketName: string, requestId: string, reason: string): Promise<void> {
  try {
    console.log(`🧹 [${requestId}] Initiating cleanup for temp bucket: ${bucketName} (reason: ${reason})`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data, error } = await supabase.functions.invoke('cleanup-temp-buckets', {
      body: {
        bucketName,
        force: true,
        reason
      }
    });

    if (error) {
      console.error(`❌ [${requestId}] Failed to cleanup temp bucket:`, error);
    } else {
      console.log(`✅ [${requestId}] Temp bucket cleanup initiated:`, data);
    }
    
  } catch (error: unknown) {
    console.error(`❌ [${requestId}] Error calling cleanup function:`, error);
  }
}

// ENHANCED: Error response helper with better cleanup coordination
function createErrorResponse(
  error: string,
  details: string,
  type: string,
  requestId: string,
  status: number,
  bucketName?: string,
  skipCleanup: boolean = false
): Response {
  console.error(`🚨 [${requestId}] Creating error response: ${error} (${type}) - Status: ${status}`);
  console.error(`🚨 [${requestId}] Error details: ${details}`);
  
  // FIXED: Only cleanup if explicitly requested and not already in progress
  if (bucketName && !skipCleanup) {
    console.log(`🧹 [${requestId}] Scheduling cleanup for bucket: ${bucketName}`);
    // Don't await cleanup to avoid blocking the error response
    cleanupTempBucket(bucketName, requestId, `Error: ${error}`).catch(cleanupError => {
      console.error(`❌ [${requestId}] Cleanup failed:`, cleanupError);
    });
  }
  
  return new Response(JSON.stringify({
    error,
    details,
    type,
    request_id: requestId
  } as ErrorResponse), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ENHANCED: Main handler with comprehensive logging
serve(async (req: Request): Promise<Response> => {
  const requestId = generateRequestId();
  let bucketName: string | null = null;
  
  // VIRTUAL IMAGE INTEGRATION: Log bulk processing flow
  console.log(`🔍 [FLOW-TRACE] [${requestId}] bulk-nsfw-submit: Starting Rekognition job submission`);
  console.log(`🔍 [FLOW-TRACE] [${requestId}] Method: ${req.method}, URL: ${req.url}`);
  
  console.log(`🚀 [${requestId}] === BULK NSFW SUBMIT START ===`);
  console.log(`🚀 [${requestId}] Method: ${req.method}`);
  console.log(`🚀 [${requestId}] URL: ${req.url}`);
  
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      console.log(`✅ [${requestId}] Handling CORS preflight`);
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    if (req.method !== 'POST') {
      return createErrorResponse(
        'Method not allowed',
        'Only POST method is allowed',
        'METHOD_NOT_ALLOWED',
        requestId,
        405,
        undefined // Add missing bucketName parameter
      );
    }

    // Parse request
    let body: BulkSubmitRequest;
    try {
      const requestText = await req.text();
      console.log(`📥 [${requestId}] Request body: ${requestText}`);
      body = JSON.parse(requestText);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      return createErrorResponse(
        'Invalid JSON in request body',
        errorMessage,
        'VALIDATION_ERROR',
        requestId,
        400,
        undefined // Add missing bucketName parameter
      );
    }

    const { jobId, bucketName: requestBucketName, userId, settings } = body;
    bucketName = requestBucketName;

    console.log(`📋 [${requestId}] Parsed request:`);
    console.log(`   - Job ID: ${jobId}`);
    console.log(`   - Bucket: ${bucketName}`);
    console.log(`   - User ID: ${userId}`);
    console.log(`   - Settings: ${JSON.stringify(settings)}`);

    // Validation
    if (!jobId) {
      return createErrorResponse(
        'jobId is required',
        'jobId parameter is missing',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName || undefined // Add missing bucketName parameter
      );
    }

    if (!bucketName) {
      return createErrorResponse(
        'bucketName is required',
        'bucketName parameter is missing',
        'VALIDATION_ERROR',
        requestId,
        400,
        undefined // bucketName is null here, so pass undefined
      );
    }

    if (!userId) {
      return createErrorResponse(
        'userId is required',
        'userId parameter is missing',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName || undefined // Add missing bucketName parameter
      );
    }

    // Initialize clients
    console.log(`🔧 [${requestId}] Initializing clients...`);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    let rekognitionClient: RekognitionClient;
    try {
      rekognitionClient = getRekognitionClient();
      console.log(`✅ [${requestId}] Rekognition client initialized`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown AWS initialization error';
      console.error(`❌ [${requestId}] Failed to initialize Rekognition client:`, error);
      return createErrorResponse(
        'Failed to initialize AWS Rekognition client',
        errorMessage,
        'AWS_ERROR',
        requestId,
        500,
        bucketName
      );
    }

    // Verify job exists and is in correct state
    console.log(`🔍 [${requestId}] Verifying job: ${jobId}`);
    const { data: jobData, error: jobError } = await supabase
      .from('nsfw_bulk_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobError || !jobData) {
      console.error(`❌ [${requestId}] Job verification failed:`, jobError);
      return createErrorResponse(
        'Job not found',
        `Job ${jobId} not found or access denied: ${jobError?.message || 'Unknown error'}`,
        'NOT_FOUND',
        requestId,
        404,
        bucketName
      );
    }

    console.log(`📊 [${requestId}] Job data:`, {
      id: jobData.id,
      status: jobData.status,
      total_images: jobData.total_images,
      processed_images: jobData.processed_images,
      aws_temp_bucket: jobData.aws_temp_bucket,
      created_at: jobData.created_at,
      updated_at: jobData.updated_at
    });

    if (!['uploaded', 'uploading'].includes(jobData.status)) {
      console.error(`❌ [${requestId}] Invalid job status: ${jobData.status}`);
      return createErrorResponse(
        'Invalid job status',
        `Job status is ${jobData.status}, expected 'uploaded' or 'uploading'`,
        'INVALID_STATUS',
        requestId,
        400,
        bucketName
      );
    }

    // CRITICAL: Verify S3 bucket and objects exist before starting Rekognition
    console.log(`🔍 [${requestId}] Verifying S3 bucket and objects...`);
    const s3Verification = await verifyS3BucketAndObjects(bucketName, requestId);
    
    if (!s3Verification.exists) {
      console.error(`❌ [${requestId}] S3 verification failed: ${s3Verification.error}`);
      return createErrorResponse(
        'S3 bucket or objects not accessible',
        s3Verification.error || 'Unknown S3 error',
        'S3_ERROR',
        requestId,
        400,
        bucketName,
        true // Skip cleanup since bucket might already be gone
      );
    }

    console.log(`✅ [${requestId}] S3 verification passed: ${s3Verification.objectCount} images found`);

    // Start AWS Rekognition bulk analysis job
    console.log(`🔍 [${requestId}] Starting AWS Rekognition bulk analysis job`);
    
    try {
      const rekognitionJobName = `nsfw-bulk-${jobId}-${Date.now()}`;
      console.log(`🏷️ [${requestId}] Rekognition job name: ${rekognitionJobName}`);
      
      // Get service role - using the function defined at the top level
      const serviceRole = ensureRekognitionServiceRole(requestId);
      
      console.log(`🔧 [${requestId}] Analysis configuration:`, {
        serviceRole: serviceRole ? 'Configured' : 'Missing',
        operations: ['DetectModerationLabels']
      });
      
      // Check if manifest exists
      const manifestKey = jobData.manifest_key || 'manifest.jsonl';
      
      // Add this after the Rekognition client initialization and before the manifest check
      let s3Client: S3Client;
      try {
        s3Client = getS3Client();
        console.log(`✅ [${requestId}] S3 client initialized`);
      } catch (error) {
        console.error(`❌ [${requestId}] Failed to initialize S3 client:`, error);
        return createErrorResponse(
          'Failed to initialize S3 client',
          error instanceof Error ? error.message : 'Unknown S3 initialization error',
          'S3_ERROR',
          requestId,
          500,
          bucketName
        );
      }

      // Now you can use s3Client for the HeadObjectCommand
      try {
        await s3Client.send(new HeadObjectCommand({
          Bucket: bucketName,
          Key: manifestKey
        }));
        console.log(`✅ [${requestId}] Manifest file verified: ${manifestKey}`);
      } catch (manifestError) {
        console.error(`❌ [${requestId}] Manifest file not found: ${manifestKey}`, manifestError);
        throw new Error(`Manifest file not found: ${manifestKey}. Upload session may not be complete.`);
      }
      
      console.log(`📋 [${requestId}] Rekognition job configuration:`);
      console.log(`   - Job Name: ${rekognitionJobName}`);
      console.log(`   - Bucket: ${bucketName}`);
      console.log(`   - Manifest: ${manifestKey}`);
      console.log(`   - Service Role: ${serviceRole || 'NONE'}`);
      console.log(`   - Objects to process: ${s3Verification.objectCount}`);
      
      // Build operations config - only moderation labels for NSFW detection
      const operationsConfig = {
        DetectModerationLabels: {
          MinConfidence: settings?.confidence_threshold || 45, // Lowered from 60 to catch more borderline content
        }
      };
      
      console.log(`🎯 [${requestId}] Basic NSFW moderation analysis enabled - DetectModerationLabels only`);
      
      const rekognitionCommand = new StartMediaAnalysisJobCommand({
        JobName: rekognitionJobName,
        OperationsConfig: operationsConfig,
        Input: {
          S3Object: {
            Bucket: bucketName,
            Name: manifestKey, // Point to manifest file, not folder
          }
        },
        OutputConfig: {
          S3Bucket: bucketName,
          S3KeyPrefix: 'output/'
        }
        // Note: ServiceRole is not supported in StartMediaAnalysisJobCommand
      });

      // CRITICAL DEBUG: Log exact operations config being sent to AWS
      console.log(`🚀 [${requestId}] Sending basic NSFW moderation analysis command:`, {
        JobName: rekognitionJobName,
        Bucket: bucketName,
        ManifestFile: manifestKey,
        OutputPrefix: 'output/',
        ServiceRole: serviceRole,
        OperationsConfig: JSON.stringify(operationsConfig, null, 2)
      });

      console.log(`🔍 [${requestId}] EXACT AWS Command being sent:`, JSON.stringify({
        JobName: rekognitionJobName,
        OperationsConfig: operationsConfig,
        Input: { S3Object: { Bucket: bucketName, Name: manifestKey } },
        OutputConfig: { S3Bucket: bucketName, S3KeyPrefix: 'output/' },
        ServiceRole: serviceRole
      }, null, 2));

      const rekognitionResponse = await rekognitionClient.send(rekognitionCommand);
      const awsJobId = rekognitionResponse.JobId!;

      console.log(`✅ [${requestId}] AWS Rekognition NSFW moderation job started:`);
      console.log(`   - AWS Job ID: ${awsJobId}`);
      console.log(`   - Analysis Type: Moderation Labels Only`);
      console.log(`   - Manifest: ${bucketName}/${manifestKey}`);
      console.log(`   - Output: ${bucketName}/output/`);
      console.log(`   - Images to process: ${s3Verification.objectCount}`);

      // INTEGRATION POINT: Basic NSFW processing only - no virtual image creation needed
      console.log(`📍 [INTEGRATION-POINT] [${requestId}] Rekognition NSFW job started - basic moderation only`);
      console.log(`📍 [INTEGRATION-POINT] [${requestId}] Job details: jobId=${jobId}, awsJobId=${awsJobId}, bucket=${bucketName}`);

      // Update database with AWS job ID and status
      console.log(`💾 [${requestId}] Updating database with AWS job ID...`);
      const { error: updateError } = await supabase
        .from('nsfw_bulk_jobs')
        .update({
          aws_job_id: awsJobId,
          status: 'processing',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (updateError) {
        console.error(`❌ [${requestId}] Database update failed:`, updateError);
        // Don't fail the request since Rekognition job is already started
        console.warn(`⚠️ [${requestId}] Continuing despite database update failure`);
      } else {
        console.log(`✅ [${requestId}] Database updated successfully`);
      }

      // SUCCESS - return response
      const successResponse = {
        jobId,
        awsJobId,
        awsBucketName: bucketName,
        status: 'processing',
        request_id: requestId
      } as BulkSubmitResponse;

      console.log(`🎉 [${requestId}] === BULK NSFW SUBMIT SUCCESS ===`);
      console.log(`🎉 [${requestId}] Response:`, successResponse);
      
      // FLOW TRACE: Log successful completion
      console.log(`🔍 [FLOW-TRACE] [${requestId}] bulk-nsfw-submit: Request completed successfully`);
      console.log(`🔍 [FLOW-TRACE] [${requestId}] Next step: bulk-nsfw-status will monitor jobId=${jobId}, awsJobId=${awsJobId}`);
      console.log(`🔍 [FLOW-TRACE] [${requestId}] Processing: Basic NSFW moderation only - no virtual image management`);

      return new Response(JSON.stringify(successResponse), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });

    } catch (rekognitionError: unknown) {
      console.error(`❌ [${requestId}] AWS Rekognition error details:`);
      
      // Cast to AWSError for better type safety
      const awsError = rekognitionError as AWSError;
      
      console.error(`   - Error name: ${awsError.name || 'Unknown'}`);
      console.error(`   - Error message: ${awsError.message || 'Unknown message'}`);
      console.error(`   - Error code: ${awsError.Code || 'N/A'}`);
      console.error(`   - HTTP status: ${awsError.$metadata?.httpStatusCode || 'N/A'}`);
      console.error(`   - Request ID: ${awsError.$metadata?.requestId || 'N/A'}`);
      console.error(`   - Full error:`, rekognitionError);

      // Enhanced error handling for specific Rekognition errors
      let errorMessage = 'Unknown AWS Rekognition error';
      let errorType = 'AWS_ERROR';

      if (awsError.name === 'InvalidParameterException') {
        if (awsError.message?.includes('Unable to get object metadata from S3')) {
          errorMessage = `S3 objects not accessible. Bucket: ${bucketName}, Objects: ${s3Verification.objectCount}`;
          errorType = 'S3_ACCESS_ERROR';
          
          // Re-verify S3 access
          console.log(`🔍 [${requestId}] Re-verifying S3 access after Rekognition error...`);
          const reVerification = await verifyS3BucketAndObjects(bucketName, requestId);
          if (!reVerification.exists) {
            errorMessage += `. Re-verification failed: ${reVerification.error}`;
          }
        } else if (awsError.message?.includes('region')) {
          errorMessage = `AWS region mismatch. Check bucket region vs Rekognition region.`;
          errorType = 'REGION_ERROR';
        } else {
          errorMessage = `Invalid parameters: ${awsError.message || 'Unknown parameter error'}`;
          errorType = 'PARAMETER_ERROR';
        }
      } else if (awsError.name === 'AccessDeniedException') {
        errorMessage = `AWS access denied. Check IAM permissions for Rekognition and S3.`;
        errorType = 'ACCESS_DENIED';
      } else if (awsError.name === 'LimitExceededException') {
        errorMessage = `AWS Rekognition limit exceeded. Try again later.`;
        errorType = 'RATE_LIMIT';
      } else {
        errorMessage = `AWS Rekognition error: ${awsError.message || String(rekognitionError)}`;
      }

      // Update job status to failed
      try {
        await supabase
          .from('nsfw_bulk_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        console.log(`💾 [${requestId}] Job status updated to failed`);
      } catch (dbError) {
        console.error(`❌ [${requestId}] Failed to update job status:`, dbError);
      }

      return createErrorResponse(
        'AWS Rekognition error',
        errorMessage,
        errorType,
        requestId,
        500,
        bucketName
      );
    }

  } catch (error) {
    console.error(`❌ [${requestId}] Unexpected error:`, error);
    
    // Type guard for Error objects to safely access stack
    if (error instanceof Error) {
      console.error(`❌ [${requestId}] Error stack:`, error.stack);
    }
    
    return createErrorResponse(
      'Internal server error',
      error instanceof Error ? error.message : 'Unknown error',
      'INTERNAL_ERROR',
      requestId,
      500,
      bucketName || undefined // Convert null to undefined
    );
  }
});
