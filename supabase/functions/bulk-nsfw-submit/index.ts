import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  StartMediaAnalysisJobCommand,
} from "npm:@aws-sdk/client-rekognition@^3.840.0"

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

// Constants
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

// AWS Client
function getRekognitionClient(): RekognitionClient {
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  return new RekognitionClient({
    region,
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  });
}

// Helper functions
function generateRequestId(): string {
  return `submit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Cleanup function
async function cleanupTempBucket(bucketName: string): Promise<void> {
  try {
    console.log(`🧹 Initiating cleanup for temp bucket: ${bucketName}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data, error } = await supabase.functions.invoke('cleanup-temp-buckets', {
      body: {
        bucketName,
        force: true
      }
    });

    if (error) {
      console.error('❌ Failed to cleanup temp bucket:', error);
    } else {
      console.log('✅ Temp bucket cleanup initiated:', data);
    }
    
  } catch (error) {
    console.error('❌ Error calling cleanup function:', error);
  }
}

// Error response helper with cleanup
async function createErrorResponse(
  error: string,
  details: string,
  type: string,
  requestId: string,
  status: number,
  bucketName?: string
): Promise<Response> {
  if (bucketName) {
    console.log(`🧹 Cleaning up bucket due to error: ${bucketName}`);
    await cleanupTempBucket(bucketName);
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

// Main handler
serve(async (req: Request): Promise<Response> => {
  const requestId = generateRequestId();
  let bucketName: string | null = null;
  
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
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
        405
      );
    }

    // Parse request
    let body: BulkSubmitRequest;
    try {
      body = await req.json();
    } catch (error) {
      return createErrorResponse(
        'Invalid JSON in request body',
        error instanceof Error ? error.message : 'Unknown parsing error',
        'VALIDATION_ERROR',
        requestId,
        400
      );
    }

    const { jobId, bucketName: requestBucketName, userId, settings } = body;
    bucketName = requestBucketName;

    // Validation
    if (!jobId) {
      return createErrorResponse(
        'jobId is required',
        'jobId parameter is missing',
        'VALIDATION_ERROR',
        requestId,
        400
      );
    }

    if (!bucketName) {
      return createErrorResponse(
        'bucketName is required',
        'bucketName parameter is missing',
        'VALIDATION_ERROR',
        requestId,
        400
      );
    }

    if (!userId) {
      return createErrorResponse(
        'userId is required',
        'userId parameter is missing',
        'VALIDATION_ERROR',
        requestId,
        400
      );
    }

    console.log(`🚀 Starting AWS Rekognition analysis for job ${jobId} in bucket ${bucketName}`);

    // Initialize clients
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const rekognitionClient = getRekognitionClient();

    // Verify job exists and is in uploaded state
    const { data: jobData, error: jobError } = await supabase
      .from('nsfw_bulk_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobError || !jobData) {
      return createErrorResponse(
        'Job not found',
        `Job ${jobId} not found or access denied`,
        'NOT_FOUND',
        requestId,
        404,
        bucketName
      );
    }

    if (jobData.status !== 'uploaded') {
      return createErrorResponse(
        'Invalid job status',
        `Job status is ${jobData.status}, expected 'uploaded'`,
        'INVALID_STATUS',
        requestId,
        400,
        bucketName
      );
    }

    console.log(`✅ Job ${jobId} verified: ${jobData.processed_images} images uploaded to ${bucketName}`);

    // Start AWS Rekognition bulk analysis job
    console.log(`🔍 Starting AWS Rekognition bulk analysis job`);
    
    try {
      const rekognitionCommand = new StartMediaAnalysisJobCommand({
        JobName: `nsfw-binary-${jobId}`,
        OperationsConfig: {
          DetectModerationLabels: {
            MinConfidence: settings?.confidence_threshold || 80,
          }
        },
        Input: {
          S3Object: {
            Bucket: bucketName,
            Name: 'input/', // Process entire input folder with binary images
          }
        },
        OutputConfig: {
          S3Bucket: bucketName,
          S3KeyPrefix: 'output/'
        }
      });

      const rekognitionResponse = await rekognitionClient.send(rekognitionCommand);
      const awsJobId = rekognitionResponse.JobId!;

      console.log(`✅ AWS Rekognition BINARY job started: ${awsJobId}`);

      // Update database with AWS job ID and status
      await supabase
        .from('nsfw_bulk_jobs')
        .update({
          aws_job_id: awsJobId,
          status: 'processing',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      // SUCCESS - return response
      return new Response(JSON.stringify({
        jobId,
        awsJobId,
        awsBucketName: bucketName,
        status: 'processing',
        request_id: requestId
      } as BulkSubmitResponse), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error(`❌ AWS Rekognition error:`, error);
      return createErrorResponse(
        'AWS Rekognition error',
        error instanceof Error ? error.message : 'Unknown AWS error',
        'AWS_ERROR',
        requestId,
        500,
        bucketName
      );
    }

  } catch (error) {
    console.error(`❌ Unexpected error:`, error);
    return createErrorResponse(
      'Internal server error',
      error instanceof Error ? error.message : 'Unknown error',
      'INTERNAL_ERROR',
      requestId,
      500,
      bucketName
    );
  }
});
