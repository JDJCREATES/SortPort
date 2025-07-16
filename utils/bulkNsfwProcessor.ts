import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';

export interface BulkProcessingProgress {
  current: number;
  total: number;
  status: string;
  message: string;
}

export interface BulkProcessingResult {
  jobId: string;
  totalImages: number;
  nsfwDetected: number;
  results: any[];
  processingTimeMs: number;
}

// Response interfaces
interface BulkUploadResponse {
  jobId: string;
  bucketName: string;
  uploadedCount: number;
  failedCount: number;
  status: string;
  request_id: string;
}

interface BulkSubmitResponse {
  jobId: string;
  awsJobId: string;
  awsBucketName: string;
  status: string;
  request_id: string;
}

export class BulkNSFWProcessor {
  private static readonly POLL_INTERVAL_MS = 3000;
  private static readonly MAX_POLL_TIME_MS = 10 * 60 * 1000;
  private static readonly BATCH_SIZE = 8; // Reduced from 15 to 8
  private static readonly UPLOAD_TIMEOUT_MS = 120000; // 2 minutes should be enough for 8 images
  private static readonly MAX_RETRIES = 2;
  private static readonly DELAY_BETWEEN_BATCHES = 1000;

  /**
   * Get Supabase function URL
   */
  private static getSupabaseFunctionUrl(functionName: string): string {
    // Get the Supabase URL from environment or config
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                       process.env.REACT_NATIVE_SUPABASE_URL ||
                       'https://your-project.supabase.co'; // Replace with your actual URL
    
    return `${supabaseUrl}/functions/v1/${functionName}`;
  }

  /**
   * Upload a single batch with retry logic and timeout
   */
  private static async uploadBatchWithRetry(
    batchUris: string[],
    userId: string,
    batchIndex: number,
    retryCount = 0
  ): Promise<{ jobId: string; bucketName: string; uploadedCount: number }> {
    const maxRetries = this.MAX_RETRIES;
    
    try {
      console.log(`📤 Uploading batch ${batchIndex + 1} (${batchUris.length} images) - Attempt ${retryCount + 1}`);
      
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('batchIndex', batchIndex.toString());
      formData.append('totalImages', batchUris.length.toString());

      let successfulImages = 0;
      for (let i = 0; i < batchUris.length; i++) {
        const uri = batchUris[i];
        try {
          console.log(`📷 Processing image ${i + 1}/${batchUris.length} in batch ${batchIndex + 1}`);
          
          // Use React Native's proper file upload format
          const fileObject = {
            uri: uri,
            type: 'image/jpeg',
            name: `image_${i}.jpg`,
          };
          
          // This is the correct way for React Native FormData
          (formData as any).append(`image_${i}`, fileObject);
          successfulImages++;
          
          console.log(`✅ Image ${i + 1} added to FormData with URI: ${uri}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to process image ${i} in batch ${batchIndex + 1}:`, errorMessage);
          continue;
        }
      }

      if (successfulImages === 0) {
        throw new Error(`No images could be processed in batch ${batchIndex + 1}`);
      }

      console.log(`📦 FormData prepared with ${successfulImages}/${batchUris.length} images for batch ${batchIndex + 1}`);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      if (!session) {
        throw new Error('No authentication session');
      }

      const functionUrl = this.getSupabaseFunctionUrl('bulk-nsfw-upload');
      console.log(`🔗 Uploading to: ${functionUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Upload timeout after ${this.UPLOAD_TIMEOUT_MS}ms for batch ${batchIndex + 1}`);
        controller.abort();
      }, this.UPLOAD_TIMEOUT_MS);

      try {
        console.log(`🚀 Starting upload for batch ${batchIndex + 1}...`);
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            // Let React Native set the Content-Type with boundary
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log(`📡 Upload response for batch ${batchIndex + 1}: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          let errorText = 'Unknown error';
          try {
            errorText = await response.text();
          } catch (e) {
            const parseError = e instanceof Error ? e.message : String(e);
            console.error('❌ Could not read error response:', parseError);
          }
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        let result;
        try {
          const responseText = await response.text();
          console.log(`📄 Raw response for batch ${batchIndex + 1}:`, responseText.substring(0, 200) + '...');
          result = JSON.parse(responseText);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          console.error('❌ Failed to parse response JSON:', errorMessage);
          throw new Error(`Invalid JSON response: ${errorMessage}`);
        }

        console.log(`✅ Batch ${batchIndex + 1} uploaded successfully:`, result);
        
        if (!result.jobId || !result.bucketName || typeof result.uploadedCount !== 'number') {
          throw new Error(`Invalid response structure: ${JSON.stringify(result)}`);
        }
        
        return {
          jobId: result.jobId,
          bucketName: result.bucketName,
          uploadedCount: result.uploadedCount
        };

      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error(`Upload timeout after ${this.UPLOAD_TIMEOUT_MS}ms`);
          }
          
          if (error.message === 'Network request failed') {
            throw new Error(`Network request failed - check internet connection and server status`);
          }
          
          throw error;
        }
        
        throw new Error(`Unknown error: ${String(error)}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Batch ${batchIndex + 1} upload failed (attempt ${retryCount + 1}):`, errorMessage);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Retrying batch ${batchIndex + 1} in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.uploadBatchWithRetry(batchUris, userId, batchIndex, retryCount + 1);
      } else {
        throw new Error(`Batch ${batchIndex + 1} failed after ${maxRetries + 1} attempts: ${errorMessage}`);
      }
    }
  }

  /**
   * Process images in sequential batches to avoid overwhelming the server
   */
  static async processBulkImages(
    imageUris: string[], 
    userId: string,
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<BulkProcessingResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Starting SEQUENTIAL batch processing for ${imageUris.length} images`);
      
      if (onProgress) {
        onProgress({
          current: 0,
          total: 100,
          status: 'preparing',
          message: `Preparing to process ${imageUris.length} images in batches of ${this.BATCH_SIZE}...`
        });
      }

      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Split into batches
      const batches: string[][] = [];
      for (let i = 0; i < imageUris.length; i += this.BATCH_SIZE) {
        batches.push(imageUris.slice(i, i + this.BATCH_SIZE));
      }

      console.log(`📦 Created ${batches.length} batches of max ${this.BATCH_SIZE} images each`);

      const allJobIds: string[] = [];
      const allBucketNames: string[] = [];
      let totalUploaded = 0;

      // Process batches SEQUENTIALLY to avoid overwhelming the server
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          // Add delay between batches to prevent overwhelming
          if (i > 0) {
            console.log(`⏳ Waiting ${this.DELAY_BETWEEN_BATCHES}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, this.DELAY_BETWEEN_BATCHES));
          }

          const result = await this.uploadBatchWithRetry(batch, userId, i);
          
          allJobIds.push(result.jobId);
          allBucketNames.push(result.bucketName);
          totalUploaded += result.uploadedCount;

          // Update progress
          const progressPercent = Math.round(((i + 1) / batches.length) * 70); // 0-70% for upload
          if (onProgress) {
            onProgress({
              current: progressPercent,
              total: 100,
              status: 'uploading',
              message: `Uploaded batch ${i + 1}/${batches.length} (${totalUploaded} images total)`
            });
          }

        } catch (error) {
          console.error(`❌ Batch ${i + 1} failed completely:`, error);
          // Continue with other batches instead of failing completely
          continue;
        }
      }

      if (allJobIds.length === 0) {
        throw new Error('All batches failed to upload');
      }

      console.log(`✅ Upload phase complete: ${allJobIds.length} successful batches, ${totalUploaded} images uploaded`);

      if (onProgress) {
        onProgress({
          current: 75,
          total: 100,
          status: 'submitting',
          message: `Submitting ${allJobIds.length} batches for AWS analysis...`
        });
      }

      // Now submit all uploaded batches for processing
      const submitPromises = allJobIds.map(async (jobId, index) => {
        try {
          const { data, error } = await supabase.functions.invoke('bulk-nsfw-submit', {
            body: {
              jobId,
              bucketName: allBucketNames[index],
              userId
            }
          });

          if (error) {
            throw new Error(`Submit failed: ${error.message}`);
          }

          return data;
        } catch (error) {
          console.error(`❌ Failed to submit job ${jobId}:`, error);
          return null;
        }
      });

      const submitResults = await Promise.allSettled(submitPromises);
      const successfulSubmits = submitResults
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => (result as PromiseFulfilledResult<any>).value);

      if (successfulSubmits.length === 0) {
        throw new Error('All batch submissions failed');
      }

      console.log(`✅ Submitted ${successfulSubmits.length} batches for processing`);

      if (onProgress) {
        onProgress({
          current: 80,
          total: 100,
          status: 'processing',
          message: `AWS processing ${successfulSubmits.length} batches...`
        });
      }

      // Monitor all jobs for completion
      const results = await this.monitorAllJobs(
        successfulSubmits.map(submit => submit.jobId),
        onProgress
      );
      
      const processingTime = Date.now() - startTime;
      
      return {
        jobId: `batch_${Date.now()}`, // Combined job ID
        totalImages: totalUploaded,
        nsfwDetected: results.totalNsfwDetected,
        results: results.allResults,
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.error('❌ Bulk processing failed:', error);
      throw error;
    }
  }

  /**
   * Monitor all batch jobs for completion
   */
  private static async monitorAllJobs(
    jobIds: string[], 
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<{ totalNsfwDetected: number; allResults: any[] }> {
    console.log(`🔍 Monitoring ${jobIds.length} batch jobs for completion...`);
    
    const completedJobs: any[] = [];
    let totalNsfwDetected = 0;
    let allResults: any[] = [];

    // Poll all jobs until complete
    while (completedJobs.length < jobIds.length) {
      const pendingJobs = jobIds.filter(jobId => 
        !completedJobs.some(completed => completed.jobId === jobId)
      );

      for (const jobId of pendingJobs) {
        try {
          const status = await this.checkJobStatus(jobId);
          
          if (status.status === 'completed') {
            completedJobs.push(status);
            totalNsfwDetected += status.nsfwDetected || 0;
            allResults = allResults.concat(status.results || []);
            
            console.log(`✅ Job ${jobId} completed. Progress: ${completedJobs.length}/${jobIds.length}`);
          } else if (status.status === 'failed') {
            console.error(`❌ Job ${jobId} failed:`, status.error_message);
            // Mark as completed to avoid infinite loop
            completedJobs.push({ jobId, status: 'failed' });
          }
        } catch (error) {
          console.error(`❌ Error checking job ${jobId}:`, error);
        }
      }

      // Update progress
      const progressPercent = 80 + Math.round((completedJobs.length / jobIds.length) * 20); // 80-100%
      if (onProgress) {
        onProgress({
          current: progressPercent,
          total: 100,
          status: 'completing',
          message: `Completed ${completedJobs.length}/${jobIds.length} batch jobs...`
        });
      }

      // Wait before next poll if not all complete
      if (completedJobs.length < jobIds.length) {
        await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL_MS));
      }
    }

    return { totalNsfwDetected, allResults };
  }

  static async checkJobStatus(jobId: string): Promise<any> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated for status check');
      }

      const { data, error } = await supabase.functions.invoke('bulk-nsfw-status', {
        body: { jobId },
        headers: {
          'X-Request-ID': `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      });

      if (error) {
        throw new Error(`Status check failed: ${error.message || 'Unknown error'}`);
      }

      return data;

    } catch (error) {
      console.error('❌ Failed to check job status:', error);
      throw error instanceof Error ? error : new Error('Unknown error during status check');
    }
  }

  /**
   * Get user-friendly status messages
   */
  private static getStatusMessage(status: string, progress: number): string {
    switch (status) {
      case 'preparing':
        return 'Preparing binary upload...';
      case 'uploading':
        return 'Binary uploading images to AWS S3...';
      case 'uploaded':
        return 'Images uploaded, starting analysis...';
      case 'processing':
        return `AWS analyzing all images... (${progress}%)`;
      case 'completed':
        return 'Binary bulk analysis complete!';
      case 'failed':
        return 'Processing failed';
      default:
        return `Status: ${status}`;
    }
  }

  /**
   * Utility method to get available device storage
   */
  static async getAvailableStorage(): Promise<number> {
    try {
      const info = await FileSystem.getFreeDiskStorageAsync();
      return info;
    } catch (error) {
      console.error('❌ Failed to get storage info:', error);
      return 0;
    }
  }

  /**
   * Estimate memory requirements for batch processing
   */
  static estimateMemoryRequirement(imageCount: number, avgImageSizeMB: number = 5): {
    totalSizeMB: number;
    batchCount: number;
    recommendedBatchSize: number;
  } {
    const totalSizeMB = imageCount * avgImageSizeMB * 1.33; // Base64 overhead
    const batchCount = Math.ceil(imageCount / this.BATCH_SIZE);
    const maxBatchSizeMB = this.BATCH_SIZE * avgImageSizeMB * 1.33;
    
    return {
      totalSizeMB,
      batchCount,
      recommendedBatchSize: this.BATCH_SIZE
    };
  }

  /**
   * Validate if bulk processing is feasible
   */
  static async validateBulkProcessing(imageUris: string[]): Promise<{
    canProcess: boolean;
    reason?: string;
    recommendation?: string;
  }> {
    try {
      // With binary upload, we need minimal local storage
      const availableStorage = await FileSystem.getFreeDiskStorageAsync();
      const availableStorageMB = availableStorage / (1024 * 1024);
      
      // Only need minimal storage for binary upload
      if (availableStorageMB < 50) { // Just 50MB minimum
        return {
          canProcess: false,
          reason: `Insufficient storage. Need 50MB minimum, have ${availableStorageMB.toFixed(0)}MB`,
          recommendation: 'Free up device storage'
        };
      }
      
      // Check reasonable limits
      if (imageUris.length > 2000) {
        return {
          canProcess: false,
          reason: 'Too many images for single batch',
          recommendation: 'Process in smaller batches of 1000-2000 images'
        };
      }
      
      return {
        canProcess: true
      };
      
    } catch (error) {
      return {
        canProcess: false,
        reason: 'Unable to validate system requirements',
        recommendation: 'Try processing a smaller batch first'
      };
    }
  }

  // Deprecated - kept for backwards compatibility
  static async submitBulkJob(imageUris: string[], userId: string): Promise<string> {
    console.warn('⚠️ submitBulkJob is deprecated. Use processBulkImages instead.');
    const result = await this.processBulkImages(imageUris, userId);
    return result.jobId;
  }

  /**
   * Test edge function health
   */
  static async testEdgeFunctionHealth(): Promise<{ success: boolean; error?: string; latency?: number }> {
    try {
      const startTime = Date.now();
      const functionUrl = this.getSupabaseFunctionUrl('bulk-nsfw-upload') + '?health=true';
      
      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const latency = Date.now() - startTime;
      
      if (!response.ok) {
        const errorText = await response.text();
        return { 
          success: false, 
          error: `HTTP ${response.status}: ${errorText}`,
          latency 
        };
      }

      const result = await response.json();
      console.log('🏥 Health check result:', result);
      
      return { success: true, latency };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        success: false, 
        error: errorMessage
      };
    }
  }
}
