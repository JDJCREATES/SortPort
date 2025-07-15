import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  GetMediaAnalysisJobCommand,
  RekognitionServiceException
} from "npm:@aws-sdk/client-rekognition@^3.840.0"
import { 
  S3Client, 
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
  HeadBucketCommand
} from "npm:@aws-sdk/client-s3@^3.840.0"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Batch-ID, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

const CONFIG = {
  REQUEST_TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
} as const

// NSFW Categories
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
] as const

// Enhanced logging utility
function logWithContext(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: Record<string, any>): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    ...context
  }
  console.log(JSON.stringify(logEntry))
}

// Temporary S3 Bucket Manager (same as in submit function)
class TempS3BucketManager {
  private static s3Client: S3Client | null = null
  
  static getS3Client(): S3Client {
    if (!this.s3Client) {
      const region = Deno.env.get('AWS_REGION') || 'us-east-1'
      
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
          secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
        },
      })
    }
    
    return this.s3Client
  }
  
  static async deleteTempBucket(bucketName: string): Promise<void> {
    const s3 = this.getS3Client()
    
    try {
      logWithContext('INFO', 'Starting temp bucket cleanup', { bucketName })
      
      // First, delete all objects in the bucket
      let continuationToken: string | undefined
      let totalDeleted = 0
      
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken
        })
        
        const listResponse = await s3.send(listCommand)
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          // Delete objects in batches
          const deletePromises = listResponse.Contents.map(object => {
            if (object.Key) {
              return s3.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: object.Key
              }))
            }
            return Promise.resolve()
          }).filter(Boolean)
          
          await Promise.all(deletePromises)
          totalDeleted += listResponse.Contents.length
          
          logWithContext('INFO', 'Deleted batch of objects', {
            bucketName,
            batchSize: listResponse.Contents.length,
            totalDeleted
          })
        }
        
        continuationToken = listResponse.NextContinuationToken
      } while (continuationToken)
      
      // Now delete the empty bucket
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }))
      
      logWithContext('INFO', 'Temporary S3 bucket deleted successfully', {
        bucketName,
        totalObjectsDeleted: totalDeleted
      })
      
    } catch (error) {
      logWithContext('ERROR', 'Failed to delete temp bucket', {
        bucketName,
        error: error instanceof Error ? error.message : String(error)
      })
      // Don't throw - we don't want cleanup failures to break the main flow
    }
  }
}

// AWS Client Manager
class AWSClientManager {
  private static client: RekognitionClient | null = null
  
  static validateEnvironment(): { region: string } {
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1'
    
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured')
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
    }
    
    return this.client
  }
}

// Process AWS moderation results
function processAWSModerationResults(awsResults: any[], confidenceThreshold: number = 80): any[] {
  const results: any[] = []
  
  awsResults.forEach((item, index) => {
    const moderationLabels = item.ModerationLabels || []
    let isNsfw = false
    let maxConfidence = 0
    
    for (const label of moderationLabels) {
      const confidence = label.Confidence || 0
      maxConfidence = Math.max(maxConfidence, confidence)
      
      if (confidence >= confidenceThreshold) {
        const labelName = label.Name || ''
        const parentName = label.ParentName || ''
        
        if (NSFW_CATEGORIES.some(category => 
          labelName.includes(category) || parentName.includes(category)
        )) {
          isNsfw = true
          break
        }
      }
    }
    
    results.push({
      image_path: item.ImagePath || `image-${index}`,
      image_id: `image-${index}`,
      is_nsfw: isNsfw,
      confidence_score: maxConfidence / 100,
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
      processing_time_ms: 0,
    })
  })
  
  return results
}

serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  logWithContext('INFO', `Incoming bulk status request`, {
    requestId,
    method: req.method,
  })
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    })
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
    )
  }

  try {
    const { jobId } = await req.json()
    
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
      )
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('nsfw_bulk_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      logWithContext('ERROR', 'Job not found', { jobId, jobError, requestId })
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
      )
    }

    logWithContext('INFO', `Checking status for job ${jobId}`, {
      status: job.status,
      totalImages: job.total_images,
      awsJobId: job.s3_job_id,
      tempBucket: job.aws_temp_bucket,
      requestId
    })

    // If job is already completed, return cached results
    if (job.status === 'completed') {
      const { data: results } = await supabase
        .from('nsfw_bulk_results')
        .select('*')
        .eq('job_id', jobId)

      logWithContext('INFO', `Returning cached results for completed job ${jobId}`, {
        resultCount: results?.length || 0,
        requestId
      })

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
      )
    }

    // If job failed, return error
    if (job.status === 'failed') {
      logWithContext('WARN', `Job ${jobId} failed`, {
        errorMessage: job.error_message,
        requestId
      })

      return new Response(
        JSON.stringify({
          status: 'failed',
          error: job.error_message || 'Job processing failed',
          request_id: requestId
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    // Check AWS job status if we have an AWS job ID
    if (job.s3_job_id && job.status === 'processing') {
      try {
        const client = AWSClientManager.getClient()
        
        const getCommand = new GetMediaAnalysisJobCommand({
          JobId: job.s3_job_id
        })

        const awsResponse = await client.send(getCommand)
        
        logWithContext('INFO', `AWS job status for ${job.s3_job_id}`, {
          awsStatus: awsResponse.JobStatus,
          tempBucket: job.aws_temp_bucket,
          requestId
        })
        
        if (awsResponse.JobStatus === 'SUCCEEDED') {
          const tempBucketName = job.aws_temp_bucket
          
          if (!tempBucketName) {
            throw new Error('Temp bucket name not found in job record')
          }
          
          logWithContext('INFO', 'Processing AWS results from temp bucket', {
            tempBucketName,
            jobId,
            requestId
          })
          
          // Get results from temp S3 bucket
          const s3Client = TempS3BucketManager.getS3Client()
          
          const listCommand = new ListObjectsV2Command({
            Bucket: tempBucketName,
            Prefix: 'results/'
          })
          
          const listResponse = await s3Client.send(listCommand)
          
          logWithContext('INFO', 'Found result files in temp bucket', {
            fileCount: listResponse.Contents?.length || 0,
            files: listResponse.Contents?.map((f: any) => f.Key) || [],
            tempBucketName,
            requestId
          })
          
          let processedResults: any[] = []
          
          // Process each result file
          if (listResponse.Contents && listResponse.Contents.length > 0) {
            for (const object of listResponse.Contents) {
              if (object.Key && object.Key.endsWith('.json')) {
                logWithContext('INFO', 'Processing result file from temp bucket', {
                  fileName: object.Key,
                  tempBucketName,
                  requestId
                })
                
                const getObjectCommand = new GetObjectCommand({
                  Bucket: tempBucketName,
                  Key: object.Key
                })
                
                const objectResponse = await s3Client.send(getObjectCommand)
                
                if (objectResponse.Body) {
                  const fileContent = await objectResponse.Body.transformToString()
                  
                  logWithContext('INFO', 'Downloaded result file from temp bucket', {
                    fileName: object.Key,
                    contentLength: fileContent.length,
                    requestId
                  })
                  
                  const awsResults = JSON.parse(fileContent)
                  
                  // Process AWS results
                  const batchResults = processAWSModerationResults(awsResults)
                  processedResults = processedResults.concat(batchResults)
                  
                  logWithContext('INFO', 'Processed batch results from temp bucket', {
                    fileName: object.Key,
                    batchResultCount: batchResults.length,
                    totalProcessed: processedResults.length,
                    requestId
                  })
                }
              }
            }
          }
          
          logWithContext('INFO', 'All results processed from temp bucket', {
            totalResults: processedResults.length,
            nsfwCount: processedResults.filter(r => r.is_nsfw).length,
            tempBucketName,
            requestId
          })
          
          // Store results in database
          if (processedResults.length > 0) {
            const dbResults = processedResults.map((result: any, index: number) => ({
              job_id: jobId,
              image_path: `temp-${tempBucketName}/${result.image_path}`, // Mark as temp
              image_id: result.image_id,
              is_nsfw: result.is_nsfw,
              confidence_score: result.confidence_score,
              moderation_labels: result.moderation_labels
            }))

            const { error: insertError } = await supabase
              .from('nsfw_bulk_results')
              .insert(dbResults)

            if (insertError) {
              logWithContext('ERROR', 'Failed to store results in database', { 
                insertError: insertError.message, 
                resultCount: dbResults.length,
                requestId 
              })
            } else {
              logWithContext('INFO', 'Results stored in database successfully', {
                resultCount: dbResults.length,
                requestId
              })
            }
          }

          // Update job as completed
          const nsfwCount = processedResults.filter((r: any) => r.is_nsfw).length
          await supabase
            .from('nsfw_bulk_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              processed_images: processedResults.length,
              nsfw_detected: nsfwCount
            })
            .eq('id', jobId)

          logWithContext('INFO', 'Job marked as completed, starting cleanup', {
            jobId,
            processedImages: processedResults.length,
            nsfwDetected: nsfwCount,
            tempBucketName,
            requestId
          })

          // Cleanup temp S3 bucket (don't await - let it run in background)
          TempS3BucketManager.deleteTempBucket(tempBucketName).then(() => {
            logWithContext('INFO', 'Temp bucket cleanup completed', {
              tempBucketName,
              jobId,
              requestId
            })
          }).catch((cleanupError: Error) => {
            logWithContext('ERROR', 'Temp bucket cleanup failed', {
              tempBucketName,
              jobId,
              cleanupError: cleanupError.message,
              requestId
            })
          })

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
          )
          
        } else if (awsResponse.JobStatus === 'FAILED') {
          const errorMessage = awsResponse.StatusMessage || 'AWS processing failed'
          
          await supabase
            .from('nsfw_bulk_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage
            })
            .eq('id', jobId)

          logWithContext('ERROR', `AWS job ${job.s3_job_id} failed, cleaning up temp bucket`, {
            statusMessage: awsResponse.StatusMessage,
            tempBucket: job.aws_temp_bucket,
            requestId
          })

          // Cleanup temp bucket on failure
          if (job.aws_temp_bucket) {
            TempS3BucketManager.deleteTempBucket(job.aws_temp_bucket).catch((cleanupError: Error) => {
              logWithContext('ERROR', 'Temp bucket cleanup failed after job failure', {
                tempBucket: job.aws_temp_bucket,
                cleanupError: cleanupError.message,
                requestId
              })
            })
          }

          return new Response(
            JSON.stringify({
              status: 'failed',
              error: errorMessage,
              request_id: requestId
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          )
          
        } else {
          // Still processing - calculate progress
          const progress = Math.min(90, Math.floor((Date.now() - new Date(job.created_at).getTime()) / 1000))

          logWithContext('INFO', `Job ${jobId} still processing in temp bucket`, {
            awsStatus: awsResponse.JobStatus,
            progress,
            tempBucket: job.aws_temp_bucket,
            requestId
          })

          return new Response(
            JSON.stringify({
              status: 'processing',
              progress: Math.min(progress, 95),
              totalImages: job.total_images,
              request_id: requestId
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          )
        }
        
      } catch (awsError) {
        logWithContext('ERROR', `AWS status check failed for job ${jobId}`, {
          awsError: awsError instanceof Error ? awsError.message : String(awsError),
          tempBucket: job.aws_temp_bucket,
          requestId
        })

        return new Response(
          JSON.stringify({
            status: 'processing',
            progress: 50,
            totalImages: job.total_images,
            error: 'Temporary AWS communication issue',
            request_id: requestId
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Default response for other statuses
    let progress = 0
    switch (job.status) {
      case 'uploading':
        progress = 10
        break
      case 'submitted':
        progress = 25
        break
      default:
        progress = 0
    }

    logWithContext('INFO', `Job ${jobId} in status: ${job.status}`, {
      progress,
      requestId
    })

    return new Response(
      JSON.stringify({
        status: job.status,
        progress,
        totalImages: job.total_images,
        request_id: requestId
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    logWithContext('ERROR', `Status check failed for ${requestId}`, {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
    })
    
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
    )
  }
})