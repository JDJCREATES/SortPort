import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import ImageResizer from 'react-native-image-resizer';
import { HardwareProfiler, HardwareProfile, ProcessingSettings } from './hardwareProfiler';
import { DynamicPerformanceAdjuster, PerformanceMetrics } from './performance/dynamicPerformanceAdjuster';

/**
 *  🌐 Handles preparing and sending files through edge functions on supabase, into AWS Rekognition, 
 */

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
  private static readonly MAX_POLL_TIME_MS = 10 * 60 * 1000;
  private static readonly UPLOAD_TIMEOUT_MS = 180000;
  private static readonly MAX_RETRIES = 2;
  
  // 🚀 OPTIMIZED SETTINGS for faster uploading
  private static currentSettings: ProcessingSettings = {
    compressionWorkers: 8,
    uploadStreams: 12,            // Keep parallel uploads high
    batchSize: 12,                // Reduced for faster individual batch processing
    compressionQuality: 0.7,
    maxImageSize: 512,
    cacheSize: 100,
    enableAggressive: true,
    memoryWarningThreshold: 1536
  };
  
  private static hardwareProfile: HardwareProfile | null = null;
  private static isProcessing = false;
  private static shouldThrottle = false;
  
  // Enhanced caching and queuing
  private static compressionCache = new Map<string, string>();
  private static compressionCacheReverse = new Map<string, string>(); // OPTIMIZATION: Reverse lookup O(1)
  private static compressionQueue: string[] = [];
  private static uploadQueue: { batch: string[], index: number }[] = [];
  private static activeCompressions = 0;
  private static activeUploads = 0;
  
  // Performance tracking
  private static compressionStats = {
    totalProcessed: 0,
    totalTimeMs: 0,
    averageTimeMs: 0
  };

  private static uploadStats = {
    totalUploads: 0,
    totalTimeMs: 0,
    averageTimeMs: 0,
    successCount: 0,
    errorCount: 0,
    batchSizes: [] as number[], // Track batch sizes to detect anomalies
    recentBatchSizes: [] as number[] // Track recent batch sizes for analysis
  };

  /**
   * 🔍 Initialize with hardware-optimized settings
   */
  private static async initializeHardwareOptimization(): Promise<void> {
    try {
      console.log('🔍 Initializing NATIVE hardware optimization...');
      
      this.hardwareProfile = await HardwareProfiler.getHardwareProfile();
      
      // Override with optimized settings while respecting hardware profiler recommendations
      this.currentSettings = {
        ...this.hardwareProfile.recommendedSettings,
        compressionWorkers: Math.min(12, this.hardwareProfile.recommendedSettings.compressionWorkers * 2),
        uploadStreams: Math.min(6, this.hardwareProfile.recommendedSettings.uploadStreams * 2),
        batchSize: this.hardwareProfile.recommendedSettings.batchSize, // FIXED: Respect hardware profiler's batchSize calculation
        enableAggressive: true
      };
      
      console.log('⚡ NATIVE-optimized settings:', {
        tier: this.hardwareProfile.deviceTier,
        workers: this.currentSettings.compressionWorkers,
        streams: this.currentSettings.uploadStreams,
        batchSize: this.currentSettings.batchSize,
        aggressive: this.currentSettings.enableAggressive
      });
      
      // Start memory monitoring
      HardwareProfiler.startMemoryMonitoring(
        (availableMB) => this.handleMemoryWarning(availableMB),
        this.currentSettings.memoryWarningThreshold
      );
      
    } catch (error) {
      console.error('❌ Native optimization failed, using safe defaults:', error);
      this.currentSettings = {
        compressionWorkers: 4,
        uploadStreams: 2,
        batchSize: 10,
        compressionQuality: 0.7,
        maxImageSize: 800,
        cacheSize: 50,
        enableAggressive: false,
        memoryWarningThreshold: 1024
      };
    }
  }

  /**
   * ⚠️ Handle memory warnings by throttling processing - FIXED: Don't clear cache during active processing
   */
  private static handleMemoryWarning(availableMB: number): void {
    console.warn(`🚨 Memory warning: ${availableMB}MB available`);
    
    if (availableMB < this.currentSettings.memoryWarningThreshold * 0.5) {
      // Critical memory - emergency throttling
      this.shouldThrottle = true;
      this.currentSettings = {
        ...this.currentSettings,
        compressionWorkers: Math.max(2, Math.floor(this.currentSettings.compressionWorkers / 3)),
        uploadStreams: 1,
        batchSize: Math.max(5, Math.floor(this.currentSettings.batchSize / 2)),
        cacheSize: Math.max(50, Math.floor(this.currentSettings.cacheSize / 2)) // FIXED: Don't reduce cache too much
      };
      
      // FIXED: Only clear cache if we're not actively processing
      if (!this.isProcessing) {
        this.clearOldCache();
      }
      
      console.log('🚨 Emergency throttling activated:', this.currentSettings);
    } else if (availableMB < this.currentSettings.memoryWarningThreshold * 0.75) {
      // Moderate throttling
      this.shouldThrottle = true;
      this.currentSettings = {
        ...this.currentSettings,
        compressionWorkers: Math.max(2, Math.floor(this.currentSettings.compressionWorkers / 2)),
        uploadStreams: Math.max(1, Math.floor(this.currentSettings.uploadStreams / 2))
      };
      
      console.log('⚠️ Moderate throttling activated:', this.currentSettings);
    }
  }

  /**
   * 🧹 Clear old cache entries - OPTIMIZED: Clear both forward and reverse caches
   */
  private static clearOldCache(): void {
    // FIXED: Only clear when significantly over limit to avoid clearing during active processing
    const clearThreshold = this.currentSettings.cacheSize * 1.5; // 50% buffer
    
    if (this.compressionCache.size > clearThreshold) {
      const entriesToClear = this.compressionCache.size - this.currentSettings.cacheSize;
      const keysToDelete = Array.from(this.compressionCache.keys()).slice(0, entriesToClear);
      
      keysToDelete.forEach(originalUri => {
        const compressedUri = this.compressionCache.get(originalUri);
        this.compressionCache.delete(originalUri);
        if (compressedUri) {
          this.compressionCacheReverse.delete(compressedUri); // OPTIMIZATION: Clean reverse cache too
        }
      });
      console.log(`🧹 Cleared ${keysToDelete.length} cache entries (${this.compressionCache.size} remaining)`);
    }
  }

  /**
   * Get Supabase function URL
   */
  private static getSupabaseFunctionUrl(functionName: string): string {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                       process.env.REACT_NATIVE_SUPABASE_URL ||
                       'https://your-project.supabase.co';
    
    return `${supabaseUrl}/functions/v1/${functionName}`;
  }

  /**
   * 🚀 NATIVE: Ultra-fast image compression using react-native-image-resizer - FIXED: Better cache management
   */
  private static async compressImageNative(uri: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Check if already compressed
      if (this.compressionCache.has(uri)) {
        return this.compressionCache.get(uri)!;
      }

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        return uri;
      }

     
      
      // Use react-native-image-resizer for MUCH faster compression
      const result = await ImageResizer.createResizedImage(
        uri,
        this.currentSettings.maxImageSize,    // width
        this.currentSettings.maxImageSize,    // height
        'JPEG',                               // format (AWS Rekognition compatible)
        this.currentSettings.compressionQuality * 100, // quality (0-100)
        0,                                    // rotation
        undefined,                            // outputPath
        false,                                // keepMeta
        {
          mode: 'contain',                    // resize mode
          onlyScaleDown: true                 // don't upscale
        }
      );

      const processingTime = Date.now() - startTime;
      
      // Update stats
      this.compressionStats.totalProcessed++;
      this.compressionStats.totalTimeMs += processingTime;
      this.compressionStats.averageTimeMs = this.compressionStats.totalTimeMs / this.compressionStats.totalProcessed;

      // FIXED: Cache the result BEFORE checking cache size
      this.compressionCache.set(uri, result.uri);
      
      // FIXED: Only clear cache if we're significantly over limit and not actively uploading
      if (this.compressionCache.size > this.currentSettings.cacheSize * 2) {
        this.clearOldCache();
      }
      
      return result.uri;
      
    } catch (error) {
      console.warn('⚠️ Native compression failed, using original:', error);
      // Cache the original URI to avoid repeated failures
      this.compressionCache.set(uri, uri);
      return uri;
    }
  }

  /**
   * 🚀 PARALLEL: Streaming compression with native processing - FIXED: Better coordination
   */
  private static async startNativeCompressionStream(
    imageUris: string[],
    onProgress?: (compressed: number, total: number) => void
  ): Promise<void> {
    
    // FIXED: Increase cache size to accommodate all images plus buffer
    const requiredCacheSize = Math.max(imageUris.length * 1.2, this.currentSettings.cacheSize);
    this.currentSettings.cacheSize = requiredCacheSize;
    
    this.compressionQueue = [...imageUris];
    let completedCount = 0;
    
    // Start multiple native compression workers
    const workers = Array.from({ length: this.currentSettings.compressionWorkers }, (_, i) => 
      this.nativeCompressionWorker(i, () => {
        completedCount++;
        if (onProgress) {
          onProgress(completedCount, imageUris.length);
        }
      })
    );
    
    await Promise.all(workers);
    console.log(`⚡ NATIVE compression stream complete: ${this.compressionCache.size} images (avg: ${this.compressionStats.averageTimeMs.toFixed(0)}ms per image)`);
  }

  /**
   * 🚀 Native compression worker with enhanced error handling
   */
  private static async nativeCompressionWorker(
    workerId: number, 
    onComplete: () => void
  ): Promise<void> {
    console.log(`🔧 Native worker ${workerId} started`);
    
    while (this.compressionQueue.length > 0 && this.isProcessing) {
      // Dynamic throttling check
      if (this.shouldThrottle && this.activeCompressions >= this.currentSettings.compressionWorkers) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      
      const uri = this.compressionQueue.shift();
      if (!uri) break;
      
      // Skip if already compressed
      if (this.compressionCache.has(uri)) {
        onComplete();
        continue;
      }
      
      this.activeCompressions++;
      
      try {
        const compressedUri = await this.compressImageNative(uri);
        
        // Cache management
        
        this.compressionCache.set(uri, compressedUri);
        this.compressionCacheReverse.set(compressedUri, uri); // OPTIMIZATION: Store reverse mapping
        if (this.compressionCache.size > this.currentSettings.cacheSize) {
          this.clearOldCache();
        }        onComplete();
        
      } catch (error) {
        console.error(`❌ Native worker ${workerId} compression failed for ${uri}:`, error);
        this.compressionCache.set(uri, uri); // Fallback to original
        onComplete();
      } finally {
        this.activeCompressions--;
      }
      
      // Minimal delay for native processing
      const delay = this.shouldThrottle ? 50 : 10;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
  }

  /**
   * 🔥 Enhanced upload stream with single session tracking - FIXED
   */
  private static async startEnhancedUploadStream(
    imageUris: string[],
    userId: string,
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<{ jobId: string, bucketName: string, totalUploaded: number }> {
    console.log(`🔥 Starting ENHANCED upload stream for ${imageUris.length} images`);
    
    // FIXED: Session tracking with validation
    let sessionJobId: string | null = null;
    let sessionBucketName: string | null = null;
    let totalUploaded = 0;
    let uploadedBatches = 0;
    
    // Create batches with smart merging for small final batches
    const batches: string[][] = [];
    for (let i = 0; i < imageUris.length; i += this.currentSettings.batchSize) {
      batches.push(imageUris.slice(i, i + this.currentSettings.batchSize));
    }
    
    // OPTIMIZATION: Merge small final batch with previous batch to avoid single-image uploads
    if (batches.length > 1) {
      const lastBatch = batches[batches.length - 1];
      const secondLastBatch = batches[batches.length - 2];
      
      // If last batch has 3 or fewer images, merge with previous batch
      if (lastBatch.length <= 3 && secondLastBatch.length + lastBatch.length <= this.currentSettings.batchSize * 1.5) {
        console.log(`🔧 Merging small final batch (${lastBatch.length} images) with previous batch (${secondLastBatch.length} images)`);
        secondLastBatch.push(...lastBatch);
        batches.pop(); // Remove the small final batch
      }
    }
    
    console.log(`📦 Created ${batches.length} batches (avg: ${Math.round(imageUris.length / batches.length)} images each)`);
    
    // REDUCED LOGGING: Only log batch sizes in debug mode or for unusual distributions
    if (batches.length <= 3 || batches.some(b => b.length <= 3)) {
      batches.forEach((batch, index) => {
        console.log(`📦 Batch ${index + 1}: ${batch.length} images`);
      });
    }
    
    // FIXED: Process batches sequentially to maintain session consistency
    // The concurrent approach was creating separate sessions - reverting to sequential with optimized S3 parallelization
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Wait for compression to be ready
      await this.waitForCompressionReady(batch);
      
      const compressedBatch = batch.map(uri => this.compressionCache.get(uri) || uri);
      
      try {
        console.log(`🚀 Processing batch ${i + 1}/${batches.length} (${compressedBatch.length} images)...`);
        
        const result = await this.uploadBatchWithRetry(compressedBatch, userId, i, batches.length);
        
        // FIXED: Establish or validate session
        if (sessionJobId === null) {
          // First batch - establish session
          sessionJobId = result.jobId;
          sessionBucketName = result.bucketName;
          console.log(`✅ Session established: job=${sessionJobId}, bucket=${sessionBucketName}`);
        } else {
          // Subsequent batches - validate session consistency
          if (result.jobId !== sessionJobId) {
            console.error(`❌ CRITICAL: Job ID changed mid-session! Expected ${sessionJobId}, got ${result.jobId}`);
            throw new Error(`Session consistency error: Job ID changed from ${sessionJobId} to ${result.jobId}`);
          }
          if (result.bucketName !== sessionBucketName) {
            console.error(`❌ CRITICAL: Bucket name changed mid-session! Expected ${sessionBucketName}, got ${result.bucketName}`);
            throw new Error(`Session consistency error: Bucket changed from ${sessionBucketName} to ${result.bucketName}`);
          }
          console.log(`✅ Session validated: job=${sessionJobId}, bucket=${sessionBucketName}`);
        }
        
        totalUploaded += result.uploadedCount;
        uploadedBatches++;
        
        // Adjust performance settings based on real-time metrics
        this.adjustSettingsBasedOnPerformance();
        
        if (onProgress) {
          onProgress(uploadedBatches, batches.length);
        }
        
      } catch (error) {
        console.error(`❌ Failed to upload batch ${i + 1}:`, error);
        throw error;
      }
      
      // Small delay between batches to avoid overwhelming the server
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (!sessionJobId || !sessionBucketName) {
      throw new Error('No successful uploads - session not established');
    }
    
    console.log(`✅ Upload session complete: job=${sessionJobId}, bucket=${sessionBucketName}, uploaded=${totalUploaded}`);
    
    // Mark session as ready for processing
    await this.finalizeUploadSession(sessionJobId);
    
    return { 
      jobId: sessionJobId, 
      bucketName: sessionBucketName, 
      totalUploaded 
    };
  }

  /**
   * 🔥 Wait for batch compression to be ready - FIXED: Better cache checking
   */
  private static async waitForCompressionReady(batch: string[]): Promise<void> {
    const maxWait = 45000; // 45 seconds max wait
    const startTime = Date.now();
    
    console.log(`⏳ Waiting for compression of ${batch.length} images...`);
    
    while (Date.now() - startTime < maxWait) {
      const readyCount = batch.filter(uri => {
        const hasCache = this.compressionCache.has(uri);
        if (!hasCache) {
          console.log(`🔍 Missing cache for: ${uri.substring(uri.lastIndexOf('/') + 1)}`);
        }
        return hasCache;
      }).length;
      const readyPercent = Math.round((readyCount / batch.length) * 100);
      
      // FIXED: Wait for 100% completion to ensure consistency
      if (readyCount === batch.length) {
        console.log(`✅ All ${batch.length} images compressed and ready (100%)`);
        return;
      }
      
      // Log progress every 5 seconds for batches that aren't ready
      if ((Date.now() - startTime) % 5000 < 100) {
        console.log(`⏳ Compression progress: ${readyCount}/${batch.length} (${readyPercent}%) ready...`);
        
        // FIXED: Debug missing cache entries
        const missingUris = batch.filter(uri => !this.compressionCache.has(uri));
        if (missingUris.length > 0) {
          console.log(`🔍 Missing cache entries for: ${missingUris.map(uri => uri.substring(uri.lastIndexOf('/') + 1)).join(', ')}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const finalReadyCount = batch.filter(uri => this.compressionCache.has(uri)).length;
    const finalPercent = Math.round((finalReadyCount / batch.length) * 100);
    
    if (finalReadyCount < batch.length) {
      console.warn(`⚠️ Compression timeout after ${maxWait}ms. Only ${finalReadyCount}/${batch.length} (${finalPercent}%) images ready. Proceeding anyway...`);
      
      // FIXED: Log which specific images are missing
      const missingUris = batch.filter(uri => !this.compressionCache.has(uri));
      console.warn(`❌ Missing compressed images: ${missingUris.map(uri => uri.substring(uri.lastIndexOf('/') + 1)).join(', ')}`);
    }
  }

  /**
   * Upload a single batch with retry logic and timeout (SAME AS BEFORE - no changes to data flow)
   */
  private static async uploadBatchWithRetry(
    batchUris: string[],
    userId: string,
    batchIndex: number,
    totalBatches: number,
    retryCount = 0
  ): Promise<{ jobId: string; bucketName: string; uploadedCount: number }> {
    const maxRetries = 3; // Increased retries
    
    try {
      console.log(`📤 Uploading batch ${batchIndex + 1} (${batchUris.length} images) - Attempt ${retryCount + 1}`);
      
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('batchIndex', batchIndex.toString());
      formData.append('totalImages', batchUris.length.toString());
      formData.append('isLastBatch', (batchIndex === totalBatches - 1).toString());

      // REDUCED LOGGING: Less verbose FormData logging
      console.log(`📦 Preparing FormData for ${batchUris.length} images...`);
      
      let successfulImages = 0;
      const formDataEntries = await Promise.all(
        batchUris.map(async (compressedUri, i) => {
          try {
            // OPTIMIZATION: O(1) reverse cache lookup instead of O(n) search
            const originalDevicePath = this.compressionCacheReverse.get(compressedUri) || compressedUri;
            
            const fileObject = {
              uri: compressedUri,
              type: 'image/jpeg',
              name: `image_${i}.jpg`,
            };
            
            return {
              success: true,
              imageEntry: [`image_${i}`, fileObject],
              pathEntry: [`original_path_${i}`, originalDevicePath]
            };
          } catch (error) {
            console.error(`❌ Failed to process image ${i} in batch ${batchIndex + 1}:`, error);
            return { success: false };
          }
        })
      );
      
      // OPTIMIZATION: Batch append to FormData
      formDataEntries.forEach(entry => {
        if (entry.success && entry.imageEntry && entry.pathEntry) {
          (formData as any).append(entry.imageEntry[0], entry.imageEntry[1]);
          formData.append(entry.pathEntry[0], entry.pathEntry[1]);
          successfulImages++;
        }
      });

      if (successfulImages === 0) {
        throw new Error(`No images could be processed in batch ${batchIndex + 1}`);
      }

      // REDUCED LOGGING: Summary logging instead of per-image logging
      console.log(`✅ FormData prepared: ${successfulImages}/${batchUris.length} images`);

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
      
      // OPTIMIZATION: Dynamic timeout based on batch size - smaller batches get shorter timeouts
      const baseTimeout = this.UPLOAD_TIMEOUT_MS;
      const dynamicTimeout = batchUris.length <= 3 ? 
        Math.min(baseTimeout, 60000) : // Small batches: max 60 seconds
        baseTimeout; // Normal batches: full timeout
      
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Upload timeout after ${dynamicTimeout}ms for batch ${batchIndex + 1} (${batchUris.length} images)`);
        controller.abort();
      }, dynamicTimeout);

      const uploadStartTime = Date.now();
      
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
        const uploadTime = Date.now() - uploadStartTime;

        // REDUCED LOGGING: Simplified response logging
        console.log(`📡 Batch ${batchIndex + 1}: ${response.status} (${uploadTime}ms)`);

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
          // OPTIMIZATION: Reduced verbose logging - only log first 100 chars for debugging
          if (responseText.length > 200) {
            console.log(`📄 Response for batch ${batchIndex + 1}: ${responseText.substring(0, 100)}...`);
          } else {
            console.log(`📄 Response for batch ${batchIndex + 1}: ${responseText}`);
          }
          result = JSON.parse(responseText);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          console.error('❌ Failed to parse response JSON:', errorMessage);
          throw new Error(`Invalid JSON response: ${errorMessage}`);
        }

        console.log(`✅ Batch ${batchIndex + 1} uploaded successfully to session ${result.jobId}:`, {
          jobId: result.jobId,
          bucketName: result.bucketName,
          uploadedCount: result.uploadedCount,
          status: result.status
        });
        
        if (!result.jobId || !result.bucketName || typeof result.uploadedCount !== 'number') {
          throw new Error(`Invalid response structure: ${JSON.stringify(result)}`);
        }
        
        // Track successful upload
        this.updateUploadStats(true, uploadTime, batchUris.length);
        
        return {
          jobId: result.jobId,
          bucketName: result.bucketName,
          uploadedCount: result.uploadedCount
        };

      } catch (error) {
        clearTimeout(timeoutId);
        
        // Track failed upload with estimated time
        const uploadTime = Date.now() - uploadStartTime;
        this.updateUploadStats(false, uploadTime, batchUris.length);
        
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
   * 🔥 Wait for first compression batch to be ready before starting uploads
   */
  private static async waitForFirstCompressionBatch(imageUris: string[], batchSize: number): Promise<void> {
    const firstBatch = imageUris.slice(0, batchSize);
    const maxWait = 30000; // 30 seconds max wait
    const startTime = Date.now();
    
    console.log(`⏳ Waiting for first compression batch (${firstBatch.length} images) to complete...`);
    
    while (Date.now() - startTime < maxWait) {
      const readyCount = firstBatch.filter(uri => this.compressionCache.has(uri)).length;
      const readyPercent = (readyCount / firstBatch.length) * 100;
      
      // Log progress every 5 seconds
      if ((Date.now() - startTime) % 5000 < 100) {
        console.log(`⏳ First batch progress: ${readyCount}/${firstBatch.length} (${readyPercent.toFixed(0)}%) ready...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const finalReadyCount = firstBatch.filter(uri => this.compressionCache.has(uri)).length;
    console.warn(`⚠️ First batch timeout after ${maxWait}ms, proceeding with ${finalReadyCount}/${firstBatch.length} ready images`);
  }

  /**
   * 🚀 ULTIMATE NATIVE PERFORMANCE: Sequential upload pipeline for session consistency
   */
  static async processBulkImagesNative(
    imageUris: string[],
    userId: string,
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<BulkProcessingResult> {
    const startTime = Date.now();
    this.isProcessing = true;
    
    // ML Kit results cache (declared at function level)
    const mlKitResults = new Map<string, any>();
    
    try {
      // Initialize hardware optimization
      await this.initializeHardwareOptimization();
      
      // FIXED: Clear caches and reset stats, but set appropriate cache size first
      this.currentSettings.cacheSize = Math.max(imageUris.length * 1.5, 200); // Ensure cache can hold all images
      this.compressionCache.clear();
      this.compressionStats = { totalProcessed: 0, totalTimeMs: 0, averageTimeMs: 0 };
      this.uploadStats = { 
        totalUploads: 0, 
        totalTimeMs: 0, 
        averageTimeMs: 0, 
        successCount: 0, 
        errorCount: 0,
        batchSizes: [],
        recentBatchSizes: []
      };
      
      if (onProgress) {
        onProgress({
          current: 0,
          total: 100,
          status: 'preparing',
          message: `🚀 Scanning ${imageUris.length} images...`
        });
      }

      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // 🔥 PHASE 1: Start NATIVE compression stream
      let compressionProgress = 0;
      const compressionPromise = this.startNativeCompressionStream(
        imageUris,
        (compressed, total) => {
          compressionProgress = Math.round((compressed / total) * 60); // 0-60% for compression
          if (onProgress) {
            onProgress({
              current: compressionProgress,
              total: 100,
              status: 'compressing',
              message: `⚡ Compressed ${compressed}/${total} images (${this.currentSettings.compressionWorkers} workers, avg: ${this.compressionStats.averageTimeMs.toFixed(0)}ms)`
            });
          }
        }
      );

      // Wait for compression to complete
      await compressionPromise;
      
      // FIXED: Verify compression completed successfully
      const compressedCount = imageUris.filter(uri => this.compressionCache.has(uri)).length;
      console.log(`📊 Compression verification: ${compressedCount}/${imageUris.length} images in cache`);
      
      if (compressedCount === 0) {
        throw new Error('No images were successfully compressed');
      }
      
      if (onProgress) {
        onProgress({
          current: 40,
          total: 100,
          status: 'analyzing',
          message: `🧠 Starting ML Kit analysis of ${compressedCount} images...`
        });
      }

      // 🔥 PHASE 1.5: ML Kit Processing (after compression, before upload)
      let mlKitProgress = 0;
      
      try {
        const { MLKitManager } = await import('./mlkit/MLKitManager');
        const mlKitInstance = MLKitManager.getInstance({
          maxImageSize: 1024,
          compressionQuality: 0.8,
          enableImageLabeling: true,
          enableObjectDetection: true,
          enableFaceDetection: true,
          enableTextRecognition: true,
          enableQualityAssessment: true,
          labelConfidenceThreshold: 0.5,
          objectConfidenceThreshold: 0.5,
          faceConfidenceThreshold: 0.5,
          batchSize: 10,
          maxConcurrentProcessing: 4,
          cachingEnabled: true,
          secureProcessing: true,
          clearCacheAfterProcessing: false
        });
        
        // Process compressed images with ML Kit
        const compressedUris = imageUris.map(uri => this.compressionCache.get(uri) || uri);
        
        for (let i = 0; i < compressedUris.length; i++) {
          const compressedUri = compressedUris[i];
          const originalUri = imageUris[i];
          
          try {
            // Generate a temporary ID for ML Kit processing
            const tempImageId = `compressed_${Date.now()}_${i}`;
            
            // Process with ML Kit but skip database update (we'll do it later)
            const analysis = await mlKitInstance.processImage(
              tempImageId, 
              compressedUri, 
              userId,
              { skipDatabaseUpdate: true }
            );
            
            mlKitResults.set(originalUri, analysis);
            
            mlKitProgress = Math.round(((i + 1) / compressedUris.length) * 100);
            
            if (onProgress) {
              onProgress({
                current: 40 + Math.round((mlKitProgress / 100) * 15), // 40-55% for ML Kit
                total: 100,
                status: 'analyzing',
                message: `🧠 Analyzed ${i + 1}/${compressedUris.length} images with ML Kit`
              });
            }
          } catch (mlError) {
            console.warn(`⚠️ ML Kit failed for ${originalUri}:`, mlError);
            // Continue processing even if ML Kit fails for individual images
          }
        }
        
        console.log(`✅ ML Kit processing complete: ${mlKitResults.size}/${imageUris.length} images analyzed`);
        
      } catch (mlKitError) {
        console.warn('⚠️ ML Kit processing failed, continuing without analysis:', mlKitError);
      }
      
      if (onProgress) {
        onProgress({
          current: 60,
          total: 100,
          status: 'uploading',
          message: `🚀 ${compressedCount}/${imageUris.length} images processed!`
        });
      }
      
      // 🔥 PHASE 2: Sequential upload stream for session consistency
      let uploadProgress = 0;
      const uploadResult = await this.startEnhancedUploadStream(
        imageUris,
        userId,
        (uploaded, total) => {
          uploadProgress = 60 + Math.round((uploaded / total) * 20); // 60-80% for upload
          if (onProgress) {
            onProgress({
              current: uploadProgress,
              total: 100,
              status: 'uploading',
              message: `🚀 Uploaded ${uploaded}/${total} batches!`
            });
          }
        }
      );

      const { jobId, bucketName, totalUploaded } = uploadResult;

      console.log(`🚀 NATIVE sequential processing complete: job=${jobId}, bucket=${bucketName}, uploaded=${totalUploaded}`);

      // 🔥 PHASE 3: Submit for processing (single job) - ENHANCED ERROR HANDLING
      if (onProgress) {
        onProgress({
          current: 85,
          total: 100,
          status: 'submitting',
          message: `⚡ Submitting job ${jobId} for AWS analysis...`
        });
      }

      try {
        console.log(`🚀 Submitting job ${jobId} to AWS Rekognition...`);
        
        const { data, error } = await supabase.functions.invoke('bulk-nsfw-submit', {
          body: {
            jobId,
            bucketName,
            userId
          }
        });

        if (error) {
          console.error(`❌ Submit function error:`, error);
          throw new Error(`Submit failed: ${error.message}`);
        }

        if (!data) {
          throw new Error('Submit failed: No response data');
        }


      } catch (submitError: unknown) {
        console.error(`❌ Submit error details:`, submitError);
        
        // Enhanced error handling
        const errorMessage = submitError instanceof Error ? submitError.message : String(submitError);
        
        if (errorMessage.includes('Edge Function returned a non-2xx status code')) {
          // Try to get more details from the error
          console.error(`❌ Edge function failed - this usually means AWS Rekognition error`);
          throw new Error(`AWS Rekognition submission failed. Check server logs for details.`);
        }
        
        throw new Error(`Submit failed: ${errorMessage}`);
      }

      if (onProgress) {
        onProgress({
          current: 90,
          total: 100,
          status: 'processing',
          message: `🔥 AWS processing job ${jobId}...`
        });
      }

      // Monitor single job
      const results = await this.monitorAllJobs([jobId], onProgress);

      // 🔥 PHASE 4: Update database with ML Kit analysis results
      if (mlKitResults.size > 0) {
        if (onProgress) {
          onProgress({
            current: 95,
            total: 100,
            status: 'finalizing',
            message: `🧠 Updating database with ML Kit analysis for ${mlKitResults.size} images...`
          });
        }

        try {
          const { MLKitManager } = await import('./mlkit/MLKitManager');
          const mlKitInstance = MLKitManager.getInstance();
          
          // Add a small delay to ensure database records are committed
          console.log('⏳ Waiting for database records to be committed...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Create mapping that will be populated by either approach
          const virtualImagesByOrder = new Map<number, any>();
          
          // First, check if bulk_job_virtual_images table exists and has data
          const { data: relationshipCheck, error: checkError } = await supabase
            .from('bulk_job_virtual_images')
            .select('*')
            .eq('job_id', jobId)
            .limit(5);
          
          if (checkError) {
            console.error('❌ bulk_job_virtual_images table not accessible:', checkError);
            console.log('📋 Falling back to metadata-based matching...');
            
            // FALLBACK: Query virtual_image table directly using metadata
            const { data: virtualImages, error: directQueryError } = await supabase
              .from('virtual_image')
              .select('id, original_path, original_name, hash, virtual_name, metadata')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(imageUris.length * 2);
            
            if (directQueryError) {
              console.error('❌ Failed to query virtual_image directly:', directQueryError);
              throw directQueryError;
            }
            
            console.log(`🔍 Found ${virtualImages?.length || 0} recent virtual images for fallback matching`);
            
            // Create mapping using metadata jobId if available
            virtualImages?.forEach(vimg => {
              // Check if metadata contains our jobId
              if (vimg.metadata && typeof vimg.metadata === 'object') {
                const metadata = vimg.metadata as any;
                if (metadata.jobId === jobId || metadata.processingJobId === jobId) {
                  // Try to extract upload order from metadata or S3 key pattern
                  let uploadOrder = metadata.uploadOrder;
                  if (uploadOrder === undefined && vimg.original_path) {
                    // Try to extract order from S3 path pattern like "batch-0-image-0007.jpg"
                    const orderMatch = vimg.original_path.match(/image-(\d+)/);
                    if (orderMatch) {
                      uploadOrder = parseInt(orderMatch[1], 10);
                    }
                  }
                  if (uploadOrder !== undefined) {
                    virtualImagesByOrder.set(uploadOrder, vimg);
                  }
                }
              }
            });
            
            console.log(`🗺️ Created fallback mapping for ${virtualImagesByOrder.size} virtual images by metadata`);
            
          } else {
            console.log(`✅ Found ${relationshipCheck?.length || 0} relationships in bulk_job_virtual_images`);
            
            // Use the relationship table (original approach)
            const { data: jobRelationships, error: relationshipError } = await supabase
              .from('bulk_job_virtual_images')
              .select('virtual_image_id, upload_order')
              .eq('job_id', jobId)
              .order('upload_order', { ascending: true });

            if (relationshipError) {
              console.error('❌ Failed to query job relationships:', relationshipError);
              throw relationshipError;
            }
            
            // Get virtual image details for the related IDs
            const virtualImageIds = jobRelationships?.map(rel => rel.virtual_image_id) || [];
            const { data: virtualImages, error: virtualImageError } = await supabase
              .from('virtual_image')
              .select('id, original_path, original_name, hash, virtual_name')
              .in('id', virtualImageIds);
            
            if (virtualImageError) {
              console.error('❌ Failed to query virtual images:', virtualImageError);
              throw virtualImageError;
            }
            
            // Create mapping from upload order to virtual image data
            jobRelationships?.forEach(rel => {
              const vimg = virtualImages?.find(vi => vi.id === rel.virtual_image_id);
              if (vimg && rel.upload_order !== null) {
                virtualImagesByOrder.set(rel.upload_order, vimg);
              }
            });
            
            console.log(`🔍 Found ${jobRelationships?.length || 0} job relationships for ML Kit update`);
            console.log(`🗺️ Created mapping for ${virtualImagesByOrder.size} virtual images by upload order`);
          }
          
          // DEBUG: Log first few mappings to understand the structure
          if (virtualImagesByOrder.size > 0) {
            console.log(`🔍 Sample virtual image mappings:`);
            for (let [order, vimg] of Array.from(virtualImagesByOrder.entries()).slice(0, 3)) {
              console.log(`  Order ${order}: ID=${vimg.id}, path=${vimg.original_path}`);
            }
          }
          
          // DEBUG: Log first few original URIs to compare
          console.log(`🔍 Sample original URIs (first 3):`);
          imageUris.slice(0, 3).forEach((uri, index) => {
            console.log(`  Index ${index}: ${uri}`);
          });
          
          // Update virtual_image table with ML Kit results for each processed image
          let updatedCount = 0;
          for (let i = 0; i < imageUris.length; i++) {
            const originalUri = imageUris[i];
            const analysis = mlKitResults.get(originalUri);
            
            if (!analysis) {
              console.warn(`⚠️ No ML Kit analysis found for ${originalUri}`);
              continue;
            }
            
            try {
              // Use upload order (image index) to find the corresponding virtual image
              const virtualImageRecord = virtualImagesByOrder.get(i);
              
              if (virtualImageRecord) {
                console.log(`🔗 Updating virtual image ${virtualImageRecord.id} at order ${i} with ML Kit data`);
                await mlKitInstance.updateImageWithAnalysis(virtualImageRecord.id, analysis, userId);
                updatedCount++;
                console.log(`✅ Updated ML Kit data: ${originalUri} → ${virtualImageRecord.id} (order: ${i})`);
              } else {
                console.warn(`⚠️ Could not find virtual_image record for upload order ${i} (${originalUri})`);
                console.log(`🗺️ Available upload orders: ${Array.from(virtualImagesByOrder.keys()).slice(0, 10).join(', ')}`);
                
                // DEBUG: Show what orders are actually available vs what we're looking for
                console.log(`🔍 Mapping debug: Looking for order ${i}, have orders: ${Array.from(virtualImagesByOrder.keys()).sort((a, b) => a - b).join(', ')}`);
              }
            } catch (updateError) {
              console.warn(`⚠️ Failed to update ML Kit data for ${originalUri}:`, updateError);
            }
          }
          
          console.log(`✅ Updated ${updatedCount}/${mlKitResults.size} images with ML Kit analysis`);
          
        } catch (mlKitUpdateError) {
          console.warn('⚠️ ML Kit database update failed:', mlKitUpdateError);
        }
      }

      const processingTime = Date.now() - startTime;

      return {
        jobId: `native_sequential_${Date.now()}`,
        totalImages: totalUploaded,
        nsfwDetected: results.totalNsfwDetected,
        results: results.allResults,
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.error('❌ Native-sequential processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.shouldThrottle = false;
      HardwareProfiler.stopMemoryMonitoring();
      
      // Cleanup
      this.compressionCache.clear();
      this.compressionQueue = [];
      this.uploadQueue = [];
      this.activeCompressions = 0;
      this.activeUploads = 0;
    }
  }

  /**
   * 🗜️ Fallback compression method (keeping for compatibility)
   */
  private static async compressImageIfNeeded(uri: string): Promise<string> {
    // Use native compression as primary method
    return this.compressImageNative(uri);
  }

  /**
   * Process images with NATIVE optimization (main entry point)
   */
  static async processBulkImages(
    imageUris: string[], 
    userId: string,
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<BulkProcessingResult> {
    return this.processBulkImagesNative(imageUris, userId, onProgress);
  }

  /**
   * Monitor all batch jobs for completion (FIXED - remove duplicate logging)
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
      throw error instanceof Error ? error : new Error('Unknown error during status check');
    }
  }

  /**
   * 📊 Get processing recommendations for user (ENHANCED)
   */
  static async getProcessingRecommendations(imageCount: number): Promise<{
    deviceTier: string;
    canProcessAll: boolean;
    recommendedBatchSize: number;
    estimatedTimeMinutes: number;
    compressionMethod: string;
    memoryWarning?: string;
    storageWarning?: string;
  }> {
    try {
      const profile = await HardwareProfiler.getHardwareProfile();
      const validation = await this.validateProcessingCapability(new Array(imageCount).fill('dummy'));
      
      // Native compression is much faster
      const timeEstimates = {
        low: imageCount * 0.2,     // 0.2 seconds per image (native)
        mid: imageCount * 0.15,    // 0.15 seconds per image (native)
        high: imageCount * 0.1,    // 0.1 seconds per image (native)
        flagship: imageCount * 0.05 // 0.05 seconds per image (native)
      };
      
      const maxBatchSizes = {
        low: 800,      // Increased with native processing
        mid: 2000,     // Increased with native processing
        high: 4000,    // Increased with native processing
        flagship: 8000 // Increased with native processing
      };
      
      return {
        deviceTier: profile.deviceTier,
        canProcessAll: validation.canProcess,
        recommendedBatchSize: Math.min(imageCount, maxBatchSizes[profile.deviceTier]),
        estimatedTimeMinutes: Math.ceil(timeEstimates[profile.deviceTier] / 60),
        compressionMethod: 'react-native-image-resizer (native)',
        memoryWarning: profile.availableMemoryMB < 2048 ? 'Low memory detected - processing may be slower' : undefined,
        storageWarning: profile.storageAvailableGB < 5 ? 'Low storage detected - consider freeing space' : undefined
      };
      
    } catch (error) {
      console.error('❌ Failed to get recommendations:', error);
      return {
        deviceTier: 'unknown',
        canProcessAll: false,
        recommendedBatchSize: 200,
        estimatedTimeMinutes: Math.ceil(imageCount * 0.3 / 60),
        compressionMethod: 'fallback',
        memoryWarning: 'Unable to detect device capabilities'
      };
    }
  }

  /**
   * 🔍 Validate processing capability before starting (ENHANCED)
   */
  private static async validateProcessingCapability(imageUris: string[]): Promise<{
    canProcess: boolean;
    reason?: string;
    recommendation?: string;
  }> {
    try {
      if (!this.hardwareProfile) {
        await this.initializeHardwareOptimization();
      }

      const { deviceTier, availableMemoryMB, storageAvailableGB } = this.hardwareProfile!;
      
      // Native processing uses less memory
      const estimatedMemoryMB = imageUris.length * 1; // Reduced from 2MB to 1MB per image
      if (estimatedMemoryMB > availableMemoryMB * 0.8) {
        return {
          canProcess: false,
          reason: `Insufficient memory. Need ~${estimatedMemoryMB}MB, have ${availableMemoryMB}MB`,
          recommendation: `Try processing ${Math.floor(availableMemoryMB * 0.8)} images at a time`
        };
      }
      
      // Check storage requirements
      const estimatedStorageGB = imageUris.length * 0.002; // 2MB per compressed image (native is more efficient)
      if (estimatedStorageGB > storageAvailableGB * 0.9) {
        return {
          canProcess: false,
          reason: `Insufficient storage. Need ~${estimatedStorageGB.toFixed(1)}GB, have ${storageAvailableGB.toFixed(1)}GB`,
          recommendation: 'Free up device storage or process fewer images'
        };
      }
      
      // Check reasonable limits based on device tier (increased for native)
      const maxImages = {
        low: 800,
        mid: 2000,
        high: 4000,
        flagship: 8000
      };
      
      if (imageUris.length > maxImages[deviceTier]) {
        return {
          canProcess: false,
          reason: `Too many images for ${deviceTier} device. Max recommended: ${maxImages[deviceTier]}`,
          recommendation: `Process in batches of ${maxImages[deviceTier]} images`
        };
      }
      
      return { canProcess: true };
      
    } catch (error) {
      return {
        canProcess: false,
        reason: 'Unable to validate system requirements',
        recommendation: 'Try processing a smaller batch first'
      };
    }
  }

  /**
   * Get user-friendly status messages (ENHANCED)
   */
  private static getStatusMessage(status: string, progress: number): string {
    switch (status) {
      case 'preparing':
        return 'Preparing NATIVE hardware-optimized processing...';
      case 'compressing':
        return 'NATIVE compression in progress (react-native-image-resizer)...';
      case 'uploading':
        return 'Parallel streaming upload to AWS S3...';
      case 'uploaded':
        return 'Images uploaded, starting analysis...';
      case 'processing':
        return `AWS analyzing all images... (${progress}%)`;
      case 'completed':
        return 'NATIVE hardware-optimized bulk analysis complete!';
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
   * Estimate memory requirements for batch processing (UPDATED FOR NATIVE)
   */
  static estimateMemoryRequirement(imageCount: number, avgImageSizeMB: number = 3): {
    totalSizeMB: number;
    batchCount: number;
    recommendedBatchSize: number;
  } {
    // Native processing is more memory efficient
    const totalSizeMB = imageCount * avgImageSizeMB * 1.1; // Reduced overhead
    const batchCount = Math.ceil(imageCount / this.currentSettings.batchSize);
    const maxBatchSizeMB = this.currentSettings.batchSize * avgImageSizeMB * 1.1;
    
    return {
      totalSizeMB,
      batchCount,
      recommendedBatchSize: this.currentSettings.batchSize
    };
  }

  /**
   * Validate if bulk processing is feasible (ENHANCED)
   */
  static async validateBulkProcessing(imageUris: string[]): Promise<{
    canProcess: boolean;
    reason?: string;
    recommendation?: string;
  }> {
    try {
      // Initialize hardware profile if not already done
      if (!this.hardwareProfile) {
        await this.initializeHardwareOptimization();
      }
      
      return this.validateProcessingCapability(imageUris);
      
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

  /**
   * 🧪 Run NATIVE performance test with sample images
   */
  static async runNativePerformanceTest(sampleImageUris: string[]): Promise<{
    compressionSpeed: number; // images per second
    uploadSpeed: number; // images per second
    memoryUsage: number; // MB
    recommendedSettings: ProcessingSettings;
    nativeSupported: boolean;
  }> {
    try {
  
      await this.initializeHardwareOptimization();
      
      // Test native compression speed
      const compressionStart = Date.now();
      const testBatch = sampleImageUris.slice(0, Math.min(5, sampleImageUris.length));
      
      let nativeSupported = true;
      try {
        for (const uri of testBatch) {
          await this.compressImageNative(uri);
        }
      } catch (error) {
        nativeSupported = false;
      }
      
      const compressionTime = Date.now() - compressionStart;
      const compressionSpeed = (testBatch.length / compressionTime) * 1000; // images per second
      
      // Get memory usage
      const memoryInfo = await HardwareProfiler.getMemoryInfo();
      
      // Generate optimized settings based on native test results
      const optimizedSettings: ProcessingSettings = {
        ...this.currentSettings,
        compressionWorkers: nativeSupported ? 
          (compressionSpeed > 3 ? 12 : compressionSpeed > 2 ? 8 : 6) : 4,
        uploadStreams: nativeSupported ? 
          (compressionSpeed > 2 ? 6 : 4) : 2,
        batchSize: nativeSupported ? 
          (memoryInfo.availableMemoryMB > 4000 ? 20 : memoryInfo.availableMemoryMB > 2000 ? 15 : 10) : 8
      };
      
      return {
        compressionSpeed,
        uploadSpeed: compressionSpeed * 0.9, // Native upload is more efficient
        memoryUsage: memoryInfo.totalMemoryMB - memoryInfo.availableMemoryMB,
        recommendedSettings: optimizedSettings,
        nativeSupported
      };
      
    } catch (error) {
      return {
        compressionSpeed: 1,
        uploadSpeed: 0.8,
        memoryUsage: 1000,
        recommendedSettings: this.currentSettings,
        nativeSupported: false
      };
    }
  }

  /**
   * 🔧 Update settings dynamically during processing
   */
  static updateProcessingSettings(newSettings: Partial<ProcessingSettings>): void {
    this.currentSettings = {
      ...this.currentSettings,
      ...newSettings
    };
    
    console.log('⚙️ Processing settings updated:', this.currentSettings);
  }

  /**
   * 📈 Get current processing statistics
   */
  static getProcessingStats(): {
    isProcessing: boolean;
    activeCompressions: number;
    activeUploads: number;
    cacheSize: number;
    queueSizes: {
      compression: number;
      upload: number;
    };
    currentSettings: ProcessingSettings;
  } {
    return {
      isProcessing: this.isProcessing,
      activeCompressions: this.activeCompressions,
      activeUploads: this.activeUploads,
      cacheSize: this.compressionCache.size,
      queueSizes: {
        compression: this.compressionQueue.length,
        upload: this.uploadQueue.length
      },
      currentSettings: this.currentSettings
    };
  }

  /**
   * Finalize upload session - mark as ready for processing
   */
  private static async finalizeUploadSession(jobId: string): Promise<void> {
    try {
      // FIXED: Use the existing supabase client, not Deno imports
      const { error } = await supabase
        .from('nsfw_bulk_jobs')
        .update({
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      
     
    } catch (error) {
      console.error('❌ Error finalizing upload session:', error);
    }
  }

  /**
   * Get current success rate
   */
  private static getSuccessRate(): number {
    if (this.uploadStats.totalUploads === 0) return 1.0;
    return this.uploadStats.successCount / this.uploadStats.totalUploads;
  }

  /**
   * Get current error rate
   */
  private static getErrorRate(): number {
    if (this.uploadStats.totalUploads === 0) return 0.0;
    return this.uploadStats.errorCount / this.uploadStats.totalUploads;
  }

  /**
   * Update upload statistics with warmup period consideration
   */
  private static updateUploadStats(success: boolean, timeMs: number, batchSize?: number): void {
    this.uploadStats.totalUploads++;
    
    // Track batch size if provided
    if (batchSize !== undefined) {
      this.uploadStats.batchSizes.push(batchSize);
      this.uploadStats.recentBatchSizes.push(batchSize);
      
      // Keep only recent 10 batch sizes for analysis
      if (this.uploadStats.recentBatchSizes.length > 10) {
        this.uploadStats.recentBatchSizes.shift();
      }
    }
    
    // Skip the first upload from average calculation to handle connection warmup
    if (this.uploadStats.totalUploads === 1) {
      console.log(`🔥 First batch warmup: ${timeMs}ms (excluding from performance metrics)`);
    } else {
      this.uploadStats.totalTimeMs += timeMs;
      // Calculate average excluding the first upload
      this.uploadStats.averageTimeMs = this.uploadStats.totalTimeMs / (this.uploadStats.totalUploads - 1);
    }
    
    if (success) {
      this.uploadStats.successCount++;
    } else {
      this.uploadStats.errorCount++;
    }
  }

  /**
   * 🎯 Dynamic performance adjustment based on real-time metrics
   */
  private static adjustSettingsBasedOnPerformance(): void {
    // Skip adjustments during warmup period (first 2 uploads)
    if (this.uploadStats.totalUploads <= 2) {
      console.log('🔄 Skipping performance adjustment during warmup period');
      return;
    }
    
    // OPTIMIZATION: Detect if recent uploads were small batches (≤3 images) and adjust metrics accordingly
    const recentBatchSizes = this.uploadStats.recentBatchSizes.slice(-3); // Last 3 batches
    const hasSmallBatches = recentBatchSizes.some(size => size <= 3);
    const avgRecentBatchSize = recentBatchSizes.reduce((a, b) => a + b, 0) / recentBatchSizes.length || 1;
    
    // Adjust upload time expectations for small batches (they have higher overhead per image)
    let adjustedUploadTime = this.uploadStats.averageTimeMs || 8000;
    if (hasSmallBatches && avgRecentBatchSize < 4) {
      adjustedUploadTime = adjustedUploadTime * 0.7; // Small batches expected to have higher per-batch overhead
      console.log(`🔧 Adjusting performance metrics for small batches (avg: ${avgRecentBatchSize.toFixed(1)} images)`);
    }
    
    const metrics: PerformanceMetrics = {
      compressionTimeMs: this.compressionStats.averageTimeMs,
      uploadTimeMs: adjustedUploadTime,
      memoryUsageRatio: this.compressionCache.size / this.currentSettings.cacheSize,
      successRate: this.getSuccessRate(),
      errorRate: this.getErrorRate()
    };
    
    const newSettings = DynamicPerformanceAdjuster.adjustSettings(
      {
        compressionWorkers: this.currentSettings.compressionWorkers,
        batchSize: this.currentSettings.batchSize,
        uploadConcurrency: this.currentSettings.uploadStreams,
        cacheSize: this.currentSettings.cacheSize,
        retryAttempts: 3 // Default retry attempts
      },
      metrics
    );
    
    // Check if settings changed
    const settingsChanged = (
      newSettings.compressionWorkers !== this.currentSettings.compressionWorkers ||
      newSettings.batchSize !== this.currentSettings.batchSize ||
      newSettings.uploadConcurrency !== this.currentSettings.uploadStreams
    );
    
    if (settingsChanged) {
      console.log('🎯 Performance adjustment:', {
        old: {
          workers: this.currentSettings.compressionWorkers,
          batchSize: this.currentSettings.batchSize,
          uploads: this.currentSettings.uploadStreams
        },
        new: {
          workers: newSettings.compressionWorkers,
          batchSize: newSettings.batchSize,
          uploads: newSettings.uploadConcurrency
        },
        metrics: {
          compression: `${metrics.compressionTimeMs.toFixed(0)}ms`,
          upload: `${metrics.uploadTimeMs.toFixed(0)}ms`,
          memory: `${(metrics.memoryUsageRatio * 100).toFixed(1)}%`,
          success: `${(metrics.successRate * 100).toFixed(1)}%`
        }
      });
      
      // Apply new settings
      this.currentSettings.compressionWorkers = newSettings.compressionWorkers;
      this.currentSettings.batchSize = newSettings.batchSize;
      this.currentSettings.uploadStreams = newSettings.uploadConcurrency;
    }
    
    // Log optimization recommendations if any
    const recommendations = DynamicPerformanceAdjuster.getOptimizationRecommendations(metrics);
    if (recommendations.length > 0) {
      console.log('💡 Performance recommendations:', recommendations);
    }
  }
}
