import { MLKitAnalysisResult } from '../mlkit/types/MLKitTypes';
import { FileSystemService } from '../filesystem/FileSystemService';
import { CompressionCacheService } from '../cache/CompressionCacheService';
import { HardwareProfiler, HardwareProfile } from '../hardwareProfiler';
import { supabase } from '../supabase';

export interface UploadBatch {
  images: string[];
  batchId: string;
  batchIndex: number;
  totalBatches: number;
  processingId: string;
  mlkitResults?: Record<string, MLKitAnalysisResult>;
}

export interface UploadResult {
  success: boolean;
  batchId: string;
  uploadedCount: number;
  failedUris: string[];
  errors: string[];
  processingTime: number;
  uploadSize: number;
  jobId?: string;  // Server-assigned job ID for status tracking
  bucketName?: string;  // S3 bucket name from server response
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

export class BatchUploadService {
  private cache: CompressionCacheService;
  private retryConfig: RetryConfig;
  
  // FIXED: Add session tracking like old system
  private sessionJobId: string | null = null;
  private sessionBucketName: string | null = null;

  constructor(
    cache: CompressionCacheService,
    retryConfig: RetryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      timeoutMs: 120000
    }
  ) {
    this.cache = cache;
    this.retryConfig = retryConfig;
  }

  /**
   * Upload a batch with comprehensive retry logic and validation
   */
  async uploadBatchWithRetry(batch: UploadBatch, userId: string): Promise<UploadResult> {
    const startTime = Date.now();
    console.log(`🔄 Starting batch upload: ${batch.batchId} (${batch.batchIndex + 1}/${batch.totalBatches})`);
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Pre-upload validation with detailed logging
        const validationResult = await this.validateBatchForUpload(batch);
        if (!validationResult.isValid) {
          throw new Error(`Batch validation failed: ${validationResult.errors.join(', ')}`);
        }

        const result = await this.executeBatchUpload(batch, userId, attempt);
        const processingTime = Date.now() - startTime;
        
        console.log(`✅ Batch ${batch.batchId} uploaded successfully in ${processingTime}ms (attempt ${attempt + 1})`);
        return {
          ...result,
          processingTime
        };
        
      } catch (error) {
        lastError = error as Error;
        const processingTime = Date.now() - startTime;
        
        console.error(`❌ Batch upload attempt ${attempt + 1} failed for ${batch.batchId}:`, {
          error: lastError.message,
          processingTime,
          remainingAttempts: this.retryConfig.maxRetries - attempt
        });

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
          console.log(`⏳ Retrying batch ${batch.batchId} in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    // All retries exhausted
    const processingTime = Date.now() - startTime;
    console.error(`💥 Batch ${batch.batchId} failed after ${this.retryConfig.maxRetries + 1} attempts`, {
      finalError: lastError?.message,
      totalProcessingTime: processingTime
    });

    return {
      success: false,
      batchId: batch.batchId,
      uploadedCount: 0,
      failedUris: batch.images,
      errors: [lastError?.message || 'Unknown upload error'],
      processingTime,
      uploadSize: 0
    };
  }

  /**
   * Validate batch before upload with comprehensive checks
   */
  private async validateBatchForUpload(batch: UploadBatch): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    totalSize: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validation logging removed to reduce terminal spam
    // console.log(`🔍 Validating batch ${batch.batchId} with ${batch.images.length} images...`);

    // Check if batch is empty
    if (!batch.images || batch.images.length === 0) {
      errors.push('Batch contains no images');
      return { isValid: false, errors, warnings, totalSize: 0 };
    }

    // Validate each image file with detailed logging
    const fileValidations = await Promise.all(
      batch.images.map(async (uri, index) => {
        try {
          // Check if we have a compressed version of this original URI
          // Get compressed URI from cache
          const compressedUri = this.cache.get(uri);
          let isCompressed = compressedUri && compressedUri !== uri;
          let actualUri: string = isCompressed ? compressedUri! : uri;
          
          let fileSize = await FileSystemService.getFileSize(actualUri);
          
          // FIXED: Handle race condition where compressed file might be temporarily 0 bytes
          // This can happen if compression is still writing the file when we check
          if (fileSize === 0 && isCompressed) {
            // ✅ Enhanced logging: Track when and why files become 0 bytes
            const cacheStats = this.cache.getStats();
            const timeSinceCompressionComplete = Date.now(); // We don't have exact timestamp, but log current time
            
            console.warn(`⚠️ Compressed file is 0 bytes, retrying in 100ms: ${actualUri}`);
            console.warn(`🔍 Cache corruption context: Cache size=${cacheStats.size}, Processing locked=${this.cache.isProcessingLocked() ? 'YES' : 'NO'}`);
            
            // Wait and retry up to 3 times for compressed files
            let retryCount = 0;
            while (fileSize === 0 && retryCount < 3) {
              await this.delay(100); // Wait 100ms
              fileSize = await FileSystemService.getFileSize(actualUri);
              retryCount++;
              
              if (fileSize === 0) {
                console.warn(`⚠️ Retry ${retryCount}/3: Compressed file still 0 bytes: ${actualUri}`);
                // Check if file still exists or was deleted
                const validation = await FileSystemService.validateFile(actualUri);
                console.warn(`🔍 File validation: ${actualUri} exists=${validation.exists}, size=${validation.size}, error=${validation.error || 'none'}`);
              }
            }
            
            // If still 0 bytes after retries, fall back to original file
            if (fileSize === 0) {
              console.warn(`⚠️ Compressed file permanently corrupted, using original: ${uri}`);
              const originalFileSize = await FileSystemService.getFileSize(uri);
              if (originalFileSize > 0) {
                // Use original file instead
                fileSize = originalFileSize;
                actualUri = uri;
                isCompressed = false;
              } else {
                throw new Error(`Both compressed and original files are 0 bytes: ${uri}`);
              }
            }
          } else if (fileSize === 0) {
            throw new Error(`File has 0 bytes: ${actualUri}`);
          }

          // Per-file validation logging removed to reduce terminal spam
          // console.log(`✅ File validated: ${FileSystemService.formatFileSize(fileSize)}`, {
          //   uri: actualUri,
          //   isCompressed
          // });

          return { uri, size: fileSize, isValid: true };
          
        } catch (error) {
          const errorMsg = `File validation failed for ${uri}: ${(error as Error).message}`;
          console.error(`❌ ${errorMsg}`, {
            error: error as Error,
            cacheHasOriginal: this.cache.has(uri),
            cacheHasCompressed: this.cache.has(uri) && this.cache.get(uri) !== uri
          });
          return { uri, error: errorMsg, size: 0, isValid: false };
        }
      })
    );

    // Collect validation results
    const validFiles = fileValidations.filter(v => v.isValid);
    const invalidFiles = fileValidations.filter(v => !v.isValid);
    const totalSize = validFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    // Log validation summary
    console.log(`📊 Batch validation summary for ${batch.batchId}:`, {
      totalFiles: batch.images.length,
      validFiles: validFiles.length,
      invalidFiles: invalidFiles.length,
      totalSize: FileSystemService.formatFileSize(totalSize),
      compressionCacheEntries: this.cache.getStats().size
    });

    // Add errors for invalid files
    invalidFiles.forEach(file => {
      if (file.error) {
        errors.push(file.error);
      }
    });

    // Check total size limits
    const maxBatchSize = 50 * 1024 * 1024; // 50MB
    if (totalSize > maxBatchSize) {
      warnings.push(`Batch size ${FileSystemService.formatFileSize(totalSize)} exceeds recommended ${FileSystemService.formatFileSize(maxBatchSize)}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      totalSize
    };
  }

  /**
   * Execute the actual batch upload
   */
  private async executeBatchUpload(batch: UploadBatch, userId: string, attempt: number): Promise<UploadResult> {
    const startTime = Date.now();
    
    // Prepare form data with the exact format expected by the Edge Function
    // FIXED: Match old system exactly - only send essential fields
    const formData = new FormData();
    
    formData.append('userId', userId);
    formData.append('batchIndex', batch.batchIndex.toString());
    formData.append('totalImages', batch.images.length.toString());
    formData.append('isLastBatch', (batch.batchIndex === batch.totalBatches - 1).toString());

    // Add ML Kit results if available
    if (batch.mlkitResults) {
      formData.append('mlkitResults', JSON.stringify(batch.mlkitResults));
    }
    
    // Add mapped ML Kit data for virtual-image-bridge integration
    if ((batch as any).mappedMLKitData) {
      formData.append('mappedMLKitData', JSON.stringify((batch as any).mappedMLKitData));
    }

    let uploadSize = 0;
    const fileDetails: Array<{
      uri: string;
      size: number;
      isCompressed: boolean;
      actualUri: string;
    }> = [];

    // Add files to form data with comprehensive logging
    for (let i = 0; i < batch.images.length; i++) {
      const uri = batch.images[i];
      const compressedUri = this.cache.get(uri);
      let isCompressed = compressedUri && compressedUri !== uri;
      let actualUri: string = isCompressed ? compressedUri! : uri;
      
      try {
        let fileSize = await FileSystemService.getFileSize(actualUri);
        
        // FIXED: Handle race condition where compressed file might be temporarily 0 bytes
        if (fileSize === 0 && isCompressed) {
          console.warn(`⚠️ Compressed file is 0 bytes during upload, retrying: ${actualUri}`);
          
          // Wait and retry up to 3 times for compressed files
          let retryCount = 0;
          while (fileSize === 0 && retryCount < 3) {
            await this.delay(100); // Wait 100ms
            fileSize = await FileSystemService.getFileSize(actualUri);
            retryCount++;
            
            if (fileSize === 0) {
              console.warn(`⚠️ Upload retry ${retryCount}/3: Compressed file still 0 bytes: ${actualUri}`);
            }
          }
          
          // If still 0 bytes after retries, fall back to original file
          if (fileSize === 0) {
            console.warn(`⚠️ Compressed file corrupted during upload, using original: ${uri}`);
            const originalFileSize = await FileSystemService.getFileSize(uri);
            if (originalFileSize > 0) {
              fileSize = originalFileSize;
              actualUri = uri;
              isCompressed = false;
            } else {
              throw new Error(`Both compressed and original files are 0 bytes during upload: ${uri}`);
            }
          }
        } else if (fileSize === 0) {
          throw new Error(`File disappeared or became 0 bytes: ${actualUri}`);
        }
        
        // Per-file FormData logging removed to reduce terminal spam
        // console.log(`📎 Adding file ${i + 1}/${batch.images.length} to form data:`, {
        //   originalUri: uri,
        //   actualUri,
        //   isCompressed,
        //   size: FileSystemService.formatFileSize(fileSize),
        //   attempt
        // });

        // Create file object for upload with the exact format expected by Edge Function
        const fileObj = {
          uri: actualUri,
          type: 'image/jpeg',
          name: `image_${i}.jpg`
        } as any;

        // FIXED: Use individual field names that Edge Function expects (image_0, image_1, etc.)
        formData.append(`image_${i}`, fileObj);
        
        // FIXED: Also add original path mapping as expected by Edge Function
        formData.append(`original_path_${i}`, uri);
        uploadSize += fileSize;
        
        fileDetails.push({
          uri,
          size: fileSize,
          isCompressed: !!isCompressed,
          actualUri
        });

      } catch (error) {
        console.error(`❌ Failed to add file ${uri} to upload:`, {
          error: (error as Error).message,
          actualUri,
          isCompressed,
          attempt
        });
        throw error;
      }
    }

    console.log(`📤 Executing upload for batch ${batch.batchId}:`, {
      fileCount: batch.images.length,
      totalSize: FileSystemService.formatFileSize(uploadSize),
      attempt: attempt + 1,
      compressionCacheSize: this.cache.getStats().size
    });

    // Get authentication session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(`Session error: ${sessionError.message}`);
    }
    if (!session) {
      throw new Error('No authentication session');
    }

    // Get function URL (same method as old processor)
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                       process.env.REACT_NATIVE_SUPABASE_URL ||
                       'https://your-project.supabase.co';
    const functionUrl = `${supabaseUrl}/functions/v1/bulk-nsfw-upload`;

    // Use fetch() with FormData like the old processor
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 180000); // 3 minute timeout

    let data: any;
    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-processing-id': batch.processingId,
          'x-batch-id': batch.batchId,
          'x-attempt': attempt.toString()
        },
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (e) {
          console.error('❌ Could not read error response:', e);
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseText = await response.text();
      data = JSON.parse(responseText);

      if (!data) {
        throw new Error('No response data from upload');
      }

    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ Supabase function error for batch ${batch.batchId}:`, {
        error: error instanceof Error ? error.message : String(error),
        attempt,
        fileDetails: fileDetails.map(f => ({
          uri: f.uri,
          size: FileSystemService.formatFileSize(f.size),
          isCompressed: f.isCompressed
        }))
      });
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Upload completed for batch ${batch.batchId}:`, {
      uploadedCount: batch.images.length,
      uploadSize: FileSystemService.formatFileSize(uploadSize),
      processingTime: `${processingTime}ms`,
      response: data
    });

    // FIXED: Add session consistency checking like old system
    if (this.sessionJobId === null) {
      // First batch - establish session
      this.sessionJobId = data?.jobId || null;
      this.sessionBucketName = data?.bucketName || null;
      console.log(`✅ Session established: job=${this.sessionJobId}, bucket=${this.sessionBucketName}`);
    } else {
      // Subsequent batches - validate session consistency
      if (data?.jobId !== this.sessionJobId) {
        console.error(`❌ CRITICAL: Job ID changed mid-session! Expected ${this.sessionJobId}, got ${data?.jobId}`);
        throw new Error(`Session consistency error: Job ID changed from ${this.sessionJobId} to ${data?.jobId}`);
      }
      if (data?.bucketName !== this.sessionBucketName) {
        console.error(`❌ CRITICAL: Bucket name changed mid-session! Expected ${this.sessionBucketName}, got ${data?.bucketName}`);
        throw new Error(`Session consistency error: Bucket changed from ${this.sessionBucketName} to ${data?.bucketName}`);
      }
      console.log(`✅ Session validated: job=${this.sessionJobId}, bucket=${this.sessionBucketName}`);
    }

    return {
      success: true,
      batchId: batch.batchId,
      uploadedCount: batch.images.length,
      failedUris: [],
      errors: [],
      processingTime,
      uploadSize,
      jobId: this.sessionJobId || undefined,  // Use session job ID like old system
      bucketName: this.sessionBucketName || undefined  // Use session bucket name like old system
    };
  }

  /**
   * Reset session for new processing job (matches old system behavior)
   */
  resetSession(): void {
    this.sessionJobId = null;
    this.sessionBucketName = null;
    console.log(`🔄 Upload session reset`);
  }

  /**
   * Monitor upload progress for a processing session
   */
  async monitorUploadProgress(processingId: string, jobId?: string): Promise<{
    status: string;
    progress: number;
    completedBatches: number;
    totalBatches: number;
    processedImages: number;
    results?: any;
  }> {
    try {
      // Use jobId if provided, otherwise fall back to processingId
      const requestParams = jobId 
        ? { jobId }
        : { processingId };

      const { data, error } = await supabase.functions.invoke('bulk-nsfw-status', {
        body: requestParams
      });

      if (error) {
        console.error(`❌ Failed to get upload status for ${processingId}:`, error);
        throw new Error(`Status check failed: ${error.message}`);
      }

      return data;
      
    } catch (error) {
      console.error(`❌ Upload monitoring error for ${processingId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate optimal batch size based on hardware capabilities
   */
  async calculateOptimalBatchSize(totalImages: number, averageFileSize: number): Promise<number> {
    const deviceProfile = await HardwareProfiler.getHardwareProfile();
    const memoryMB = deviceProfile.totalMemoryMB;
    
    // Conservative batch sizing based on available memory
    let batchSize: number;
    
    if (memoryMB > 6000) { // High-end device
      batchSize = Math.min(20, Math.max(5, Math.floor(totalImages / 10)));
    } else if (memoryMB > 3000) { // Mid-range device  
      batchSize = Math.min(15, Math.max(3, Math.floor(totalImages / 15)));
    } else { // Low-end device
      batchSize = Math.min(10, Math.max(2, Math.floor(totalImages / 20)));
    }

    // Adjust based on file sizes
    const avgSizeMB = averageFileSize / (1024 * 1024);
    if (avgSizeMB > 5) { // Large files
      batchSize = Math.max(1, Math.floor(batchSize / 2));
    }

    console.log(`📊 Calculated optimal batch size: ${batchSize}`, {
      totalImages,
      averageFileSize: FileSystemService.formatFileSize(averageFileSize),
      deviceMemory: `${deviceProfile.totalMemoryMB}MB`,
      deviceTier: deviceProfile.deviceTier
    });

    return batchSize;
  }

  /**
   * Split images into optimally sized batches
   */
  async createBatches(images: string[], processingId: string, batchSize?: number): Promise<UploadBatch[]> {
    if (!batchSize) {
      // Calculate average file size for optimal batching
      batchSize = await this.calculateOptimalBatchSize(images.length, 2 * 1024 * 1024); // Assume 2MB average
    }

    const batches: UploadBatch[] = [];
    const totalBatches = Math.ceil(images.length / batchSize);

    for (let i = 0; i < images.length; i += batchSize) {
      const batchImages = images.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      
      batches.push({
        images: batchImages,
        batchId: `${processingId}_batch_${batchIndex}`,
        batchIndex,
        totalBatches,
        processingId
      });
    }

    console.log(`📦 Created ${batches.length} batches:`, {
      totalImages: images.length,
      batchSize,
      batches: batches.map(b => ({
        id: b.batchId,
        size: b.images.length
      }))
    });

    return batches;
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get upload statistics
   */
  async getUploadStats(): Promise<{
    retryConfig: RetryConfig;
    cacheSize: number;
    hardwareProfile: HardwareProfile;
  }> {
    return {
      retryConfig: this.retryConfig,
      cacheSize: this.cache.getStats().size,
      hardwareProfile: await HardwareProfiler.getHardwareProfile()
    };
  }
}
