import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Strict TypeScript interfaces
interface PresignRequest {
  imageCount: number
  userId: string
  settings?: {
    expiresIn?: number
    maxFileSize?: number
  }
}

interface PresignResponse {
  presignedUrls: string[]
  storagePaths: string[]
  bucketPath: string
  jobId: string
  expiresAt: string
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
  MAX_BATCH_SIZE: 5000,
  DEFAULT_EXPIRES_IN: 3600, // 1 hour
  MAX_FILE_SIZE_MB: 10,
} as const

// Enhanced logging utility
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

// Custom error classes
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

// Simple Supabase Storage Manager - no AWS bullshit
class SupabaseStorageManager {
  static async generatePresignedUrls(
    supabase: any,
    storagePaths: string[],
    expiresIn: number = CONFIG.DEFAULT_EXPIRES_IN
  ): Promise<string[]> {
    logWithContext('INFO', 'Generating presigned URLs via Supabase Storage (native)', {
      pathCount: storagePaths.length,
      expiresIn,
      bucket: 'nsfw-temp-processing'
    })
    
    const presignedUrls: string[] = []
    
    for (let i = 0; i < storagePaths.length; i++) {
      const storagePath = storagePaths[i]
      
      try {
        // Use Supabase's native createSignedUploadUrl
        const { data, error } = await supabase.storage
          .from('nsfw-temp-processing')
          .createSignedUploadUrl(storagePath, {
            upsert: true
          })
        
        if (error || !data?.signedUrl) {
          logWithContext('ERROR', `Failed to generate presigned URL for ${storagePath}`, {
            error: error?.message,
            storagePath,
            index: i
          })
          throw new Error(`Failed to generate presigned URL for ${storagePath}: ${error?.message}`)
        }
        
        presignedUrls.push(data.signedUrl)
        
        if (i % 100 === 0) { // Log progress every 100 URLs
          logWithContext('INFO', 'Presigned URL generation progress', {
            completed: i + 1,
            total: storagePaths.length,
            percentage: Math.round(((i + 1) / storagePaths.length) * 100)
          })
        }
        
      } catch (error) {
        logWithContext('ERROR', `Failed to generate presigned URL for ${storagePath}`, {
          error: error instanceof Error ? error.message : String(error),
          storagePath,
          index: i
        })
        throw new Error(`Failed to generate presigned URL for ${storagePath}`)
      }
    }
    
    logWithContext('INFO', 'All presigned URLs generated successfully via Supabase Storage', {
      totalUrls: presignedUrls.length,
      bucket: 'nsfw-temp-processing'
    })
    
    return presignedUrls
  }
}

// Request validator
function validatePresignRequest(body: unknown): PresignRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError(
      'Invalid request body',
      'Request body must be a valid JSON object'
    )
  }
  
  const request = body as Record<string, unknown>
  
  if (!request.imageCount || typeof request.imageCount !== 'number') {
    throw new ValidationError(
      'Missing imageCount',
      'Request must contain a valid imageCount number'
    )
  }
  
  if (!request.userId || typeof request.userId !== 'string') {
    throw new ValidationError(
      'Missing userId',
      'Request must contain a valid userId string'
    )
  }
  
  if (request.imageCount <= 0) {
    throw new ValidationError(
      'Invalid imageCount',
      'imageCount must be greater than 0'
    )
  }
  
  if (request.imageCount > CONFIG.MAX_BATCH_SIZE) {
    throw new ValidationError(
      'Batch too large',
      `Maximum batch size is ${CONFIG.MAX_BATCH_SIZE} images`
    )
  }
  
  return {
    imageCount: request.imageCount as number,
    userId: request.userId as string,
    settings: request.settings as PresignRequest['settings']
  }
}

// Error response handler
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

// Main request handler
serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get('X-Request-ID') || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  logWithContext('INFO', 'Incoming presign request', {
    requestId,
    method: req.method,
    url: req.url,
  })
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: CORS_HEADERS,
    })
  }
  
  // Only allow POST requests
  if (req.method !== "POST") {
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
    )
  }
  
  try {
    // Initialize Supabase client (we're already running on Supabase!)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new ConfigurationError(
        'Supabase configuration missing',
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required'
      )
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse and validate request
    const rawBody = await req.text()
    if (!rawBody || rawBody.trim().length === 0) {
      throw new ValidationError('Empty request body')
    }
    
    const parsedBody = JSON.parse(rawBody)
    const request = validatePresignRequest(parsedBody)
    
    logWithContext('INFO', 'Request validated', {
      requestId,
      userId: request.userId,
      imageCount: request.imageCount,
    })
    
    // Create job record
    const bucketPath = `bulk-${Date.now()}-${request.userId}`
    
    const { data: job, error: jobError } = await supabase
      .from('nsfw_bulk_jobs')
      .insert({
        user_id: request.userId,
        total_images: request.imageCount,
        bucket_path: bucketPath,
        status: 'uploading' as const
      })
      .select()
      .single()
    
    if (jobError) {
      throw new Error(`Failed to create job record: ${jobError.message}`)
    }
    
    const jobId = job.id as string
    
    logWithContext('INFO', 'Job record created', {
      requestId,
      jobId,
      bucketPath
    })
    
    // Generate storage paths
    const storagePaths: string[] = []
    for (let i = 0; i < request.imageCount; i++) {
      storagePaths.push(`${bucketPath}/image-${i.toString().padStart(6, '0')}.jpg`)
    }
    
    // Generate presigned URLs using Supabase's native storage API
    const expiresIn = request.settings?.expiresIn || CONFIG.DEFAULT_EXPIRES_IN
    const presignedUrls = await SupabaseStorageManager.generatePresignedUrls(
      supabase, 
      storagePaths, 
      expiresIn
    )
    
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    
    logWithContext('INFO', 'Presigned URLs generated successfully', {
      requestId,
      jobId,
      urlCount: presignedUrls.length,
      expiresAt,
    })
    
    const response: PresignResponse = {
      presignedUrls,
      storagePaths,
      bucketPath,
      jobId,
      expiresAt,
      request_id: requestId
    }
    
    return new Response(
      JSON.stringify(response),
      {
        headers: { 
          ...CORS_HEADERS, 
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
        status: 200
      }
    )
    
  } catch (error) {
    logWithContext('ERROR', 'Presign request failed', {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    })
    
    const errorResponse = getErrorResponse(error, requestId)
    
    return new Response(
      JSON.stringify(errorResponse.body),
      {
        status: errorResponse.status,
        headers: { 
          ...CORS_HEADERS, 
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        }
      }
    )
  }
})

// Export types for testing/external use
export type {
  PresignRequest,
  PresignResponse,
  ErrorResponse
}