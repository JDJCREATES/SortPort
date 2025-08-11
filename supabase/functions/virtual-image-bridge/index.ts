// Deno Edge Function for Supabase
// @ts-ignore: Deno environment
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-ignore: Remote imports for Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Remote imports for Deno  
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ================================================================================
// VIRTUAL IMAGE BRIDGE - DIRECT SUPABASE OPERATIONS
// ================================================================================
// This edge function handles:
// 1. Creating virtual images after S3 upload
// 2. Updating virtual images after Rekognition processing
// 3. Batch operations for performance
// Note: This function only does direct Supabase operations, no external calls
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
    mlkit_data?: {
      virtual_tags: string[]
      detected_objects: string[]
      emotion_detected: string[]
      activity_detected: string[]
      detected_faces_count: number
      quality_score: number | null
      brightness_score: number | null
      blur_score: number | null
      aesthetic_score: number | null
      scene_type: string | null
      image_orientation: string | null
      has_text: boolean
      caption?: string
      vision_summary?: string
      metadata?: any
    }
    exif_data?: {
      date_taken?: string | null
      date_modified?: string | null
      location_lat?: number | null
      location_lng?: number | null
      camera_make?: string | null
      camera_model?: string | null
      camera_lens?: string | null
      camera_settings?: any | null
      image_width?: number | null
      image_height?: number | null
      orientation?: number | null
      file_format?: string | null
      color_space?: string | null
      iso_speed?: number | null
      exposure_time?: string | null
      f_number?: number | null
      focal_length?: number | null
      white_balance?: string | null
      flash_used?: boolean | null
      metadata?: any
    }
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

// Create virtual images directly in Supabase database
async function createVirtualImagesDirectly(
  images: CreateVirtualImagesRequest['images'],
  userId: string,
  jobId: string,
  requestId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  
  try {
    console.log(`� [${requestId}] Creating ${images.length} virtual images directly in Supabase database`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Validate user exists
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (!userData.user) {
      throw new Error('User not found');
    }
    
    // Prepare virtual image records for database insertion
    const virtualImageRecords = images.map((img, index) => {
      const baseRecord: any = {
        user_id: userId,
        original_path: img.imagePath,
        original_name: img.originalFileName || 'unknown.jpg',
        hash: `bulk-${jobId}-${img.imagePath.split('/').pop()}`,
        metadata: {
          source: 'bulk-upload',
          jobId,
          s3Key: img.s3Key,
          uploadOrder: img.uploadOrder || index,
          mlkit_analysis: img.mlkit_data?.metadata || null,
          exif_analysis: img.exif_data?.metadata || null
        }
      };

      // Enhanced record with ML Kit and EXIF data
      let enhancedRecord: any = { ...baseRecord };

      // 🧠 INTEGRATE ML KIT DATA if available
      if (img.mlkit_data) {
        console.log(`🧠 [${requestId}] Adding ML Kit data for image ${index + 1}: ${img.originalFileName}`);
        enhancedRecord = {
          ...enhancedRecord,
          // ML Kit mapped fields
          virtual_tags: img.mlkit_data.virtual_tags || [],
          detected_objects: img.mlkit_data.detected_objects || [],
          emotion_detected: img.mlkit_data.emotion_detected || [],
          activity_detected: img.mlkit_data.activity_detected || [],
          detected_faces_count: img.mlkit_data.detected_faces_count || 0,
          quality_score: img.mlkit_data.quality_score,
          brightness_score: img.mlkit_data.brightness_score,
          blur_score: img.mlkit_data.blur_score,
          aesthetic_score: img.mlkit_data.aesthetic_score,
          scene_type: img.mlkit_data.scene_type,
          image_orientation: img.mlkit_data.image_orientation,
          has_text: img.mlkit_data.has_text || false,
          caption: img.mlkit_data.caption,
          vision_summary: img.mlkit_data.vision_summary
        };
      }

      // 📸 INTEGRATE EXIF DATA if available
      if (img.exif_data) {
        console.log(`� [${requestId}] Adding EXIF data for image ${index + 1}: ${img.originalFileName}`);
        enhancedRecord = {
          ...enhancedRecord,
          // EXIF mapped fields
          date_taken: img.exif_data.date_taken,
          date_modified: img.exif_data.date_modified,
          location_lat: img.exif_data.location_lat,
          location_lng: img.exif_data.location_lng,
          camera_make: img.exif_data.camera_make,
          camera_model: img.exif_data.camera_model,
          camera_lens: img.exif_data.camera_lens,
          camera_settings: img.exif_data.camera_settings,
          image_width: img.exif_data.image_width,
          image_height: img.exif_data.image_height,
          orientation: img.exif_data.orientation,
          file_format: img.exif_data.file_format,
          color_space: img.exif_data.color_space,
          iso_speed: img.exif_data.iso_speed,
          exposure_time: img.exif_data.exposure_time,
          f_number: img.exif_data.f_number,
          focal_length: img.exif_data.focal_length,
          white_balance: img.exif_data.white_balance,
          flash_used: img.exif_data.flash_used
        };
        
        console.log(`📸 [${requestId}] EXIF summary for ${img.originalFileName}: date_taken=${img.exif_data.date_taken}, GPS=${!!(img.exif_data.location_lat && img.exif_data.location_lng)}, camera=${img.exif_data.camera_make} ${img.exif_data.camera_model}`);
      }

      const hasMLKit = !!img.mlkit_data;
      const hasEXIF = !!img.exif_data;
      console.log(`📋 [${requestId}] Creating record for image ${index + 1}: ${img.originalFileName} (ML Kit: ${hasMLKit}, EXIF: ${hasEXIF})`);
      
      return enhancedRecord;
    });
    
    console.log(`� [${requestId}] Inserting ${virtualImageRecords.length} virtual images into database`);
    
    // Insert virtual images into database
    const { data: insertedVirtualImages, error: insertError } = await supabase
      .from('virtual_image')
      .insert(virtualImageRecords)
      .select('id, original_path, virtual_name');
    
    if (insertError) {
      console.error(`❌ [${requestId}] Failed to insert virtual images:`, insertError);
      throw new Error(`Database insertion failed: ${insertError.message}`);
    }
    
    if (!insertedVirtualImages || insertedVirtualImages.length === 0) {
      throw new Error('No virtual images were created');
    }
    
    console.log(`✅ [${requestId}] Successfully created ${insertedVirtualImages.length} virtual images`);
    
    // Store job-virtual image relationships
    const relationships = insertedVirtualImages.map((virtualImage: any, index: number) => {
      const originalImageData = images[index];
      return {
        job_id: jobId,
        virtual_image_id: virtualImage.id,
        s3_key: originalImageData?.s3Key || null,
        upload_order: originalImageData?.uploadOrder !== undefined ? originalImageData.uploadOrder : index
      };
    });
    
    console.log(`🔗 [${requestId}] Creating ${relationships.length} job-virtual image relationships`);
    
    const { data: insertedRelationships, error: relationshipError } = await supabase
      .from('bulk_job_virtual_images')
      .insert(relationships)
      .select('*');
    
    if (relationshipError) {
      console.error(`❌ [${requestId}] Failed to store job-virtual image relationships:`, relationshipError);
      // Don't fail the entire operation, just warn
      console.warn(`⚠️ [${requestId}] Virtual images created but relationships may be missing`);
    } else {
      console.log(`✅ [${requestId}] Successfully stored ${insertedRelationships?.length || 0} job relationships`);
    }
    
    return {
      success: true,
      data: insertedVirtualImages
    };
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error creating virtual images directly:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Update virtual images directly in Supabase database
async function updateVirtualImagesDirectly(
  updates: UpdateVirtualImagesRequest['updates'],
  jobId: string,
  userId: string,
  requestId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  
  try {
    console.log(`🔄 [${requestId}] Updating ${updates.length} virtual images directly in Supabase database`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const updatedImages = [];
    let successful = 0;
    let failed = 0;
    
    // Process each update individually for better error handling
    for (const update of updates) {
      try {
        if (!update.virtualImageId) {
          console.warn(`⚠️ [${requestId}] Skipping update with missing virtualImageId`);
          failed++;
          continue;
        }
        
        // Build update object using object spread and filter approach
        const baseUpdate = {
          updated_at: new Date().toISOString()
        };
        
        const nsfwUpdate = {
          ...(update.isNsfw !== undefined && update.isNsfw !== null && { isflagged: update.isNsfw }),
          ...(update.confidenceScore !== undefined && update.confidenceScore !== null && { nsfw_score: update.confidenceScore })
    
        };
        
        const rekognitionUpdate = update.fullRekognitionData ? {
          rekognition_data: update.fullRekognitionData
        } : {};
        
        // Handle comprehensive fields with nested spread
        const mlkitUpdate = update.comprehensiveFields ? Object.entries({
          virtual_tags: update.comprehensiveFields.virtual_tags,
          detected_objects: update.comprehensiveFields.detected_objects,
          emotion_detected: update.comprehensiveFields.emotion_detected,
          activity_detected: update.comprehensiveFields.activity_detected,
          detected_faces_count: update.comprehensiveFields.detected_faces_count,
          quality_score: update.comprehensiveFields.quality_score,
          brightness_score: update.comprehensiveFields.brightness_score,
          blur_score: update.comprehensiveFields.blur_score,
          aesthetic_score: update.comprehensiveFields.aesthetic_score,
          scene_type: update.comprehensiveFields.scene_type,
          image_orientation: update.comprehensiveFields.image_orientation,
          caption: update.comprehensiveFields.caption,
          vision_summary: update.comprehensiveFields.vision_summary,
          nsfw_score: update.comprehensiveFields.nsfw_score,
          isflagged: update.comprehensiveFields.isflagged,
          // REMOVED: rekognition_data from here to prevent override
          dominant_colors: update.comprehensiveFields.dominant_colors
        }).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && 
              (typeof value !== 'string' || value.trim() !== '') &&
              (!Array.isArray(value) || value.length > 0)) {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, any>) : {};
        
        // Combine all updates
        const finalUpdate = {
          ...baseUpdate,
          ...nsfwUpdate,
          ...rekognitionUpdate,
          ...mlkitUpdate
        };

        // SAFETY: Remove any is_nsfw field that might have accidentally been included
        // Virtual_image table should only use isflagged, not is_nsfw
        if ('is_nsfw' in finalUpdate) {
          console.warn(`⚠️ [${requestId}] Removing is_nsfw field from update for ${update.virtualImageId} - using isflagged instead`);
          delete finalUpdate.is_nsfw;
        }

        // Debug rekognition data preservation
        console.log(`🔍 [${requestId}] Rekognition data check for ${update.virtualImageId}:`, {
          hasFullRekognitionData: !!update.fullRekognitionData,
          rekognitionDataInFinal: !!finalUpdate.rekognition_data,
          rekognitionDataKeys: finalUpdate.rekognition_data ? Object.keys(finalUpdate.rekognition_data) : [],
          finalUpdateKeys: Object.keys(finalUpdate)
        });
        
        // Skip if only timestamp
        if (Object.keys(finalUpdate).length <= 1) {
          console.warn(`⚠️ [${requestId}] No fields to update for virtual image ${update.virtualImageId}`);
          failed++;
          continue;
        }
        
        console.log(`🔄 [${requestId}] Updating virtual image ${update.virtualImageId} with ${Object.keys(finalUpdate).length} fields`);
        
        // Perform the update
        const { data: updatedRecord, error: updateError } = await supabase
          .from('virtual_image')
          .update(finalUpdate)
          .eq('id', update.virtualImageId)
          .eq('user_id', userId)
          .select('id, original_path, virtual_name, isflagged, rekognition_data')
          .single();
        
        if (updateError) {
          console.error(`❌ [${requestId}] Failed to update virtual image ${update.virtualImageId}:`, updateError);
          failed++;
          continue;
        }
        
        if (!updatedRecord) {
          console.warn(`⚠️ [${requestId}] No record found or access denied for virtual image ${update.virtualImageId}`);
          failed++;
          continue;
        }
        
        updatedImages.push({
          success: true,
          imageId: update.virtualImageId,
          imagePath: update.imagePath || updatedRecord.original_path,
          virtualImageId: updatedRecord.id,
          type: update.fullRekognitionData ? 'full-rekognition' : 'partial-update'
        });
        
        successful++;
        console.log(`✅ [${requestId}] Successfully updated virtual image ${update.virtualImageId}`);
        
      } catch (updateError) {
        console.error(`❌ [${requestId}] Exception updating virtual image ${update.virtualImageId}:`, updateError);
        failed++;
      }
    }
    
    console.log(`✅ [${requestId}] Direct update completed: ${successful} successful, ${failed} failed`);
    
    return {
      success: successful > 0,
      data: updatedImages
    };
    
  } catch (error) {
    console.error(`❌ [${requestId}] Direct update function failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
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

  console.log(`🚀 [${requestId}] Starting virtual image creation...`)

  // Create virtual images directly in Supabase
  const result = await createVirtualImagesDirectly(
    body.images,
    body.userId,
    body.jobId,
    requestId
  )

  console.log(`🔍 [${requestId}] Direct creation result:`, {
    success: result.success,
    error: result.error,
    dataLength: result.data?.length || 0
  })

  if (!result.success) {
    console.error(`❌ [${requestId}] Direct creation failed:`, result.error)
    return createErrorResponse(
      'Failed to create virtual images',
      result.error || 'Unknown error',
      'CREATION_ERROR',
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
        const batchResult = await updateVirtualImagesDirectly(
          batch,
          body.jobId,
          body.userId || '', // Provide empty string as fallback
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
      const result = await updateVirtualImagesDirectly(
        body.updates,
        body.jobId,
        body.userId || '', // Provide empty string as fallback
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
