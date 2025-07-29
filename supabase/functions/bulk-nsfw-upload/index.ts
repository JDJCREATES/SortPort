import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  S3Client, 
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
  ListObjectsV2Command,
} from "npm:@aws-sdk/client-s3@^3.840.0"

/**
 * Bulk upload images to a temp S3 before AWS Rekognition can scan them
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
  const region = Deno.env.get('AWS_REGION') || 'us-east-2';
  console.log(`🔧 Initializing S3 client in region: ${region}`);
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

// Generate a consistent temp bucket name for a user session
function generateTempBucketName(userId: string): string {
  return `nsfw-temp-${userId.substring(0, 8)}-${Date.now().toString(36)}`
}

// ADD THIS NEW FUNCTION HERE - after the helper functions, before getOrCreateTempBucket
function createBucketPolicyForRekognition(bucketName: string): string {
  const accountId = Deno.env.get('AWS_ACCOUNT_ID');
  
  
  if (!accountId) {
    throw new Error('AWS_ACCOUNT_ID environment variable required');
  }
  
  return JSON.stringify({
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowRekognitionServiceAccess",
        "Effect": "Allow",
        "Principal": {
          "Service": "rekognition.amazonaws.com"
        },
        "Action": [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        "Resource": [
          `arn:aws:s3:::${bucketName}`,
          `arn:aws:s3:::${bucketName}/*`
        ]
      },
      {
        "Sid": "AllowRekognitionServiceRoleAccess", 
        "Effect": "Allow",
        "Principal": {
          "AWS": `arn:aws:iam::${accountId}:role/RekognitionServiceRole`
        },
        "Action": [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        "Resource": [
          `arn:aws:s3:::${bucketName}`,
          `arn:aws:s3:::${bucketName}/*`
        ]
      }
    ]
  });
}

async function createManifestFile(
  s3Client: S3Client,
  bucketName: string,
  objectKeys: string[],
  requestId: string
): Promise<string> {
  console.log(`📝 [${requestId}] Creating manifest file for ${objectKeys.length} objects`);
  
  // Create JSONL manifest content
  const manifestLines = objectKeys.map(key => 
    JSON.stringify({ "source-ref": `s3://${bucketName}/${key}` })
  );
  const manifestContent = manifestLines.join('\n');
  
  const manifestKey = 'manifest.jsonl';
  
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: manifestKey,
      Body: manifestContent,
      ContentType: 'application/jsonl',
    }));
    
    console.log(`✅ [${requestId}] Created manifest file: ${manifestKey} with ${objectKeys.length} entries`);
    console.log(`📄 [${requestId}] Manifest sample:`, manifestLines.slice(0, 3).join('\n'));
    
    return manifestKey;
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to create manifest file:`, error);
    throw error;
  }
}

// Add this function after createManifestFile
async function finalizeUploadSession(
  s3Client: S3Client,
  bucketName: string,
  sessionJobId: string,
  requestId: string
): Promise<void> {
  try {
    console.log(`🏁 [${requestId}] Finalizing upload session: ${sessionJobId}`);
    
    // List all uploaded objects to create manifest
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'input/',
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(listCommand);
    const objects = response.Contents || [];
    const objectKeys = objects
      .map(obj => obj.Key ?? '')
      .filter(key => key.endsWith('.jpg') || key.endsWith('.jpeg') || key.endsWith('.png'));
    
    if (objectKeys.length === 0) {
      throw new Error('No image objects found to create manifest');
    }
    
    // Create manifest file
    const manifestKey = await createManifestFile(s3Client, bucketName, objectKeys, requestId);
    
    // Update database with manifest info
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { error } = await supabase
      .from('nsfw_bulk_jobs')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
        manifest_key: manifestKey, // Store manifest location
        total_images: objectKeys.length, // Update with actual count
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionJobId);
    
    if (error) {
      console.error(`❌ [${requestId}] Failed to update job with manifest:`, error);
    } else {
      console.log(`✅ [${requestId}] Upload session finalized with manifest: ${manifestKey}`);
    }
    
  } catch (error) {
    console.error(`❌ [${requestId}] Error finalizing upload session:`, error);
    throw error;
  }
}

// Get or create a single temp bucket for the user session
async function getOrCreateTempBucket(
  s3Client: S3Client, 
  userId: string,
  requestId: string
): Promise<{ bucketName: string; jobId: string; isNewSession: boolean }> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // FIXED: Look for ANY active job with temp bucket (not just 'uploading')
  const { data: existingJob } = await supabase
    .from('nsfw_bulk_jobs')
    .select('id, aws_temp_bucket, status')
    .eq('user_id', userId)
    .in('status', ['uploading', 'uploaded']) // Include 'uploaded' status
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (existingJob?.aws_temp_bucket) {
    try {
      // Check if bucket still exists
      await s3Client.send(new HeadBucketCommand({
        Bucket: existingJob.aws_temp_bucket
      }));
      console.log(`♻️ [${requestId}] Reusing existing session: job=${existingJob.id}, bucket=${existingJob.aws_temp_bucket}, status=${existingJob.status}`);
      return {
        bucketName: existingJob.aws_temp_bucket,
        jobId: existingJob.id,
        isNewSession: false
      };
    } catch (error) {
      console.log(`⚠️ [${requestId}] Existing bucket ${existingJob.aws_temp_bucket} not accessible, creating new session: ${error}`);
      
      // Clean up the stale job record
      await supabase
        .from('nsfw_bulk_jobs')
        .update({ status: 'failed', error_message: 'Bucket no longer accessible' })
        .eq('id', existingJob.id);
    }
  }
  
  // Create new bucket and job ID
  const bucketName = generateTempBucketName(userId);
  const jobId = generateJobId();
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  
  console.log(`📦 [${requestId}] Creating new session: job=${jobId}, bucket=${bucketName}, region=${region}`);
  
  try {
    // Create bucket
    const createBucketParams = {
      Bucket: bucketName,
      ...(region !== 'us-east-1' && {
        CreateBucketConfiguration: {
          LocationConstraint: region
        }
      })
    };
    
    await s3Client.send(new CreateBucketCommand(createBucketParams));
    console.log(`✅ [${requestId}] Created bucket: ${bucketName}`);
    
    // CRITICAL: Add bucket policy for Rekognition access
    try {
      const bucketPolicy = createBucketPolicyForRekognition(bucketName);
      console.log(`🔐 [${requestId}] Applying bucket policy:`, bucketPolicy);
      
      await s3Client.send(new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: bucketPolicy
      }));
      console.log(`✅ [${requestId}] Applied Rekognition access policy to bucket: ${bucketName}`);
      
      // VERIFY the policy was applied
      try {
        const verifyPolicy = await s3Client.send(new GetBucketPolicyCommand({
          Bucket: bucketName
        }));
        console.log(`🔍 [${requestId}] Verified bucket policy applied:`, verifyPolicy.Policy);
      } catch (verifyError) {
        console.error(`❌ [${requestId}] Failed to verify bucket policy:`, verifyError);
      }
      
    } catch (policyError) {
      console.error(`❌ [${requestId}] Failed to apply bucket policy:`, policyError);
      console.error(`❌ [${requestId}] Policy error details:`, JSON.stringify(policyError, null, 2));
      // Don't fail bucket creation, but log the issue
      console.warn(`⚠️ [${requestId}] Bucket created but Rekognition may not have access`);
    }
    
    console.log(`✅ [${requestId}] Created new session: job=${jobId}, bucket=${bucketName} in region ${region}`);
    return {
      bucketName,
      jobId,
      isNewSession: true
    };
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to create temp bucket in region ${region}:`, error);
    throw error;
  }
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

// Add at the top after imports
const PROCESSING_TIMEOUT = 240000; // 4 minutes instead of default 2 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

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
  
  // Collect all image files
  const imageFiles: Array<{ key: string; file: File }> = [];
  
  // Reduced scan range for faster processing
  for (let i = 0; i < 25; i++) { // Reduced from 50 to 25
    const key = `image_${i}`;
    try {
      const file = formData.get(key);
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        console.log(`✅ Found ${key}: ${file.name || 'unknown'} (${file.size || 0} bytes, type: ${file.type || 'unknown'})`);
        imageFiles.push({ key, file: file as File });
      } else if (i > 3 && imageFiles.length === 0) { // Early exit
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
  
  // CRITICAL FIX: Process in smaller parallel chunks to avoid timeout
  const CHUNK_SIZE = 3; // Process 3 images at a time
  const chunks: Array<{ key: string; file: File }[]> = [];
  for (let i = 0; i < imageFiles.length; i += CHUNK_SIZE) {
    chunks.push(imageFiles.slice(i, i + CHUNK_SIZE));
  }
  
  console.log(`🔄 Processing ${chunks.length} chunks of ${CHUNK_SIZE} images each`);
  
  // Process chunks sequentially to avoid overwhelming S3
  for (const chunk of chunks) {
    const uploadPromises = chunk.map(async ({ key, file }, index) => {
      try {
        console.log(`📤 Processing ${key}: ${file.name || 'unknown'} (${file.size || 0} bytes)`);
        
        // Validate file size (max 10MB per image - reduced)
        if (file.size > 10 * 1024 * 1024) {
          console.error(`❌ File ${key} too large: ${file.size} bytes`);
          return { success: false, key };
        }
        
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const s3Key = `input/batch-${batchIndex}-image-${(chunks.indexOf(chunk) * CHUNK_SIZE + index).toString().padStart(4, '0')}.jpg`;
        
        console.log(`☁️ Uploading ${key} to S3: ${s3Key}`);
        
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
    
    // Wait for chunk to complete before next
    const results = await Promise.all(uploadPromises);
    successCount += results.filter(r => r.success).length;
    failedCount += results.filter(r => !r.success).length;
    
    // Small delay between chunks
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`✅ Batch ${batchIndex} upload complete: ${successCount} success, ${failedCount} failed`);
  return { successCount, failedCount };
}

// Add this before the main serve function
function isHealthCheck(req: Request): boolean {
  const url = new URL(req.url);
  return url.pathname.includes('/health') || url.searchParams.has('health');
}

// Main handler with timeout
async function handleRequest(req: Request): Promise<Response> {
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
  let sessionJobId: string | undefined = undefined;
  let isNewSession: boolean = false;
  
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

    // FIXED: Get or create temp bucket with proper destructuring
    try {
      ({ bucketName, jobId: sessionJobId, isNewSession } = await getOrCreateTempBucket(s3Client, userId, requestId));
      console.log(`🔗 [${requestId}] Session established: job=${sessionJobId}, bucket=${bucketName}, isNew=${isNewSession}`);
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to get/create temp bucket:`, error);
      return createErrorResponse(
        'Failed to create S3 bucket',
        error instanceof Error ? error.message : 'Unknown S3 error',
        'S3_ERROR',
        requestId,
        500,
        bucketName
      );
    }

    // FIXED: Upload binary files to S3 - moved after bucket creation
    console.log(`⚡ [${requestId}] Starting binary upload to S3 for session ${sessionJobId}`);
    let uploadResult: { successCount: number; failedCount: number };

    try {
      uploadResult = await uploadBinaryFilesToS3(s3Client, bucketName, formData, batchIndex);
    } catch (error) {
      console.error(`❌ [${requestId}] Binary upload failed:`, error);
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

    console.log(`✅ [${requestId}] Binary upload complete: ${uploadResult.successCount}/${imageCount} images uploaded to session ${sessionJobId}`);

    // VIRTUAL IMAGE INTEGRATION: Create virtual images after successful S3 upload
    console.log(`📍 [INTEGRATION-POINT] [${requestId}] Creating virtual images for uploaded files`);
    
    try {
      // Prepare image data for virtual image creation
      const imageFiles: Array<{ imagePath: string; originalFileName?: string; fileSize?: number; contentType?: string }> = [];
      
      // Collect image file information from FormData
      for (let i = 0; i < imageCount; i++) {
        const key = `image_${i}`;
        const file = formData.get(key);
        if (file && typeof file === 'object' && 'arrayBuffer' in file) {
          const fileObj = file as File;
          const s3Key = `input/batch-${batchIndex}-image-${i.toString().padStart(4, '0')}.jpg`;
          
          imageFiles.push({
            imagePath: `s3://${bucketName}/${s3Key}`,
            originalFileName: fileObj.name || 'unknown.jpg',
            fileSize: fileObj.size || 0,
            contentType: fileObj.type || 'image/jpeg'
          });
        }
      }
      
      if (imageFiles.length > 0) {
        console.log(`🔗 [${requestId}] Calling virtual-image-bridge to create ${imageFiles.length} virtual images`);
        
        const bridgeResponse = await supabase.functions.invoke('virtual-image-bridge/create', {
          body: {
            jobId: sessionJobId,
            bucketName,
            userId,
            images: imageFiles
          }
        });
        
        if (bridgeResponse.error) {
          console.error(`❌ [${requestId}] Virtual image creation failed:`, bridgeResponse.error);
          // Don't fail the upload, but log the issue
        } else {
          console.log(`✅ [${requestId}] Created ${bridgeResponse.data?.processedCount || 0} virtual images`);
        }
      }
    } catch (virtualImageError) {
      console.error(`❌ [${requestId}] Virtual image creation error:`, virtualImageError);
      // Don't fail the upload, but log the issue
    }

    // FIXED: Database record management - always use sessionJobId
    console.log(`💾 [${requestId}] Managing database record for session: ${sessionJobId}`);

    if (isNewSession) {
      // Create new job record
      console.log(`🆕 [${requestId}] Creating new job record: ${sessionJobId}`);
      
      const { error } = await supabase
        .from('nsfw_bulk_jobs')
        .insert({
          id: sessionJobId,
          user_id: userId,
          status: 'uploading',
          total_images: totalImages,
          processed_images: uploadResult.successCount,
          nsfw_detected: 0,
          aws_temp_bucket: bucketName,
          bucket_path: `s3://${bucketName}/input/`,
          created_at: new Date().toISOString(),
        });
      
      if (error) {
        console.error(`❌ [${requestId}] Database insert error:`, error);
        return createErrorResponse(
          'Database error',
          error.message,
          'DATABASE_ERROR',
          requestId,
          500,
          bucketName
        );
      }
    } else {
      // Update existing job record
      console.log(`🔄 [${requestId}] Updating existing job: ${sessionJobId}`);
      
      // Get current job state first
      const { data: currentJob } = await supabase
        .from('nsfw_bulk_jobs')
        .select('total_images, processed_images')
        .eq('id', sessionJobId)
        .single();
      
      const { error } = await supabase
        .from('nsfw_bulk_jobs')
        .update({
          total_images: Math.max(currentJob?.total_images || 0, totalImages),
          processed_images: (currentJob?.processed_images || 0) + uploadResult.successCount,
          status: 'uploading', // Keep in uploading status
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionJobId);
      
      if (error) {
        console.error(`❌ [${requestId}] Database update error:`, error);
        return createErrorResponse(
          'Database error',
          error.message,
          'DATABASE_ERROR',
          requestId,
          500,
          bucketName
        );
      }
    }

    // Check if this might be the final batch (you'll need to track this based on your batching logic)
    const shouldFinalize = formData.get('isLastBatch') === 'true'; // Add this flag from client

    if (shouldFinalize) {
      try {
        await finalizeUploadSession(s3Client, bucketName, sessionJobId, requestId);
        console.log(`🏁 [${requestId}] Session finalized and ready for processing`);
      } catch (finalizeError) {
        console.error(`❌ [${requestId}] Failed to finalize session:`, finalizeError);
        // Don't fail the upload, but log the issue
      }
    }

    // SUCCESS - return response with consistent sessionJobId
    return new Response(JSON.stringify({
      jobId: sessionJobId, // Always return the session job ID
      bucketName,
      uploadedCount: uploadResult.successCount,
      failedCount: uploadResult.failedCount,
      status: 'uploading',
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
}

// Serve with timeout protection
serve(async (req: Request): Promise<Response> => {
  const requestId = generateRequestId();
  
  // VIRTUAL IMAGE INTEGRATION: Log bulk processing flow
  console.log(`🔍 [FLOW-TRACE] [${requestId}] bulk-nsfw-upload: Starting request processing`);
  console.log(`🔍 [FLOW-TRACE] [${requestId}] Method: ${req.method}, URL: ${req.url}`);
  
  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, PROCESSING_TIMEOUT);
    });

    // Race between actual request and timeout
    console.log(`🔍 [FLOW-TRACE] [${requestId}] About to call handleRequest`);
    const response: Response = await Promise.race([
      handleRequest(req),
      timeoutPromise
    ]);

    // Simple success logging without touching response
    console.log(`🔍 [FLOW-TRACE] [${requestId}] bulk-nsfw-upload: Request completed successfully`);
    console.log(`📍 [INTEGRATION-POINT] [${requestId}] S3 upload complete - virtual image creation should happen here`); 

    return response;
  } catch (error) {
    console.error(`❌ [FLOW-TRACE] [${requestId}] Request timeout or error:`, error);
    
    return new Response(JSON.stringify({
      error: 'Request timeout',
      details: error instanceof Error ? error.message : 'Unknown timeout error',
      type: 'TIMEOUT_ERROR',
      request_id: requestId
    }), {
      status: 504,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});