import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  GetModerationLabelDetectionCommand,
  GetMediaAnalysisJobCommand,
  RekognitionServiceException
} from "npm:@aws-sdk/client-rekognition@^3.840.0"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Batch-ID, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const;

const CONFIG = {
  REQUEST_TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
} as const;

// NSFW Categories (from original function)
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

// Enhanced logging utility
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

// AWS Client Manager (same as submit function)
class AWSClientManager {
  private static client: RekognitionClient | null = null;
  
  static validateEnvironment(): { region: string } {
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
    
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }
    
    return { region: AWS_REGION };
  }
  
  static getClient(): RekognitionClient {
    if (!this.client) {
      const { region } = this.validateEnvironment();
      
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
      });
    }
    
    return this.client;
  }
}

// Process AWS moderation results
function processAWSModerationResults(awsResults: any[], confidenceThreshold: number = 80): any[] {
  const results: any[] = [];
  
  awsResults.forEach((item, index) => {
    const moderationLabels = item.ModerationLabel ? [item.ModerationLabel] : [];
    let isNsfw = false;
    let maxConfidence = 0;
    
    for (const label of moderationLabels) {
      const confidence = label.Confidence || 0;
      maxConfidence = Math.max(maxConfidence, confidence);
      
      if (confidence >= confidenceThreshold) {
        const labelName = label.Name || '';
        const parentName = label.ParentName || '';
        
        if (NSFW_CATEGORIES.some(category => 
          labelName.includes(category) || parentName.includes(category)
        )) {
          isNsfw = true;
          break;
        }
      }
    }
    
    results.push({
      image_path: `image-${index}`,
      image_id: `image-${index}`,
      is_nsfw: isNsfw,
      confidence_score: maxConfidence / 100, // Convert to 0-1 scale
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
      processing_time_ms: 0, // AWS doesn't provide individual timing
    });
  });
  
  return results;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logWithContext('INFO', `Incoming bulk status request`, {
    requestId,
    method: req.method,
  });
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    });
  }
  
  if (req.method !== "POST") {
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
    const { jobId } = await req.json();
    
    if (!jobId) {
      return new Response(
        JSON.stringify({
          error: 'Missing jobId',
          details: 'Request must contain a jobId',
          type: 'validation_error',
          request_id: requestId,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      );
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('nsfw_bulk_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      logWithContext('ERROR', 'Job not found', { jobId, jobError, requestId });
      return new Response(
        JSON.stringify({
          error: 'Job not found',
          details: `No job found with ID: ${jobId}`,
          type: 'not_found_error',
          request_id: requestId,
        }),
        {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      );
    }

    logWithContext('INFO', `Checking status for job ${jobId}`, {
      status: job.status,
      totalImages: job.total_images,
      awsJobId: job.s3_job_id,
      requestId
    });

    // If job is already completed, return cached results
    if (job.status === 'completed') {
      const { data: results } = await supabase
        .from('nsfw_bulk_results')
        .select('*')
        .eq('job_id', jobId);

      logWithContext('INFO', `Returning cached results for completed job ${jobId}`, {
        resultCount: results?.length || 0,
        requestId
      });

      return new Response(
        JSON.stringify({
          status: 'completed',
          progress: 100,
          results: results || [],
          totalImages: job.total_images,
          nsfwDetected: job.nsfw_detected,
          request_id: requestId
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // If job failed, return error
    if (job.status === 'failed') {
      logWithContext('WARN', `Job ${jobId} failed`, {
        errorMessage: job.error_message,
        requestId
      });

      return new Response(
        JSON.stringify({
          status: 'failed',
          error: job.error_message || 'Job processing failed',
          request_id: requestId
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check AWS job status if we have an AWS job ID
    if (job.s3_job_id && job.status === 'processing') {
      try {
        const client = AWSClientManager.getClient();
        
        const getCommand = new GetMediaAnalysisJobCommand({
          JobId: job.s3_job_id
        });

        const awsResponse = await client.send(getCommand);
        
        logWithContext('INFO', `AWS job status for ${job.s3_job_id}`, {
          awsStatus: awsResponse.JobStatus,
          requestId
        });
        
        if (awsResponse.JobStatus === 'SUCCEEDED') {
          // Process AWS results
          const moderationLabels = awsResponse.ModerationLabels || [];
          const processedResults = processAWSModerationResults(moderationLabels);
          
          // Store results in database
          if (processedResults.length > 0) {
            const dbResults = processedResults.map(result => ({
              job_id: jobId,
              image_path: `${job.bucket_path}/${result.image_path}`,
              image_id: result.image_id,
              is_nsfw: result.is_nsfw,
              confidence_score: result.confidence_score,
              moderation_labels: result.moderation_labels
            }));

            const { error: insertError } = await supabase
              .from('nsfw_bulk_results')
              .insert(dbResults);

            if (insertError) {
              logWithContext('ERROR', 'Failed to store results', { insertError, requestId });
            }
          }

          // Update job as completed
          const nsfwCount = processedResults.filter(r => r.is_nsfw).length;
          await supabase
            .from('nsfw_bulk_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              processed_images: processedResults.length,
              nsfw_detected: nsfwCount
            })
            .eq('id', jobId);

          // Cleanup storage
          try {
            await supabase.storage
              .from('nsfw-temp-processing')
              .remove([`${job.bucket_path}/`]);
            
            logWithContext('INFO', `Cleaned up storage for job ${jobId}`, { requestId });
          } catch (cleanupError) {
            logWithContext('WARN', 'Storage cleanup failed', { cleanupError, requestId });
          }

          logWithContext('INFO', `Job ${jobId} completed successfully`, {
            totalProcessed: processedResults.length,
            nsfwDetected: nsfwCount,
            requestId
          });

          return new Response(
            JSON.stringify({
              status: 'completed',
              progress: 100,
              results: processedResults,
              totalImages: job.total_images,
              nsfwDetected: nsfwCount,
              request_id: requestId
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
          
        } else if (awsResponse.JobStatus === 'FAILED') {
          const errorMessage = awsResponse.StatusMessage || 'AWS processing failed';
          
          await supabase
            .from('nsfw_bulk_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage
            })
            .eq('id', jobId);

          logWithContext('ERROR', `AWS job ${job.s3_job_id} failed`, {
            statusMessage: awsResponse.StatusMessage,
            requestId
          });

          return new Response(
            JSON.stringify({
              status: 'failed',
              error: errorMessage,
              request_id: requestId
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
          
        } else {
          // Still processing - calculate progress
          const progress = awsResponse.VideoMetadata?.FrameCount 
            ? Math.round((awsResponse.VideoMetadata.FrameCount / job.total_images) * 100)
            : Math.min(90, Math.floor((Date.now() - new Date(job.created_at).getTime()) / 1000)); // Fallback progress

          logWithContext('INFO', `Job ${jobId} still processing`, {
            awsStatus: awsResponse.JobStatus,
            progress,
            requestId
          });

          return new Response(
            JSON.stringify({
              status: 'processing',
              progress: Math.min(progress, 95), // Cap at 95% until truly complete
              totalImages: job.total_images,
              request_id: requestId
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        
      } catch (awsError) {
        logWithContext('ERROR', `AWS status check failed for job ${jobId}`, {
          awsError: awsError instanceof Error ? awsError.message : String(awsError),
          requestId
        });

        // Don't fail the job yet, might be temporary AWS issue
        return new Response(
          JSON.stringify({
            status: 'processing',
            progress: 50, // Return some progress to keep polling
            totalImages: job.total_images,
            error: 'Temporary AWS communication issue',
            request_id: requestId
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Default response for other statuses (uploading, submitted)
    let progress = 0;
    switch (job.status) {
      case 'uploading':
        progress = 10;
        break;
      case 'submitted':
        progress = 25;
        break;
      default:
        progress = 0;
    }

    logWithContext('INFO', `Job ${jobId} in status: ${job.status}`, {
      progress,
      requestId
    });

    return new Response(
      JSON.stringify({
        status: job.status,
        progress,
        totalImages: job.total_images,
        request_id: requestId
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logWithContext('ERROR', `Status check failed for ${requestId}`, {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
    });
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        type: 'internal_error',
        request_id: requestId
      }),
      { 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
})