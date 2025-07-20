import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  S3Client, 
  ListBucketsCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand
} from "npm:@aws-sdk/client-s3@^3.840.0"

/**
 *  Cleans up Temp buckets in AWS S3 after processing is complete
 */

// Interfaces
interface CleanupRequest {
  bucketName?: string // Clean specific bucket
  userId?: string     // Clean all buckets for user
  olderThanHours?: number // Clean buckets older than X hours (default 24)
  force?: boolean     // Force cleanup even if job is still running
}

interface CleanupResponse {
  success: boolean
  bucketsDeleted: string[]
  errors: string[]
  totalDeleted: number
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
function getS3Client(): S3Client {
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  return new S3Client({
    region,
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  });
}

// Helper functions
function generateRequestId(): string {
  return `cleanup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function extractTimestampFromBucket(bucketName: string): number | null {
  // Extract timestamp from bucket names like: nsfw-bulk-12345678-1752571943686
  const match = bucketName.match(/-(\d{13})$/)
  return match ? parseInt(match[1]) : null
}

function isTempBucket(bucketName: string): boolean {
  return bucketName.startsWith('nsfw-bulk-') || bucketName.startsWith('nsfw-temp-')
}

// Delete all objects in a bucket
async function emptyBucket(s3Client: S3Client, bucketName: string): Promise<void> {
  console.log(`🗑️ Emptying bucket: ${bucketName}`)
  
  try {
    let continuationToken: string | undefined
    let totalDeleted = 0
    
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
      
      const listResponse = await s3Client.send(listCommand)
      
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Delete objects in batches of 1000 (AWS limit)
        const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key! }))
        
        if (objectsToDelete.length <= 1000) {
          // Use batch delete for efficiency
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: objectsToDelete,
              Quiet: true
            }
          })
          
          await s3Client.send(deleteCommand)
          totalDeleted += objectsToDelete.length
        } else {
          // Delete individually if somehow > 1000
          for (const obj of objectsToDelete) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: bucketName,
              Key: obj.Key
            }))
            totalDeleted++
          }
        }
        
        console.log(`🗑️ Deleted ${objectsToDelete.length} objects from ${bucketName} (total: ${totalDeleted})`)
      }
      
      continuationToken = listResponse.NextContinuationToken
    } while (continuationToken)
    
    console.log(`✅ Emptied bucket ${bucketName}: ${totalDeleted} objects deleted`)
    
  } catch (error) {
    console.error(`❌ Failed to empty bucket ${bucketName}:`, error)
    throw error
  }
}

// Delete a single bucket (empty it first, then delete)
async function deleteBucket(s3Client: S3Client, bucketName: string): Promise<void> {
  try {
    console.log(`🗑️ Deleting bucket: ${bucketName}`)
    
    // First empty the bucket
    await emptyBucket(s3Client, bucketName)
    
    // Then delete the bucket itself
    await s3Client.send(new DeleteBucketCommand({
      Bucket: bucketName
    }))
    
    console.log(`✅ Successfully deleted bucket: ${bucketName}`)
    
  } catch (error) {
    console.error(`❌ Failed to delete bucket ${bucketName}:`, error)
    throw error
  }
}

// Main cleanup function
async function cleanupTempBuckets(
  s3Client: S3Client,
  supabase: any,
  options: CleanupRequest
): Promise<{ bucketsDeleted: string[]; errors: string[] }> {
  const bucketsDeleted: string[] = []
  const errors: string[] = []
  
  try {
    // If specific bucket name provided, just delete that one
    if (options.bucketName) {
      console.log(`🎯 Cleaning specific bucket: ${options.bucketName}`)
      
      try {
        await deleteBucket(s3Client, options.bucketName)
        bucketsDeleted.push(options.bucketName)
        
        // Also clean up database record
        await supabase
          .from('nsfw_bulk_jobs')
          .update({ 
            status: 'cleaned_up',
            cleaned_up_at: new Date().toISOString()
          })
          .eq('aws_temp_bucket', options.bucketName)
          
      } catch (error) {
        const errorMsg = `Failed to delete bucket ${options.bucketName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error(`❌ ${errorMsg}`)
      }
      
      return { bucketsDeleted, errors }
    }
    
    // Otherwise, list all buckets and find temp buckets to clean
    console.log(`🔍 Listing all S3 buckets to find temp buckets...`)
    
    const listBucketsResponse = await s3Client.send(new ListBucketsCommand({}))
    const allBuckets = listBucketsResponse.Buckets || []
    
    console.log(`📊 Found ${allBuckets.length} total buckets`)
    
    // Filter for temp buckets
    const tempBuckets = allBuckets.filter(bucket => 
      bucket.Name && isTempBucket(bucket.Name)
    )
    
    console.log(`🎯 Found ${tempBuckets.length} temp buckets to evaluate`)
    
    const cutoffTime = Date.now() - ((options.olderThanHours || 24) * 60 * 60 * 1000)
    
    for (const bucket of tempBuckets) {
      const bucketName = bucket.Name!
      
      try {
        // Check if bucket matches user filter
        if (options.userId && !bucketName.includes(options.userId.substring(0, 8))) {
          console.log(`⏭️ Skipping bucket ${bucketName} (different user)`)
          continue
        }
        
        // Check bucket age
        const bucketTimestamp = extractTimestampFromBucket(bucketName)
        if (bucketTimestamp && bucketTimestamp > cutoffTime && !options.force) {
          console.log(`⏭️ Skipping bucket ${bucketName} (too recent: ${new Date(bucketTimestamp).toISOString()})`)
          continue
        }
        
        // Check if associated job is still running (unless force)
        if (!options.force) {
          const { data: jobData } = await supabase
            .from('nsfw_bulk_jobs')
            .select('status')
            .eq('aws_temp_bucket', bucketName)
            .single()
            
          if (jobData && jobData.status === 'processing') {
            console.log(`⏭️ Skipping bucket ${bucketName} (job still processing)`)
            continue
          }
        }
        
        console.log(`🗑️ Cleaning up bucket: ${bucketName}`)
        
        await deleteBucket(s3Client, bucketName)
        bucketsDeleted.push(bucketName)
        
        // Update database record
        await supabase
          .from('nsfw_bulk_jobs')
          .update({ 
            status: 'cleaned_up',
            cleaned_up_at: new Date().toISOString()
          })
          .eq('aws_temp_bucket', bucketName)
        
      } catch (error) {
        const errorMsg = `Failed to delete bucket ${bucketName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error(`❌ ${errorMsg}`)
      }
    }
    
  } catch (error) {
    const errorMsg = `Failed to list buckets: ${error instanceof Error ? error.message : 'Unknown error'}`
    errors.push(errorMsg)
    console.error(`❌ ${errorMsg}`)
  }
  
  return { bucketsDeleted, errors }
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  const requestId = generateRequestId()
  
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'Method not allowed',
        type: 'METHOD_NOT_ALLOWED',
        request_id: requestId
      } as ErrorResponse), {
        status: 405,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // Parse request
    let body: CleanupRequest = {}
    try {
      body = await req.json()
    } catch (error) {
      // Empty body is OK for cleanup
      console.log('No request body provided, using defaults')
    }

    console.log(`🧹 Starting temp bucket cleanup with options:`, body)

    // Initialize clients
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const s3Client = getS3Client()

    // Perform cleanup
    const result = await cleanupTempBuckets(s3Client, supabase, body)

    console.log(`✅ Cleanup complete: ${result.bucketsDeleted.length} buckets deleted, ${result.errors.length} errors`)

    return new Response(JSON.stringify({
      success: true,
      bucketsDeleted: result.bucketsDeleted,
      errors: result.errors,
      totalDeleted: result.bucketsDeleted.length,
      request_id: requestId
    } as CleanupResponse), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })

  } catch (error) {
    console.error(`❌ Cleanup function error:`, error)
    return new Response(JSON.stringify({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: 'CLEANUP_ERROR',
      request_id: requestId
    } as ErrorResponse), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})