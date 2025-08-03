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
    s3Key?: string // Add S3 key for tracking
    uploadOrder?: number // Add upload order for correlation
  }[]
}

interface UpdateVirtualImagesRequest {
  jobId: string
  userId?: string // NEW: Add optional userId for authentication
  updates: {
    virtualImageId: string // FIXED: Use database ID instead of path
    isNsfw: boolean
    confidenceScore: number
    moderationLabels: string[]
    fullRekognitionData?: any // Optional full AWS Rekognition response
    comprehensiveFields?: { // NEW: Comprehensive virtual_image fields
      virtual_tags?: string[]
      detected_objects?: string[]
      scene_type?: string | null
      detected_faces_count?: number | null
      emotion_detected?: string[]
      activity_detected?: string[]
      caption?: string | null
      vision_summary?: string | null
      quality_score?: number | null
      brightness_score?: number | null
      blur_score?: number | null
      aesthetic_score?: number | null
      dominant_colors?: any | null
      image_orientation?: string | null
      nsfw_score?: number | null
      isflagged?: boolean | null
      rekognition_data?: any | null
    }
    imagePath?: string // DEPRECATED: Keep for backwards compatibility only
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`🔧 [${requestId}] Supabase client initialized for relationships storage`);
    
    // Get user data for token creation
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (!userData.user) {
      throw new Error('User not found');
    }
    
    // Create service token with user context
    const payload = {
      userId,
      jobId,
      images: images.map((img, index) => ({
        user_id: userId, // Add user_id for LCEL server validation
        original_path: img.imagePath,
        original_name: img.originalFileName || 'unknown.jpg',
        hash: `bulk-${jobId}-${img.imagePath.split('/').pop()}`, // Generate hash from path
        fileSize: img.fileSize,
        mimeType: img.contentType || 'image/jpeg',
        metadata: {
          source: 'bulk-upload',
          jobId,
          s3Key: img.s3Key,
          uploadOrder: img.uploadOrder || index
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
      
      // CRITICAL: Store job-virtual image relationships using database IDs
      console.log(`🔍 [${requestId}] Checking response structure:`, {
        hasData: !!result.data,
        hasImages: !!result.data?.images,
        imagesIsArray: Array.isArray(result.data?.images),
        imagesLength: result.data?.images?.length || 0,
        sampleImage: result.data?.images?.[0] ? {
          id: result.data.images[0].id,
          hasId: !!result.data.images[0].id
        } : null
      });
      
      if (result.data?.images && Array.isArray(result.data.images)) {
        try {
          console.log(`🔗 [${requestId}] Storing ${result.data.images.length} job-virtual image relationships`);
          
          // Validate that we have valid virtual image IDs
          const validVirtualImages = result.data.images.filter((vi: any) => vi && vi.id);
          if (validVirtualImages.length !== result.data.images.length) {
            console.warn(`⚠️ [${requestId}] Some virtual images missing IDs: ${validVirtualImages.length}/${result.data.images.length} valid`);
          }
          
          if (validVirtualImages.length === 0) {
            console.error(`❌ [${requestId}] No valid virtual images with IDs found - cannot create relationships`);
            return { success: true, data: result.data?.images || [] };
          }
          
          const relationships = validVirtualImages.map((virtualImage: any, index: number) => {
            const originalImageData = images[index];
            const relationship = {
              job_id: jobId,
              virtual_image_id: virtualImage.id,
              s3_key: originalImageData?.s3Key || null,
              upload_order: originalImageData?.uploadOrder !== undefined ? originalImageData.uploadOrder : index
            };
            
            console.log(`🔗 [${requestId}] Creating relationship ${index}: virtualImageId=${virtualImage.id}, s3Key=${relationship.s3_key}, uploadOrder=${relationship.upload_order}`);
            return relationship;
          });
          
          console.log(`💾 [${requestId}] Inserting ${relationships.length} relationships into bulk_job_virtual_images table`);
          
          const { data: insertedData, error: relationshipError } = await supabase
            .from('bulk_job_virtual_images')
            .insert(relationships)
            .select('*');
            
          if (relationshipError) {
            console.error(`❌ [${requestId}] Failed to store job-virtual image relationships:`, {
              error: relationshipError,
              message: relationshipError.message,
              details: relationshipError.details,
              hint: relationshipError.hint
            });
            // Don't fail the entire operation, but log the issue
          } else {
            console.log(`✅ [${requestId}] Successfully stored ${insertedData?.length || relationships.length} job-virtual image relationships`);
            console.log(`🔍 [${requestId}] Sample stored relationship:`, insertedData?.[0]);
          }
        } catch (relationshipStoreError) {
          console.error(`❌ [${requestId}] Exception storing relationships:`, {
            error: relationshipStoreError,
            message: relationshipStoreError instanceof Error ? relationshipStoreError.message : String(relationshipStoreError),
            stack: relationshipStoreError instanceof Error ? relationshipStoreError.stack : undefined
          });
          // Don't fail the entire operation
        }
      } else {
        console.error(`❌ [${requestId}] Cannot store relationships - invalid response structure:`, {
          hasData: !!result.data,
          hasImages: !!result.data?.images,
          imagesType: typeof result.data?.images,
          isArray: Array.isArray(result.data?.images)
        });
      }
      
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
  updates: UpdateVirtualImagesRequest['updates'],
  jobId: string,
  userId: string | undefined, // NEW: Add userId parameter
  requestId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const config = getLCELConfig()
  
  try {
    console.log(`📡 [${requestId}] Updating ${updates.length} virtual images via LCEL server`)
    console.log(`🔍 [${requestId}] Update params: jobId=${jobId}, userId=${userId}, configUrl=${config.baseUrl}`)
    
    // Log sample update data for debugging
    if (updates.length > 0) {
      const sampleUpdate = updates[0];
      console.log(`🔍 [${requestId}] Sample update data:`, {
        imagePath: sampleUpdate.imagePath,
        isNsfw: sampleUpdate.isNsfw,
        hasFullRekognitionData: !!sampleUpdate.fullRekognitionData,
        fullRekognitionDataKeys: sampleUpdate.fullRekognitionData ? Object.keys(sampleUpdate.fullRekognitionData) : []
      });
    }
    
    const payload = {
      jobId,
      updates: updates.map(update => ({
        virtualImageId: update.virtualImageId, // Use database ID for tracking
        imagePath: update.imagePath || update.virtualImageId, // Fallback for backwards compatibility
        // Backwards compatible NSFW data (always included)
        nsfwDetection: {
          isNsfw: update.isNsfw,
          confidenceScore: update.confidenceScore,
          moderationLabels: update.moderationLabels,
          processedAt: new Date().toISOString()
        },
        // Enhanced: Include full rekognition data if available
        fullRekognitionData: update.fullRekognitionData || null,
        // NEW: Include comprehensive virtual_image fields for direct database updates
        comprehensiveFields: update.comprehensiveFields || {
          // Fallback to legacy NSFW data if comprehensive fields not available
          nsfw_score: update.confidenceScore,
          isflagged: update.isNsfw,
          rekognition_data: update.fullRekognitionData
        }
      }))
    }
    
    const fullUrl = `${config.baseUrl}${config.endpoints.updateVirtualImages}`;
    console.log(`🌐 [${requestId}] Making virtual image update request to: ${fullUrl}`);
    console.log(`📝 [${requestId}] Payload contains ${payload.updates.length} updates`);
    
    // NEW: Add retry logic for rate limiting
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay
    
    while (retryCount <= maxRetries) {
      try {
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'X-Job-ID': jobId,
            // NEW: Add X-User-ID header if userId is provided
            ...(userId ? { 'X-User-ID': userId } : {})
          },
          body: JSON.stringify(payload)
        });
        
        console.log(`📡 [${requestId}] Update response status: ${response.status} (attempt ${retryCount + 1})`);
        console.log(`📡 [${requestId}] Update response headers:`, Object.fromEntries(response.headers.entries()));
        
        // Check if it's a rate limit error (429 or 503)
        if (response.status === 429 || response.status === 503) {
          retryCount++;
          if (retryCount <= maxRetries) {
            const delayMs = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
            const maxDelay = 30000; // 30 seconds max
            const actualDelay = Math.min(delayMs, maxDelay);
            
            console.log(`⏳ [${requestId}] Rate limited (${response.status}), retrying in ${actualDelay}ms (attempt ${retryCount}/${maxRetries})`);
            
            // Try to get retry-after header if available
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
              const retryAfterMs = parseInt(retryAfter) * 1000;
              if (retryAfterMs > 0 && retryAfterMs < maxDelay) {
                console.log(`⏳ [${requestId}] Using server's retry-after: ${retryAfterMs}ms`);
                await new Promise(resolve => setTimeout(resolve, retryAfterMs));
              } else {
                await new Promise(resolve => setTimeout(resolve, actualDelay));
              }
            } else {
              await new Promise(resolve => setTimeout(resolve, actualDelay));
            }
            continue; // Try again
          } else {
            const errorText = await response.text();
            console.error(`❌ [${requestId}] Max retries reached for rate limiting. Final error: ${errorText}`);
            throw new Error(`LCEL server rate limited: ${response.status} - ${errorText} (tried ${maxRetries + 1} times)`);
          }
        }
        
        // Handle other errors
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [${requestId}] LCEL server update error: ${errorText}`);
          throw new Error(`LCEL server error: ${response.status} - ${errorText}`);
        }
        
        // Success case
        const result = await response.json();
        console.log(`✅ [${requestId}] LCEL server update response:`, result);
        console.log(`✅ [${requestId}] Updated ${result.data?.successful || 0} virtual images (success after ${retryCount} retries)`);
        
        return { success: true, data: result.data?.images || [] };
        
      } catch (fetchError) {
        // If it's not a rate limit error, or we've exceeded retries, throw immediately
        if (retryCount >= maxRetries || 
            !(fetchError instanceof Error && fetchError.message.includes('rate limited'))) {
          console.error(`🌐 [${requestId}] Update fetch error details:`, {
            url: fullUrl,
            error: fetchError instanceof Error ? fetchError.message : String(fetchError),
            stack: fetchError instanceof Error ? fetchError.stack : undefined,
            retryCount
          });
          throw fetchError;
        }
        
        // If it's a network error that might be rate-limit related, try again
        retryCount++;
        if (retryCount <= maxRetries) {
          const delayMs = baseDelay * Math.pow(2, retryCount - 1);
          console.log(`⏳ [${requestId}] Network error, retrying in ${delayMs}ms: ${fetchError.message}`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw fetchError;
        }
      }
    }
    
    // This should never be reached due to the loop logic, but TypeScript requires it
    throw new Error(`Failed to update virtual images after ${maxRetries + 1} attempts`);
    
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
  console.log(`🔍 [${requestId}] Request validation: jobId=${body.jobId}, userId=${body.userId}, imageCount=${body.images?.length}`)
  
  // Validation
  if (!body.jobId || !body.userId || !body.images || !Array.isArray(body.images)) {
    console.error(`❌ [${requestId}] Validation failed: missing required fields`)
    return createErrorResponse(
      'Missing required fields',
      'jobId, userId, and images array are required',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  if (body.images.length === 0) {
    console.error(`❌ [${requestId}] Validation failed: empty images array`)
    return createErrorResponse(
      'No images provided',
      'Images array cannot be empty',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  console.log(`🚀 [${requestId}] Starting virtual image creation via LCEL server...`)

  // Create virtual images via LCEL server
  const result = await createVirtualImagesViaLCEL(
    body.images,
    body.userId,
    body.jobId,
    requestId
  )

  console.log(`🔍 [${requestId}] LCEL result:`, {
    success: result.success,
    error: result.error,
    dataLength: result.data?.length || 0
  })

  if (!result.success) {
    console.error(`❌ [${requestId}] LCEL server failed:`, result.error)
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

  console.log(`✅ [${requestId}] Virtual image creation completed:`, {
    processed: response.processedCount,
    failed: response.failedCount,
    totalRequested: body.images.length
  })

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
  console.log(`🔍 [${requestId}] Request body validation: jobId=${body.jobId}, userId=${body.userId}, updatesCount=${body.updates?.length}`)
  
  // Enhanced validation with better error messages
  if (!body.jobId) {
    console.error(`❌ [${requestId}] Missing jobId in request body`)
    return createErrorResponse(
      'Missing jobId',
      'jobId is required for virtual image updates',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  if (!body.updates || !Array.isArray(body.updates)) {
    console.error(`❌ [${requestId}] Missing or invalid updates array: ${typeof body.updates}`)
    return createErrorResponse(
      'Missing updates array',
      'updates must be an array of update objects',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  if (body.updates.length === 0) {
    return createErrorResponse(
      'No updates provided',
      'Updates array cannot be empty',
      'VALIDATION_ERROR',
      requestId,
      400
    )
  }

  // NEW: Split large batches to avoid rate limiting
  const BATCH_SIZE = 20; // Process max 20 images at a time
  let totalProcessed = 0;
  let totalFailed = 0;
  let allVirtualImages: any[] = [];
  
  if (body.updates.length > BATCH_SIZE) {
    console.log(`📦 [${requestId}] Processing ${body.updates.length} updates in batches of ${BATCH_SIZE}`);
    
    // Process in batches with delay between them
    for (let i = 0; i < body.updates.length; i += BATCH_SIZE) {
      const batch = body.updates.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(body.updates.length / BATCH_SIZE);
      
      console.log(`📦 [${requestId}] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
      
      // Add small delay between batches to avoid overwhelming the server
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      }
      
      try {
        const batchResult = await updateVirtualImagesViaLCEL(
          batch,
          body.jobId,
          body.userId || undefined, // NEW: Ensure proper undefined handling
          `${requestId}-batch-${batchNumber}`
        );
        
        if (batchResult.success) {
          totalProcessed += batchResult.data?.length || 0;
          if (batchResult.data) {
            allVirtualImages.push(...batchResult.data);
          }
          console.log(`✅ [${requestId}] Batch ${batchNumber} completed: ${batchResult.data?.length || 0} processed`);
        } else {
          console.error(`❌ [${requestId}] Batch ${batchNumber} failed:`, batchResult.error);
          totalFailed += batch.length;
          // Continue with next batch instead of failing entirely
        }
      } catch (batchError) {
        console.error(`❌ [${requestId}] Batch ${batchNumber} exception:`, batchError);
        totalFailed += batch.length;
        // Continue with next batch
      }
    }
    
    const response: VirtualImageBridgeResponse = {
      success: totalProcessed > 0, // Success if at least some processed
      processedCount: totalProcessed,
      failedCount: totalFailed,
      virtualImages: allVirtualImages,
      request_id: requestId
    };
    
    console.log(`✅ [${requestId}] Batch processing complete: ${totalProcessed} processed, ${totalFailed} failed`);
    
    return new Response(JSON.stringify(response), {
      status: totalProcessed > 0 ? 200 : 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
    
  } else {
    // Handle small batches normally
    console.log(`🔄 [${requestId}] Processing ${body.updates.length} updates in single batch`);
    
    try {
      const result = await updateVirtualImagesViaLCEL(
        body.updates,
        body.jobId,
        body.userId || undefined, // NEW: Ensure proper undefined handling
        requestId
      );

      if (!result.success) {
        console.error(`❌ [${requestId}] Single batch update failed:`, result.error);
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
        failedCount: body.updates.length - (result.data?.length || 0),
        virtualImages: result.data,
        request_id: requestId
      };

      console.log(`✅ [${requestId}] Updated ${response.processedCount} virtual images`);

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
      
    } catch (singleError) {
      console.error(`❌ [${requestId}] Single batch exception:`, singleError);
      return createErrorResponse(
        'Failed to update virtual images',
        singleError instanceof Error ? singleError.message : 'Unknown error',
        'LCEL_ERROR',
        requestId,
        500
      )
    }
  }
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
