import { supabase, supabaseUrl } from './supabase';
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

export class BulkNSFWProcessor {
  private static readonly MAX_BATCH_SIZE = 5000;
  private static readonly POLL_INTERVAL_MS = 3000;
  private static readonly MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes

  static async submitBulkJob(imageUris: string[], userId: string): Promise<string> {
    try {
      console.log(`🚀 Uploading ${imageUris.length} images to nsfw-temp-processing bucket`);

      // ✅ CHECK BUCKET EXISTS
      console.log(`🧪 Checking storage bucket availability...`);
      
      // Check if user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log(`👤 Auth check:`, { 
        authenticated: !!user, 
        userId: user?.id,
        authError: authError?.message 
      });
      
      console.log(`🔧 Supabase config:`, {
        url: supabaseUrl,
        hasUrl: !!supabaseUrl,
        urlValid: supabaseUrl?.includes('supabase.co')
      });

      if (!user) {
        throw new Error('User not authenticated. Please sign in first.');
      }

      try {
        // Try to list files in bucket instead of listing buckets
        const { data: files, error: listError } = await supabase.storage
          .from('nsfw-temp-processing')
          .list('', { limit: 1 });
        
        console.log(`📦 Bucket test result:`, { 
          canAccess: !listError, 
          error: listError?.message,
          filesFound: files?.length 
        });
        
        if (listError) {
          console.warn(`⚠️ Cannot list buckets: ${listError.message}`);
          console.log(`🔄 Trying direct bucket access instead...`);
        } else {
          const nsfwBucket = buckets?.find(b => b.name === 'nsfw-temp-processing');
          if (!nsfwBucket) {
            console.warn(`⚠️ Bucket not found in list. Available: ${buckets?.map(b => b.name).join(', ')}`);
            console.log(`🔄 Trying direct bucket access instead...`);
          } else {
            console.log(`✅ Bucket 'nsfw-temp-processing' found in list`);
          }
        }

        // Test upload with tiny file
        const testBlob = new Blob(['test'], { type: 'text/plain' });
        const testPath = `test-${Date.now()}.txt`;
        
        console.log(`🧪 Testing upload to: ${supabaseUrl}/storage/v1/object/nsfw-temp-processing/${testPath}`);
        
        const { data: testUploadData, error: testUploadError } = await supabase.storage
          .from('nsfw-temp-processing')
          .upload(testPath, testBlob);

        if (testUploadError) {
          console.error(`❌ Test upload failed:`, {
            message: testUploadError.message,
            details: testUploadError
          });
          throw new Error(`Test upload failed: ${testUploadError.message}`);
        }

        console.log(`✅ Test upload successful:`, testUploadData);

        // Clean up test file
        const { error: removeError } = await supabase.storage.from('nsfw-temp-processing').remove([testPath]);
        if (removeError) {
          console.warn(`⚠️ Failed to clean up test file:`, removeError);
        }

      } catch (storageTestError) {
        console.error(`❌ Storage test failed:`, storageTestError);
        throw new Error(`Storage not accessible: ${storageTestError instanceof Error ? storageTestError.message : 'Unknown error'}`);
      }

      // Continue with existing upload logic...
      const bucketPath = `bulk-${Date.now()}-${userId}`;
      const uploadedPaths: string[] = [];
      
      console.log(`📁 Bucket path: ${bucketPath}`);

      for (let i = 0; i < imageUris.length; i++) {
        const uri = imageUris[i];
        const fileName = `${bucketPath}/image-${i}-${Date.now()}.jpg`;
        
        console.log(`📤 Uploading ${i + 1}/${imageUris.length}: ${uri.substring(0, 50)}...`);
        console.log(`📄 Target file: ${fileName}`);
        
        try {
          // Read image as blob with detailed logging
          console.log(`🔍 Fetching image from URI...`);
          const response = await fetch(uri);
          
          console.log(`📥 Fetch response:`, {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image ${i}: ${response.statusText}`);
          }
          
          const blob = await response.blob();
          console.log(`📦 Blob created: ${blob.size} bytes, type: ${blob.type}`);
          
          if (blob.size === 0) {
            throw new Error(`Empty blob for image ${i}`);
          }
          
          // Upload to nsfw-temp-processing bucket
          console.log(`☁️ Uploading to Supabase storage...`);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('nsfw-temp-processing')
            .upload(fileName, blob, {
              contentType: 'image/jpeg',
              upsert: false
            });

          if (uploadError) {
            console.error(`❌ Upload error for image ${i}:`, uploadError);
            throw new Error(`Failed to upload image ${i}: ${uploadError.message}`);
          }

          console.log(`✅ Upload successful for image ${i}:`, uploadData?.path);
          uploadedPaths.push(fileName);
          
        } catch (imageError) {
          console.error(`❌ Failed to process image ${i}:`, imageError);
          throw new Error(`Image ${i} failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`);
        }
      }

      console.log(`📦 All ${uploadedPaths.length} images uploaded to storage, submitting job...`);

      // ✅ Step 2: Send storage paths to edge function
      const { data, error } = await supabase.functions.invoke('bulk-nsfw-submit', {
        body: {
          storagePaths: uploadedPaths,
          bucketPath,
          userId,
          totalImages: uploadedPaths.length
        }
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw new Error(`Bulk submission failed: ${error.message || 'Unknown error'}`);
      }

      if (!data?.jobId) {
        console.error('❌ No job ID returned:', data);
        throw new Error('No job ID returned from bulk submission');
      }

      console.log(`✅ Bulk job submitted successfully:`, data);
      return data.jobId;

    } catch (error) {
      console.error('❌ Exception during bulk submission:', error);
      throw error;
    }
  }

  static async checkJobStatus(jobId: string): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('bulk-nsfw-status', {
        body: { jobId },
        headers: {
          'X-Request-ID': `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      });

      if (error) {
        console.error('❌ Status check error:', error);
        throw new Error(`Status check failed: ${error.message || 'Unknown error'}`);
      }

      return data;

    } catch (error) {
      console.error('❌ Failed to check job status:', error);
      throw error instanceof Error ? error : new Error('Unknown error during status check');
    }
  }

  static async pollJobUntilComplete(
    jobId: string, 
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let pollCount = 0;
      
      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          const status = await this.checkJobStatus(jobId);
          
          const progress: BulkProcessingProgress = {
            current: status.progress || 0,
            total: 100,
            status: status.status,
            message: this.getStatusMessage(status.status, status.progress || 0)
          };

          if (onProgress) {
            onProgress(progress);
          }

          console.log(`📊 Job ${jobId} poll #${pollCount}: ${status.status} (${status.progress || 0}%)`);

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            console.log(`🎉 Job ${jobId} completed successfully:`, {
              totalImages: status.totalImages,
              nsfwDetected: status.nsfwDetected,
              resultsCount: status.results?.length || 0,
              processingTime: Date.now() - startTime
            });
            resolve(status);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            const errorMessage = status.error || 'Job failed without specific error message';
            console.error(`❌ Job ${jobId} failed:`, errorMessage);
            reject(new Error(`Bulk processing failed: ${errorMessage}`));
          }
          
          // Check for timeout
          if (Date.now() - startTime > this.MAX_POLL_TIME_MS) {
            clearInterval(pollInterval);
            console.error(`⏰ Job ${jobId} timed out after ${this.MAX_POLL_TIME_MS}ms`);
            reject(new Error('Job timeout - processing took too long'));
          }

        } catch (error) {
          clearInterval(pollInterval);
          console.error(`❌ Polling error for job ${jobId}:`, error);
          reject(error instanceof Error ? error : new Error('Unknown polling error'));
        }
      }, this.POLL_INTERVAL_MS);

      // Cleanup timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        reject(new Error('Job timeout - maximum polling time exceeded'));
      }, this.MAX_POLL_TIME_MS + 5000); // Extra buffer
    });
  }

  static async processBulkImages(
    imageUris: string[], 
    userId: string,
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<BulkProcessingResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Starting bulk processing for ${imageUris.length} images`);
      
      // Submit job
      if (onProgress) {
        onProgress({
          current: 0,
          total: 100,
          status: 'submitting',
          message: 'Submitting images for bulk processing...'
        });
      }
      
      const jobId = await this.submitBulkJob(imageUris, userId);
      
      // Poll until complete
      const results = await this.pollJobUntilComplete(jobId, onProgress);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`🎉 Bulk processing complete!`, {
        jobId,
        totalImages: results.totalImages,
        nsfwDetected: results.nsfwDetected,
        processingTimeMs: processingTime,
        efficiency: `${((results.totalImages - results.nsfwDetected) / results.totalImages * 100).toFixed(1)}% safe content`
      });
      
      return {
        jobId,
        totalImages: results.totalImages,
        nsfwDetected: results.nsfwDetected,
        results: results.results || [],
        processingTimeMs: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Bulk processing failed:', {
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: processingTime,
        imageCount: imageUris.length
      });
      throw error instanceof Error ? error : new Error('Unknown error during bulk processing');
    }
  }

  private static getStatusMessage(status: string, progress: number): string {
    switch (status) {
      case 'uploading':
        return 'Uploading images to secure storage...';
      case 'submitted':
        return 'Images uploaded, starting AWS analysis...';
      case 'processing':
        return `AWS analyzing images... (${progress}%)`;
      case 'completed':
        return 'Analysis complete!';
      case 'failed':
        return 'Processing failed';
      default:
        return `Status: ${status}`;
    }
  }

  // Utility method for testing/debugging
  static async getJobDetails(jobId: string): Promise<any> {
    try {
      const status = await this.checkJobStatus(jobId);
      return {
        jobId,
        ...status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to get job details for ${jobId}:`, error);
      throw error;
    }
  }
}