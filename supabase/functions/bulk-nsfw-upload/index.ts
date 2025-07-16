import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  S3Client, 
  PutObjectCommand,
  CreateBucketCommand,
} from "npm:@aws-sdk/client-s3@^3.840.0"

/**
 * Bulk upload images to S3
 */

// Interfaces
interface BulkUploadResponse {
  jobId: string
  bucketName: string
  uploadedCount: number
  failedCount: number
  status: string
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
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateJobId(): string {
  return crypto.randomUUID()
}

// Cleanup function
async function cleanupTempBucket(bucketName: string): Promise<void> {
  try {
    console.log(`🧹 Initiating cleanup for temp bucket: ${bucketName}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data, error } = await supabase.functions.invoke('cleanup-temp-buckets', {
      body: {
        bucketName,
        force: true
      }
    });

    if (error) {
      console.error('❌ Failed to cleanup temp bucket:', error);
    } else {
      console.log('✅ Temp bucket cleanup initiated:', data);
    }
    
  } catch (error) {
    console.error('❌ Error calling cleanup function:', error);
  }
}

// Error response helper with cleanup
async function createErrorResponse(
  error: string,
  details: string,
  type: string,
  requestId: string,
  status: number,
  bucketName?: string
): Promise<Response> {
  console.log(`🚨 Creating error response: ${error} (${type}) - Status: ${status}`);
  
  if (bucketName && typeof bucketName === 'string') {
    console.log(`🧹 Cleaning up bucket due to error: ${bucketName}`);
    await cleanupTempBucket(bucketName);
  } else if (bucketName) {
    console.error(`❌ Invalid bucketName type for cleanup:`, typeof bucketName, bucketName);
  }
  
  const errorResponse = {
    error,
    details,
    type,
    request_id: requestId
  } as ErrorResponse;
  
  console.log(`📤 Sending error response:`, errorResponse);
  
  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Parse multipart/form-data and upload binary files to S3
async function uploadBinaryFilesToS3(
  s3Client: S3Client,
  bucketName: string,
  formData: any,
  batchIndex: number
): Promise<{ successCount: number; failedCount: number }> {
  console.log(`📤 Processing binary files from FormData for batch ${batchIndex}`);
  
  let successCount = 0;
  let failedCount = 0;
  let imageIndex = 0;
  
  // Collect all image files using sequential key checking
  const imageFiles: Array<{ key: string; file: File }> = [];
  
  console.log(`🔍 Scanning for image files in FormData...`);
  
  // Check for images with sequential keys - OPTIMIZED: reduce scan range
  for (let i = 0; i < 50; i++) { // Reduced from 1000 to 50
    const key = `image_${i}`;
    try {
      const file = formData.get(key);
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        console.log(`✅ Found ${key}: ${file.name || 'unknown'} (${file.size || 0} bytes, type: ${file.type || 'unknown'})`);
        imageFiles.push({ key, file: file as File });
      } else if (i > 5 && imageFiles.length === 0) { // Reduced from 10 to 5
        console.log(`⏹️ No images found after checking ${i} keys, stopping scan`);
        break;
      }
    } catch (error) {
      console.error(`❌ Error checking key ${key}:`, error);
      continue;
    }
  }
  
  console.log(`📊 Found ${imageFiles.length} image files in FormData`);
  
  if (imageFiles.length === 0) {
    console.warn(`⚠️ No image files found in FormData for batch ${batchIndex}`);
    return { successCount: 0, failedCount: 0 };
  }
  
  // MAJOR OPTIMIZATION: Process uploads in parallel instead of sequential
  const uploadPromises = imageFiles.map(async ({ key, file }, index) => {
    try {
      console.log(`📤 Processing ${key}: ${file.name || 'unknown'} (${file.size || 0} bytes)`);
      
      // Validate file size (max 50MB per image)
      if (file.size > 50 * 1024 * 1024) {
        console.error(`❌ File ${key} too large: ${file.size} bytes`);
        return { success: false, key };
      }
      
      // Read file as ArrayBuffer (raw binary data) - OPTIMIZED: remove extra logging
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Generate S3 key
      const s3Key = `input/batch-${batchIndex}-image-${index.toString().padStart(4, '0')}.jpg`;
      
      console.log(`☁️ Uploading ${key} to S3: ${s3Key}`);
      
      // Upload raw binary data to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: uint8Array,
        ContentType: file.type || 'image/jpeg',
        ContentLength: uint8Array.length,
      }));
      
      console.log(`✅ Uploaded ${key} to S3: ${s3Key} (${uint8Array.length} bytes)`);
      return { success: true, key };
      
    } catch (error) {
      console.error(`❌ Failed to upload ${key}:`, error);
      return { success: false, key };
    }
  });
  
  // Wait for all uploads to complete
  const results = await Promise.all(uploadPromises);
  
  // Count results
  successCount = results.filter(r => r.success).length;
  failedCount = results.filter(r => !r.success).length;
  
  console.log(`✅ Batch ${batchIndex} upload complete: ${successCount} success, ${failedCount} failed`);
  return { successCount, failedCount };
}

// Add this before the main serve function
function isHealthCheck(req: Request): boolean {
  const url = new URL(req.url);
  return url.pathname.includes('/health') || url.searchParams.has('health');
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  // Handle health check requests
  if (isHealthCheck(req)) {
    console.log('🏥 Health check request received');
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'bulk-nsfw-upload'
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const requestId = generateRequestId();
  let bucketName: string | undefined = undefined;
  
  console.log(`🚀 [${requestId}] Received ${req.method} request to bulk-nsfw-upload`);
  
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      console.log(`✅ [${requestId}] Handling CORS preflight`);
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    if (req.method !== 'POST') {
      console.log(`❌ [${requestId}] Invalid method: ${req.method}`);
      return createErrorResponse(
        'Method not allowed',
        'Only POST method is allowed',
        'METHOD_NOT_ALLOWED',
        requestId,
        405,
        bucketName
      );
    }

    // Check Content-Type for multipart/form-data
    const contentType = req.headers.get('content-type') || '';
    console.log(`📋 [${requestId}] Content-Type: ${contentType}`);
    
    if (!contentType.includes('multipart/form-data')) {
      console.log(`❌ [${requestId}] Invalid content type: ${contentType}`);
      return createErrorResponse(
        'Invalid content type',
        'Expected multipart/form-data',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName
      );
    }

    console.log(`📥 [${requestId}] Received multipart/form-data request`);

    // Parse multipart/form-data with timeout
    let formData: any;
    try {
      console.log(`🔄 [${requestId}] Parsing FormData...`);
      const parseStartTime = Date.now();
      
      formData = await req.formData();
      
      const parseTime = Date.now() - parseStartTime;
      console.log(`📊 [${requestId}] FormData parsed successfully in ${parseTime}ms`);
      
      // Enhanced FormData debugging
      const keys = Array.from(formData.keys());
      console.log(`🔑 [${requestId}] FormData keys (${keys.length}): ${keys.join(', ')}`);
      
      // Log details about each entry
      for (const [key, value] of formData.entries()) {
        if (value && typeof value === 'object' && 'arrayBuffer' in value) {
          const file = value as File;
          console.log(`📁 [${requestId}] ${key}: File(${file.name || 'unknown'}, ${file.size || 0} bytes, ${file.type || 'unknown'})`);
        } else {
          console.log(`📝 [${requestId}] ${key}: ${String(value)}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to parse FormData:`, error);
      return createErrorResponse(
        'Failed to parse form data',
        error instanceof Error ? error.message : 'Unknown parsing error',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName
      );
    }

    // Extract metadata using get() method
    let userId: string | null = null;
    let batchIndex = 0;
    let totalImages = 0;
    
    try {
      const userIdValue = formData.get('userId');
      const batchIndexValue = formData.get('batchIndex');
      const totalImagesValue = formData.get('totalImages');
      
      userId = userIdValue ? String(userIdValue) : null;
      batchIndex = batchIndexValue ? parseInt(String(batchIndexValue)) : 0;
      totalImages = totalImagesValue ? parseInt(String(totalImagesValue)) : 0;
      
      console.log(`📋 [${requestId}] Extracted metadata: userId=${userId}, batchIndex=${batchIndex}, totalImages=${totalImages}`);
      
    } catch (error) {
      console.error(`❌ [${requestId}] Error extracting metadata:`, error);
      return createErrorResponse(
        'Failed to extract metadata',
        'Could not read userId, batchIndex, or totalImages from form data',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName
      );
    }

    if (!userId) {
      console.log(`❌ [${requestId}] Missing userId`);
      return createErrorResponse(
        'userId is required',
        'userId parameter is missing from form data',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName
      );
    }

    console.log(`🚀 [${requestId}] Processing binary upload batch ${batchIndex} for user ${userId} (${totalImages} images)`);

    // Count image files in FormData using get() method
    let imageCount = 0;
    
    console.log(`🔢 [${requestId}] Counting image files...`);
    
    // Try to count images by checking sequential keys
    for (let i = 0; i < 1000; i++) {
      const key = `image_${i}`;
      try {
        const file = formData.get(key);
        if (file && typeof file === 'object' && 'arrayBuffer' in file) {
          imageCount++;
        } else if (i > 10 && imageCount === 0) {
          break;
        }
      } catch (error) {
        continue;
      }
    }

    console.log(`📊 [${requestId}] Found ${imageCount} image files in FormData`);

    if (imageCount === 0) {
      console.log(`❌ [${requestId}] No image files found`);
      return createErrorResponse(
        'No image files found',
        'No image files found in form data',
        'VALIDATION_ERROR',
        requestId,
        400,
        bucketName
      );
    }

    // Initialize clients
    console.log(`🔧 [${requestId}] Initializing clients...`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    let s3Client: S3Client;
    try {
      s3Client = getS3Client();
      console.log(`✅ [${requestId}] S3 client initialized`);
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to initialize S3 client:`, error);
      return createErrorResponse(
        'Failed to initialize S3 client',
        error instanceof Error ? error.message : 'Unknown S3 initialization error',
        'S3_ERROR',
        requestId,
        500,
        bucketName
      );
    }

    // Generate job ID and bucket name
    const jobId = generateJobId();
    bucketName = `nsfw-binary-${userId.substring(0, 8)}-${Date.now()}`;

    console.log(`📦 [${requestId}] Creating S3 bucket: ${bucketName} for job: ${jobId}`);

    // Create S3 bucket
    try {
      await s3Client.send(new CreateBucketCommand({
        Bucket: bucketName,
      }));
      console.log(`✅ [${requestId}] Created S3 bucket: ${bucketName}`);
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to create S3 bucket:`, error);
      return createErrorResponse(
        'Failed to create S3 bucket',
        error instanceof Error ? error.message : 'Unknown S3 error',
        'S3_ERROR',
        requestId,
        500,
        bucketName
      );
    }

    // Create database record
    console.log(`💾 [${requestId}] Creating database record for job: ${jobId}`);
    
    const { error: dbError } = await supabase
      .from('nsfw_bulk_jobs')
      .insert({
        id: jobId,
        user_id: userId,
        status: 'uploading',
        total_images: totalImages,
        processed_images: 0,
        nsfw_detected: 0,
        aws_temp_bucket: bucketName,
        bucket_path: `s3://${bucketName}/input/`,
        created_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error(`❌ Database insert error:`, dbError);
      return createErrorResponse(
        'Database error',
        dbError.message,
        'DATABASE_ERROR',
        requestId,
        500,
        bucketName
      );
    }

    // Upload binary files to S3
    console.log(`⚡ Starting binary upload to S3`);
    let uploadResult: { successCount: number; failedCount: number };
    
    try {
      uploadResult = await uploadBinaryFilesToS3(s3Client, bucketName, formData, batchIndex);
    } catch (error) {
      console.error(`❌ Binary upload failed:`, error);
      return createErrorResponse(
        'Binary upload failed',
        error instanceof Error ? error.message : 'Unknown upload error',
        'UPLOAD_ERROR',
        requestId,
        500,
        bucketName
      );
    }

    if (uploadResult.successCount === 0) {
      return createErrorResponse(
        'No images could be uploaded to S3',
        `All ${imageCount} images failed to upload`,
        'UPLOAD_ERROR',
        requestId,
        400,
        bucketName
      );
    }

    console.log(`✅ Binary upload complete: ${uploadResult.successCount}/${imageCount} images uploaded`);

    // Update database with upload results
    await supabase
      .from('nsfw_bulk_jobs')
      .update({
        status: 'uploaded',
        processed_images: uploadResult.successCount,
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // SUCCESS - return response
    return new Response(JSON.stringify({
      jobId,
      bucketName,
      uploadedCount: uploadResult.successCount,
      failedCount: uploadResult.failedCount,
      status: 'uploaded',
      request_id: requestId
    } as BulkUploadResponse), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Unexpected error:`, error);
    return createErrorResponse(
      'Internal server error',
      error instanceof Error ? error.message : 'Unknown error',
      'INTERNAL_ERROR',
      requestId,
      500,
      bucketName
    );
  }
});