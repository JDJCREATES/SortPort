import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  GetMediaAnalysisJobCommand
} from "npm:@aws-sdk/client-rekognition@^3.840.0"
import { 
  S3Client, 
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
  _Object // Add this import for the S3 object type
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
      // Need to handle this error
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
    // Handle AWS Rekognition batch job result format
    let moderationLabels: any[] = []
    let imagePath: string = `image-${index}`
    
    if (item['detect-moderation-labels']) {
      // AWS batch job format: { "source-ref": "...", "detect-moderation-labels": { ... } }
      moderationLabels = item['detect-moderation-labels'].ModerationLabels || []
      imagePath = item['source-ref'] || `image-${index}`
    } else if (item.ModerationLabels) {
      // Direct AWS format: { "ModerationLabels": [...] }
      moderationLabels = item.ModerationLabels || []
      imagePath = item.ImagePath || `image-${index}`
    } else if (item.ImagePath && item.ModerationLabels) {
      // Converted format: { "ImagePath": "...", "ModerationLabels": [...] }
      moderationLabels = item.ModerationLabels || []
      imagePath = item.ImagePath || `image-${index}`
    }
    
    let isNsfw = false
    let maxConfidence = 0
    
    // Process moderation labels to determine NSFW status
    for (const label of moderationLabels) {
      const confidence = label.Confidence || 0
      maxConfidence = Math.max(maxConfidence, confidence)
      
      if (confidence >= confidenceThreshold) {
        const labelName = label.Name || ''
        const parentName = label.ParentName || ''
        
        // FIXED: Better category matching with case-insensitive partial matching
        if (NSFW_CATEGORIES.some(category => 
          labelName.toLowerCase().includes(category.toLowerCase()) || 
          parentName.toLowerCase().includes(category.toLowerCase()) ||
          category.toLowerCase().includes(labelName.toLowerCase())
        )) {
          isNsfw = true
          break
        }
      }
    }
    
    // Extract image ID from the S3 path or use index
    let imageId = `image-${index}`
    if (imagePath.includes('/')) {
      const pathParts = imagePath.split('/')
      const filename = pathParts[pathParts.length - 1]
      imageId = filename.replace(/\.(jpg|jpeg|png|gif)$/i, '')
    }
    
    results.push({
      image_path: imagePath,
      image_id: imageId,
      is_nsfw: isNsfw,
      confidence_score: maxConfidence / 100, // Convert to 0-1 scale
      moderation_labels: moderationLabels.map((label: any) => ({
        Name: label.Name || '',
        Confidence: label.Confidence || 0,
        ParentName: label.ParentName || undefined,
        TaxonomyLevel: label.TaxonomyLevel || undefined,
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
  
  logWithContext('INFO', 'Processed AWS moderation results', {
    totalResults: results.length,
    nsfwCount: results.filter(r => r.is_nsfw).length,
    sampleNsfwResult: results.find(r => r.is_nsfw) || null,
    sampleLabels: results.length > 0 ? results[0].moderation_labels : []
  })
  
  return results
}

serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // VIRTUAL IMAGE INTEGRATION: Log bulk processing flow
  console.log(`🔍 [FLOW-TRACE] [${requestId}] bulk-nsfw-status: Starting status check/result processing`);
  console.log(`🔍 [FLOW-TRACE] [${requestId}] Method: ${req.method}, URL: ${req.url}`);
  
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
      awsJobId: job.aws_job_id,
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

    // Check AWS job status if we have an AWS job ID <--aws_job_id
    if (job.aws_job_id && job.status === 'processing') {
      try {
        const client = AWSClientManager.getClient()
        
        logWithContext('INFO', 'MAKING AWS STATUS CHECK', {
          awsJobId: job.aws_job_id,
          tempBucket: job.aws_temp_bucket,
          requestId
        })
        
        const getCommand = new GetMediaAnalysisJobCommand({
          JobId: job.aws_job_id
        })

        const awsResponse = await client.send(getCommand)
        
        // LOG EVERYTHING FROM AWS RESPONSE
        logWithContext('INFO', 'RAW AWS RESPONSE', {
          awsJobId: job.aws_job_id,
          fullResponse: JSON.stringify(awsResponse, null, 2),
          requestId
        })
        
        logWithContext('INFO', `AWS job status for ${job.aws_job_id}`, {
          awsStatus: awsResponse.JobStatus,
          awsStatusMessage: awsResponse.StatusMessage,
          awsJobName: awsResponse.JobName,
          awsCreationTimestamp: awsResponse.CreationTimestamp,
          awsCompletionTimestamp: awsResponse.CompletionTimestamp, // ADD THIS
          awsFailureCode: awsResponse.FailureCode, // ADD THIS
          awsFailureDetails: awsResponse.FailureDetails, // ADD THIS
          tempBucket: job.aws_temp_bucket,
          requestId
        })
        
        // FORCE CHECK - if AWS console shows SUCCEEDED, let's bypass the status check
        if (awsResponse.Status === 'SUCCEEDED' || awsResponse.Status === 'COMPLETED') {
          logWithContext('INFO', 'AWS job SUCCEEDED - processing results', { 
            jobId: job.aws_job_id, 
            requestId 
          })
          
          const tempBucketName = job.aws_temp_bucket
          
          if (!tempBucketName) {
            throw new Error('Temp bucket name not found in job record')
          }
          
          logWithContext('INFO', 'AWS job succeeded, fetching results', {
            tempBucketName,
            jobId,
            requestId
          })
          
          // Get results from temp S3 bucket - CHECK ALL PREFIXES
          const s3Client = TempS3BucketManager.getS3Client()
          
          // First, list ALL objects to see what's actually there
          const listAllCommand = new ListObjectsV2Command({
            Bucket: tempBucketName
          })
          
          const listAllResponse = await s3Client.send(listAllCommand)
          
          logWithContext('INFO', 'ALL FILES IN TEMP BUCKET', {
            fileCount: listAllResponse.Contents?.length || 0,
            allFiles: listAllResponse.Contents?.map((f: any) => ({
              key: f.Key,
              size: f.Size,
              lastModified: f.LastModified
            })) || [],
            tempBucketName,
            requestId
          })
          
          // Now look for result files - only process actual results
          const resultFiles = listAllResponse.Contents?.filter(obj => 
            obj.Key && (
              obj.Key.includes('results.jsonl') ||  // AWS batch job results
              (obj.Key.includes('result') && obj.Key.endsWith('.json') && !obj.Key.includes('manifest'))
            )
          ) || []
          
          logWithContext('INFO', 'FOUND RESULT FILES', {
            resultFiles: resultFiles.map(f => f.Key),
            tempBucketName,
            requestId
          })
          
          if (resultFiles.length === 0) {
            throw new Error('No result files found in temp bucket')
          }
          
          let processedResults: any[] = []
          
          // Process each result file
          for (const object of resultFiles) {
            if (!object.Key) continue
            
            logWithContext('INFO', 'Processing result file', {
              fileName: object.Key,
              fileSize: object.Size,
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
              
              logWithContext('INFO', 'RAW FILE CONTENT', {
                fileName: object.Key,
                contentLength: fileContent.length,
                contentPreview: fileContent.substring(0, 500), // More preview
                requestId
              })
              
              try {
                let rawResults: any[] = []
                
                // Check if this is a JSONL file (JSON Lines format)
                if (object.Key?.endsWith('.jsonl')) {
                  logWithContext('INFO', 'Processing JSONL file', {
                    fileName: object.Key,
                    requestId
                  })
                  
                  // Split by newlines and parse each line as separate JSON
                  const lines = fileContent.trim().split('\n')
                  
                  for (const line of lines) {
                    if (line.trim()) {
                      try {
                        const lineData = JSON.parse(line)
                        rawResults.push(lineData)
                      } catch (lineError) {
                        logWithContext('WARN', 'Failed to parse JSONL line', {
                          fileName: object.Key,
                          line: line.substring(0, 100),
                          lineError: lineError instanceof Error ? lineError.message : String(lineError),
                          requestId
                        })
                      }
                    }
                  }
                  
                  logWithContext('INFO', 'JSONL parsing completed', {
                    fileName: object.Key,
                    totalLines: lines.length,
                    parsedLines: rawResults.length,
                    requestId
                  })
                  
                } else {
                  // Regular JSON parsing - could be array or object
                  const parsedData = JSON.parse(fileContent)
                  
                  if (Array.isArray(parsedData)) {
                    rawResults = parsedData
                  } else {
                    // Handle object cases
                    if (parsedData.Results && Array.isArray(parsedData.Results)) {
                      rawResults = parsedData.Results
                    } else if (parsedData.ModerationLabels) {
                      // Single result object
                      rawResults = [parsedData]
                    } else {
                      logWithContext('WARN', 'Unknown JSON structure', {
                        fileName: object.Key,
                        structure: parsedData,
                        requestId
                      })
                      continue
                    }
                  }
                }
                
                logWithContext('INFO', 'PARSED RESULTS STRUCTURE', {
                  fileName: object.Key,
                  resultCount: rawResults.length,
                  firstResult: rawResults[0],
                  requestId
                })
                
                // Handle different AWS result structures
                let resultsToProcess: any[] = []
                
                // For JSONL results from AWS Rekognition batch jobs
                if (rawResults.length > 0 && rawResults[0]['detect-moderation-labels']) {
                  logWithContext('INFO', 'Processing AWS Rekognition batch results', {
                    fileName: object.Key,
                    resultCount: rawResults.length,
                    requestId
                  })
                  
                  resultsToProcess = rawResults.map((item: any, index: number) => {
                    const moderationData = item['detect-moderation-labels']
                    return {
                      ImagePath: item['source-ref'] || `image-${index}`,
                      ModerationLabels: moderationData?.ModerationLabels || [],
                      ModerationModelVersion: moderationData?.ModerationModelVersion || '7.0'
                    }
                  })
                  
                } else {
                  // For other formats, rawResults is already an array
                  resultsToProcess = rawResults
                }
                
                logWithContext('INFO', 'PROCESSING RESULTS ARRAY', {
                  fileName: object.Key,
                  arrayLength: resultsToProcess.length,
                  firstItem: resultsToProcess[0],
                  requestId
                })
                
                // Process the results
                const batchResults = processAWSModerationResults(resultsToProcess)
                processedResults = processedResults.concat(batchResults)
                
                logWithContext('INFO', 'BATCH PROCESSED', {
                  fileName: object.Key,
                  batchResultCount: batchResults.length,
                  totalProcessed: processedResults.length,
                  requestId
                })
                
              } catch (parseError) {
                logWithContext('ERROR', 'Result processing failed', {
                  fileName: object.Key,
                  parseError: parseError instanceof Error ? parseError.message : String(parseError),
                  rawContent: fileContent.substring(0, 500),
                  requestId
                })
              }
            }
          }
          
          logWithContext('INFO', 'FINAL RESULTS SUMMARY', {
            totalResults: processedResults.length,
            nsfwCount: processedResults.filter(r => r.is_nsfw).length,
            sampleResult: processedResults[0],
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

          // INTEGRATION POINT: This is where virtual image updates should happen after processing completes
          console.log(`📍 [INTEGRATION-POINT] [${requestId}] Processing completed - virtual image updates should happen here`);
          console.log(`📍 [INTEGRATION-POINT] [${requestId}] Results: ${processedResults.length} images, ${nsfwCount} NSFW detected`);
          console.log(`📍 [INTEGRATION-POINT] [${requestId}] Job details: jobId=${jobId}, tempBucket=${tempBucketName}`);

          // VIRTUAL IMAGE INTEGRATION: Update virtual images with NSFW results
          try {
            console.log(`🔗 [${requestId}] Calling virtual-image-bridge to update ${processedResults.length} virtual images`);
            
            const updateData = processedResults.map((result: any) => ({
              imagePath: result.image_path.replace(`temp-${tempBucketName}/`, `s3://${tempBucketName}/`),
              isNsfw: result.is_nsfw,
              confidenceScore: result.confidence_score,
              moderationLabels: Array.isArray(result.moderation_labels) ? result.moderation_labels : []
            }));
            
            const supabase = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            
            const bridgeResponse = await supabase.functions.invoke('virtual-image-bridge/update', {
              body: {
                jobId,
                results: updateData
              }
            });
            
            if (bridgeResponse.error) {
              console.error(`❌ [${requestId}] Virtual image update failed:`, bridgeResponse.error);
            } else {
              console.log(`✅ [${requestId}] Updated ${bridgeResponse.data?.processedCount || 0} virtual images with NSFW results`);
            }
            
          } catch (virtualUpdateError) {
            console.error(`❌ [${requestId}] Virtual image update error:`, virtualUpdateError);
            // Don't fail the processing, but log the issue
          }

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
          
          // FLOW TRACE: Log successful completion
          console.log(`🔍 [FLOW-TRACE] [${requestId}] bulk-nsfw-status: Processing completed successfully`);
          console.log(`🔍 [FLOW-TRACE] [${requestId}] Final results: ${processedResults.length} processed, ${nsfwCount} NSFW`);
          
        } else if (awsResponse.JobStatus === 'FAILED') {
          const errorMessage = awsResponse.StatusMessage || 'AWS processing failed'
          
          await supabase
            .from('nsfw_bulk_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage
            })
            .eq('id', jobId)

          logWithContext('ERROR', `AWS job ${job.aws_job_id} failed, cleaning up temp bucket`, {
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
          // STILL IN PROGRESS - but let's check if it's been too long
          const jobAge = Date.now() - new Date(job.created_at).getTime()
          const jobAgeMinutes = Math.floor(jobAge / 60000)
          
          logWithContext('WARN', 'AWS job still in progress - checking age', {
            awsStatus: awsResponse.JobStatus,
            jobAgeMinutes,
            jobAge,
            createdAt: job.created_at,
            requestId
          })
          
          // If job is older than 5 minutes and AWS says it's still processing, 
          // let's try to check the bucket anyway
          if (jobAgeMinutes > 5) {
            logWithContext('WARN', 'Job is old but still processing - checking bucket anyway', {
              jobAgeMinutes,
              tempBucket: job.aws_temp_bucket,
              requestId
            })
            
            // Try to list bucket contents anyway
            const s3Client = TempS3BucketManager.getS3Client()
            
            try {
              const listAllCommand = new ListObjectsV2Command({
                Bucket: job.aws_temp_bucket
              })
              
              const listAllResponse = await s3Client.send(listAllCommand)
              
              logWithContext('INFO', 'BUCKET CONTENTS DESPITE IN_PROGRESS STATUS', {
                fileCount: listAllResponse.Contents?.length || 0,
                allFiles: listAllResponse.Contents?.map((f: any) => ({
                  key: f.Key,
                  size: f.Size,
                  lastModified: f.LastModified
                })) || [],
                tempBucket: job.aws_temp_bucket,
                requestId
              })
              
              // If we find result files, process them anyway
              const resultFiles = listAllResponse.Contents?.filter((obj: _Object) => 
                obj.Key && (
                  obj.Key.includes('result') || 
                  obj.Key.includes('output') || 
                  obj.Key.endsWith('.json') ||
                  obj.Key.includes('moderation')
                )
              ) || []
              
              if (resultFiles.length > 0) {
                logWithContext('WARN', 'FOUND RESULTS DESPITE IN_PROGRESS STATUS - PROCESSING ANYWAY', {
                  resultFiles: resultFiles.map(f => f.Key),
                  requestId
                })
                
                // Process the results even though AWS says it's still in progress
                // (Your existing result processing code here)
              }
              
            } catch (bucketError) {
              logWithContext('ERROR', 'Failed to check bucket contents', {
                bucketError: bucketError instanceof Error ? bucketError.message : String(bucketError),
                requestId
              })
            }
          }
          
          // Calculate progress normally
          const progress = Math.min(90, Math.floor((Date.now() - new Date(job.created_at).getTime()) / 1000))

          return new Response(
            JSON.stringify({
              status: 'processing',
              progress: Math.min(progress, 95),
              totalImages: job.total_images,
              debug: {
                awsStatus: awsResponse.JobStatus,
                jobAgeMinutes,
                bucketName: job.aws_temp_bucket
              },
              request_id: requestId
            }),
            { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          )
        }
        
      } catch (awsError) {
        logWithContext('ERROR', `AWS status check failed for job ${jobId}`, {
          awsError: awsError instanceof Error ? awsError.message : String(awsError),
          awsErrorName: awsError instanceof Error ? awsError.name : 'Unknown',
          awsErrorStack: awsError instanceof Error ? awsError.stack : 'No stack',
          tempBucket: job.aws_temp_bucket,
          requestId
        })

        return new Response(
          JSON.stringify({
            status: 'processing',
            progress: 50,
            totalImages: job.total_images,
            error: 'Temporary AWS communication issue',
            debug: {
              awsError: awsError instanceof Error ? awsError.message : String(awsError)
            },
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