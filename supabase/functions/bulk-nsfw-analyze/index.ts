import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Batch-ID, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

// Enhanced logging utility
function logWithContext(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: any): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    ...context
  }
  console.log(JSON.stringify(logEntry))
}

serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  logWithContext('INFO', 'Incoming bulk analyze request', {
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
    const { jobId, s3Paths, userId } = await req.json()
    
    logWithContext('INFO', 'Parsed request body', {
      jobId,
      s3PathsCount: s3Paths?.length,
      userId,
      requestId
    })
    
    if (!jobId || !s3Paths || !userId) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          details: 'jobId, s3Paths, and userId are required',
          type: 'validation_error',
          request_id: requestId,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!Array.isArray(s3Paths) || s3Paths.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid s3Paths',
          details: 's3Paths must be a non-empty array',
          type: 'validation_error',
          request_id: requestId,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        }
      )
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Extract bucket path from first S3 path
    const bucketPath = s3Paths[0].split('/')[0]
    
    logWithContext('INFO', 'Extracted bucket path', {
      bucketPath,
      firstS3Path: s3Paths[0],
      totalPaths: s3Paths.length,
      requestId
    })

    // Call the bulk-nsfw-submit function to start analysis
    logWithContext('INFO', 'Calling bulk-nsfw-submit function', {
      jobId,
      bucketPath,
      storagePaths: s3Paths.length,
      userId,
      requestId
    })
    
    const { data, error } = await supabase.functions.invoke('bulk-nsfw-submit', {
      body: {
        jobId,
        storagePaths: s3Paths,
        bucketPath,
        userId
      }
    })

    if (error) {
      logWithContext('ERROR', 'bulk-nsfw-submit function failed', {
        error: error.message,
        jobId,
        requestId
      })
      throw new Error(`Failed to start analysis: ${error.message}`)
    }

    logWithContext('INFO', 'Analysis started successfully', {
      jobId,
      awsJobId: data?.awsJobId,
      status: data?.status,
      requestId
    })

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        awsJobId: data?.awsJobId,
        status: data?.status || 'processing',
        totalImages: s3Paths.length,
        request_id: requestId
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    logWithContext('ERROR', 'Analysis start failed', {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      requestId
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