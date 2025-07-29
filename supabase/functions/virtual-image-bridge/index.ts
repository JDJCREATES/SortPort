import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ================================================================================
// VIRTUAL IMAGE BRIDGE - INTEGRATION WITH LCEL SERVER
// ================================================================================
// This edge function serves as a bridge between bulk NSFW processing 
// and the LCEL server's virtual image system. It handles:
// 1. Creating virtual images after S3 upload
// 2. Updating virtual images after Rekognition processing
// 3. Batch operations for performance
// ================================================================================

// CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Max-Age": "86400",
} as const

// TypeScript interfaces for strict typing
interface CreateVirtualImagesRequest {
  jobId: string
  bucketName: string
  userId: string
  images: {
    imagePath: string
    originalFileName?: string
    fileSize?: number
    contentType?: string
  }[]
}

interface UpdateVirtualImagesRequest {
  jobId: string
  results: {
    imagePath: string
    isNsfw: boolean
    confidenceScore: number
    moderationLabels: string[]
  }[]
}

interface VirtualImageBridgeResponse {
  success: boolean
  processedCount: number
  failedCount: number
  virtualImages?: any[]
  errors?: string[]
  request_id: string
}

interface ErrorResponse {
  error: string
  details: string
  type: string
  request_id: string
}

// Helper functions
function generateRequestId(): string {
  return `vib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function createErrorResponse(
  error: string,
  details: string,
  type: string,
  requestId: string,
  status: number
): Response {
  const errorResponse: ErrorResponse = {
    error,
    details,
    type,
    request_id: requestId
  }
  
  console.error(`❌ [${requestId}] Error: ${error} - ${details}`)
  
  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

// Get LCEL server configuration
function getLCELConfig() {
  const baseUrl = Deno.env.get('LCEL_SERVER_URL') || 'http://localhost:3001'
  const apiKey = Deno.env.get('LCEL_API_KEY') || ''
  
  console.log(`🔧 LCEL Config: baseUrl=${baseUrl}, hasApiKey=${!!apiKey}`);
  
  return {
    baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    apiKey,
    endpoints: {
      createVirtualImages: '/api/virtual-images',
      updateVirtualImages: '/api/virtual-images/batch-update'
    }
  }
}

// Create virtual images via LCEL server
async function createVirtualImagesViaLCEL(
  images: CreateVirtualImagesRequest['images'],
  userId: string,
  jobId: string,
  requestId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const config = getLCELConfig()
  
  try {
    console.log(`📡 [${requestId}] Creating ${images.length} virtual images via LCEL server`)
    
    // Create a service JWT token for authentication
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // Get user data for token creation
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (!userData.user) {
      throw new Error('User not found');
    }
    
    // Create service token with user context
    const payload = {
      userId,
      jobId,
      images: images.map(img => ({
        user_id: userId, // Add user_id for LCEL server validation
        original_path: img.imagePath,
        original_name: img.originalFileName || 'unknown.jpg',
        hash: `bulk-${jobId}-${img.imagePath.split('/').pop()}`, // Generate hash from path
        fileSize: img.fileSize,
        mimeType: img.contentType || 'image/jpeg',
        metadata: {
          source: 'bulk-upload',
          jobId
        }
      }))
    }
    
    const fullUrl = `${config.baseUrl}${config.endpoints.createVirtualImages}`;
    console.log(`🌐 [${requestId}] Making request to: ${fullUrl}`);
    console.log(`📝 [${requestId}] Payload contains ${payload.images.length} images`);
    
    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'X-User-ID': userId,
          'X-Job-ID': jobId
        },
        body: JSON.stringify(payload)
      });
      
      console.log(`📡 [${requestId}] Response status: ${response.status}`);
      console.log(`📡 [${requestId}] Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [${requestId}] LCEL server error response: ${errorText}`);
        throw new Error(`LCEL server error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`✅ [${requestId}] LCEL server response:`, result);
      console.log(`✅ [${requestId}] Created ${result.data?.successful || 0} virtual images`);
      
      return { success: true, data: result.data?.images || [] };
      
    } catch (fetchError) {
      console.error(`🌐 [${requestId}] Fetch error details:`, {
        url: fullUrl,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        stack: fetchError instanceof Error ? fetchError.stack : undefined
      });
      throw fetchError;
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ [${requestId}] Failed to create virtual images:`, errorMessage)
    return { success: false, error: errorMessage }
  }
}

// Update virtual images via LCEL server
async function updateVirtualImagesViaLCEL(
  updates: UpdateVirtualImagesRequest['results'],
  jobId: string,
  requestId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const config = getLCELConfig()
  
  try {
    console.log(`📡 [${requestId}] Updating ${updates.length} virtual images via LCEL server`)
    
    const payload = {
      jobId,
      updates: updates.map(update => ({
        imagePath: update.imagePath,
        nsfwDetection: {
          isNsfw: update.isNsfw,
          confidenceScore: update.confidenceScore,
          moderationLabels: update.moderationLabels,
          processedAt: new Date().toISOString()
        }
      }))
    }
    
    const fullUrl = `${config.baseUrl}${config.endpoints.updateVirtualImages}`;
    console.log(`🌐 [${requestId}] Making virtual image update request to: ${fullUrl}`);
    console.log(`📝 [${requestId}] Payload contains ${payload.updates.length} updates`);
    
    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'X-Job-ID': jobId
        },
        body: JSON.stringify(payload)
      });
      
      console.log(`📡 [${requestId}] Update response status: ${response.status}`);
      console.log(`📡 [${requestId}] Update response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [${requestId}] LCEL server update error: ${errorText}`);
        throw new Error(`LCEL server error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`✅ [${requestId}] LCEL server update response:`, result);
      console.log(`✅ [${requestId}] Updated ${result.data?.successful || 0} virtual images`);
      
      return { success: true, data: result.data?.images || [] };
      
    } catch (fetchError) {
      console.error(`🌐 [${requestId}] Update fetch error details:`, {
        url: fullUrl,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        stack: fetchError instanceof Error ? fetchError.stack : undefined
      });
      throw fetchError;
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ [${requestId}] Failed to update virtual images:`, errorMessage)
    return { success: false, error: errorMessage }
  }
}

// Main request handler
async function handleRequest(req: Request): Promise<Response> {
  const requestId = generateRequestId()
  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()
  
  console.log(`🚀 [${requestId}] Virtual Image Bridge: ${req.method} ${action}`)
  
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      })
    }

    if (req.method !== 'POST') {
      return createErrorResponse(
        'Method not allowed',
        'Only POST method is allowed',
        'METHOD_NOT_ALLOWED',
        requestId,
        405
      )
    }

    // Parse request body
    let body: any
    try {
      const requestText = await req.text()
      body = JSON.parse(requestText)
    } catch (error) {
      return createErrorResponse(
        'Invalid JSON',
        'Request body must be valid JSON',
        'VALIDATION_ERROR',
        requestId,
        400
      )
    }

    // Route to appropriate handler
    switch (action) {
      case 'create':
        return await handleCreateVirtualImages(body, requestId)
      case 'update':
        return await handleUpdateVirtualImages(body, requestId)
      default:
        return createErrorResponse(
          'Unknown action',
          `Action '${action}' not supported. Use 'create' or 'update'`,
          'VALIDATION_ERROR',
          requestId,
          400
        )
    }

  } catch (error) {
    console.error(`❌ [${requestId}] Unexpected error:`, error)
    return createErrorResponse(
      'Internal server error',
      error instanceof Error ? error.message : 'Unknown error',
      'INTERNAL_ERROR',
      requestId,
      500
    )
  }
}

// Handle virtual image creation
async function handleCreateVirtualImages(
  body: CreateVirtualImagesRequest,
  requestId: string
): Promise<Response> {
  console.log(`📝 [${requestId}] Creating virtual images for job: ${body.jobId}`)
  
  // Validation
  if (!body.jobId || !body.userId || !body.images || !Array.isArray(body.images)) {
    return createErrorResponse(
      'Missing required fields',
      'jobId, userId, and images array are required',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  if (body.images.length === 0) {
    return createErrorResponse(
      'No images provided',
      'Images array cannot be empty',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  // Create virtual images via LCEL server
  const result = await createVirtualImagesViaLCEL(
    body.images,
    body.userId,
    body.jobId,
    requestId
  )

  if (!result.success) {
    return createErrorResponse(
      'Failed to create virtual images',
      result.error || 'Unknown error',
      'LCEL_ERROR',
      requestId,
      500
    )
  }

  const response: VirtualImageBridgeResponse = {
    success: true,
    processedCount: result.data?.length || 0,
    failedCount: body.images.length - (result.data?.length || 0),
    virtualImages: result.data,
    request_id: requestId
  }

  console.log(`✅ [${requestId}] Created ${response.processedCount} virtual images`)

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  })
}

// Handle virtual image updates
async function handleUpdateVirtualImages(
  body: UpdateVirtualImagesRequest,
  requestId: string
): Promise<Response> {
  console.log(`🔄 [${requestId}] Updating virtual images for job: ${body.jobId}`)
  
  // Validation
  if (!body.jobId || !body.results || !Array.isArray(body.results)) {
    return createErrorResponse(
      'Missing required fields',
      'jobId and results array are required',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  if (body.results.length === 0) {
    return createErrorResponse(
      'No results provided',
      'Results array cannot be empty',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  // Update virtual images via LCEL server
  const result = await updateVirtualImagesViaLCEL(
    body.results,
    body.jobId,
    requestId
  )

  if (!result.success) {
    return createErrorResponse(
      'Failed to update virtual images',
      result.error || 'Unknown error',
      'LCEL_ERROR',
      requestId,
      500
    )
  }

  const response: VirtualImageBridgeResponse = {
    success: true,
    processedCount: result.data?.length || 0,
    failedCount: body.results.length - (result.data?.length || 0),
    virtualImages: result.data,
    request_id: requestId
  }

  console.log(`✅ [${requestId}] Updated ${response.processedCount} virtual images`)

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  })
}

// Serve with error handling
serve(async (req: Request): Promise<Response> => {
  try {
    return await handleRequest(req)
  } catch (error) {
    console.error(`❌ Unhandled error in virtual-image-bridge:`, error)
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: 'INTERNAL_ERROR',
      request_id: generateRequestId()
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
