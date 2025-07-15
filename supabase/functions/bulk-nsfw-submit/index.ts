import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  RekognitionClient, 
  StartMediaAnalysisJobCommand,
  RekognitionServiceException
} from "npm:@aws-sdk/client-rekognition@^3.840.0"
import { 
  S3Client, 
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand
} from "npm:@aws-sdk/client-s3@^3.840.0"

// Interfaces
interface BulkModerationRequest {
  imageUris: string[]
  userId: string
  totalImages: number
  settings?: {
    confidence_threshold?: number
    categories?: string[]
  }
}

interface BulkModerationResponse {
  jobId: string
  awsJobId: string
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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

// AWS Clients
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
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateS3Key(userId: string, index: number): string {
  return `bulk-nsfw/${userId}/${Date.now()}/image-${index}.jpg`
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
    const body: BulkModerationRequest = await req.json()
    const { imageUris, userId, totalImages, settings } = body

    if (!imageUris || !Array.isArray(imageUris) || imageUris.length === 0) {
      return new Response(JSON.stringify({
        error: 'Invalid imageUris',
        type: 'VALIDATION_ERROR',
        request_id: requestId
      } as ErrorResponse), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    if (!userId) {
      return new Response(JSON.stringify({
        error: 'userId is required',
        type: 'VALIDATION_ERROR',
        request_id: requestId
      } as ErrorResponse), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    console.log(`🚀 Starting bulk NSFW processing for ${imageUris.length} images`)

    // Initialize clients
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const s3Client = getS3Client()
    const rekognitionClient = getRekognitionClient()

    // Generate job ID
    const jobId = generateJobId()
    const bucketName = `nsfw-temp-${userId.substring(0, 8)}-${Date.now()}`

    // Create temporary S3 bucket
    try {
      await s3Client.send(new CreateBucketCommand({
        Bucket: bucketName,
      }))
      console.log(`✅ Created temporary S3 bucket: ${bucketName}`)
    } catch (error) {
      console.error(`❌ Failed to create S3 bucket:`, error)
      return new Response(JSON.stringify({
        error: 'Failed to create S3 bucket',
        details: error instanceof Error ? error.message : 'Unknown error',
        type: 'S3_ERROR',
        request_id: requestId
      } as ErrorResponse), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // Create database record
    const { error: dbError } = await supabase
      .from('nsfw_bulk_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'uploading',
        total_images: totalImages,
        processed_images: 0,
        nsfw_detected: 0,
        bucket_name: bucketName,
        created_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error(`❌ Database insert error:`, dbError)
      return new Response(JSON.stringify({
        error: 'Database error',
        details: dbError.message,
        type: 'DATABASE_ERROR',
        request_id: requestId
      } as ErrorResponse), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // Upload images to S3
    const s3Keys: string[] = []
    for (let i = 0; i < imageUris.length; i++) {
      const imageUri = imageUris[i]
      const s3Key = generateS3Key(userId, i)
      
      try {
        // Fetch image
        const response = await fetch(imageUri)
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`)
        }
        
        const imageBuffer = await response.arrayBuffer()
        
        // Upload to S3
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: new Uint8Array(imageBuffer),
          ContentType: 'image/jpeg',
        }))
        
        s3Keys.push(s3Key)
        console.log(`✅ Uploaded image ${i + 1}/${imageUris.length} to S3`)
        
      } catch (error) {
        console.error(`❌ Failed to upload image ${i}:`, error)
        // Continue with other images
      }
    }

    // Start AWS Rekognition job
    const s3Uri = `s3://${bucketName}/`
    const outputPrefix = `output-${jobId}/`
    
    try {
      const rekognitionCommand = new StartMediaAnalysisJobCommand({
        JobName: `nsfw-bulk-${jobId}`,
        OperationsConfig: {
          DetectModerationLabels: {
            MinConfidence: settings?.confidence_threshold || 80,
            ProjectVersion: undefined
          }
        },
        Input: {
          S3Object: {
            Bucket: bucketName,
            Name: ""
          }
        },
        OutputConfig: {
          S3Bucket: bucketName,
          S3KeyPrefix: outputPrefix
        }
      })

      const rekognitionResponse = await rekognitionClient.send(rekognitionCommand)
      const awsJobId = rekognitionResponse.JobId!

      console.log(`✅ Started AWS Rekognition job: ${awsJobId}`)

      // Update database with AWS job ID
      await supabase
        .from('nsfw_bulk_jobs')
        .update({
          aws_job_id: awsJobId,
          status: 'processing',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      return new Response(JSON.stringify({
        jobId,
        awsJobId,
        status: 'processing',
        totalImages: s3Keys.length,
        request_id: requestId
      } as BulkModerationResponse), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })

    } catch (error) {
      console.error(`❌ AWS Rekognition error:`, error)
      return new Response(JSON.stringify({
        error: 'AWS Rekognition error',
        details: error instanceof Error ? error.message : 'Unknown error',
        type: 'AWS_ERROR',
        request_id: requestId
      } as ErrorResponse), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

  } catch (error) {
    console.error(`❌ Unexpected error:`, error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: 'INTERNAL_ERROR',
      request_id: requestId
    } as ErrorResponse), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
