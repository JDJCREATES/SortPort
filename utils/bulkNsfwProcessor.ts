import { supabase } from './supabase';

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
  private static readonly POLL_INTERVAL_MS = 3000;
  private static readonly MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Streamlined bulk processing - direct submit to AWS
   */
  static async processBulkImages(
    imageUris: string[], 
    userId: string,
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<BulkProcessingResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Starting streamlined bulk processing for ${imageUris.length} images`);
      
      if (onProgress) {
        onProgress({
          current: 0,
          total: 100,
          status: 'submitting',
          message: 'Submitting images for AWS analysis...'
        });
      }

      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Direct submit to bulk-nsfw-submit function
      const { data: submitData, error: submitError } = await supabase.functions.invoke('bulk-nsfw-submit', {
        body: {
          imageUris,
          userId,
          totalImages: imageUris.length
        }
      });

      if (submitError || !submitData?.jobId) {
        console.error(`❌ Submit failed:`, { error: submitError, data: submitData });
        throw new Error(`Failed to submit bulk job: ${submitError?.message || 'Unknown error'}`);
      }

      const jobId = submitData.jobId;
      console.log(`✅ Bulk job submitted successfully: ${jobId}`);

      if (onProgress) {
        onProgress({
          current: 20,
          total: 100,
          status: 'processing',
          message: 'AWS analyzing images...'
        });
      }

      // Poll for completion
      const results = await this.pollJobUntilComplete(jobId, onProgress);
      
      const processingTime = Date.now() - startTime;
      
      return {
        jobId,
        totalImages: results.totalImages,
        nsfwDetected: results.nsfwDetected,
        results: results.results || [],
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.error('❌ Bulk processing failed:', error);
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

  private static async pollJobUntilComplete(
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
          
          console.log(`📊 Poll ${pollCount}: Job ${jobId} status: ${status.status}`);
          
          if (onProgress) {
            const progress = Math.min(20 + (pollCount * 5), 90); // 20-90%
            onProgress({
              current: progress,
              total: 100,
              status: status.status,
              message: this.getStatusMessage(status.status, progress)
            });
          }

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            if (onProgress) {
              onProgress({
                current: 100,
                total: 100,
                status: 'completed',
                message: 'Analysis complete!'
              });
            }
            resolve(status);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(`Job failed: ${status.error_message || 'Unknown error'}`));
          } else if (Date.now() - startTime > this.MAX_POLL_TIME_MS) {
            clearInterval(pollInterval);
            reject(new Error('Job polling timeout'));
          }
        } catch (error) {
          console.error(`❌ Poll ${pollCount} failed:`, error);
          if (pollCount > 10) { // Give up after 10 failed polls
            clearInterval(pollInterval);
            reject(error);
          }
        }
      }, this.POLL_INTERVAL_MS);
    });
  }

  private static getStatusMessage(status: string, progress: number): string {
    switch (status) {
      case 'uploading':
        return 'Uploading images to AWS...';
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

  // Deprecated - kept for backwards compatibility
  static async submitBulkJob(imageUris: string[], userId: string): Promise<string> {
    console.warn('⚠️ submitBulkJob is deprecated. Use processBulkImages instead.');
    const result = await this.processBulkImages(imageUris, userId);
    return result.jobId;
  }
}
