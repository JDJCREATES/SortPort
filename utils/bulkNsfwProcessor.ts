import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import ImageResizer from 'react-native-image-resizer';
import { HardwareProfiler, HardwareProfile, ProcessingSettings } from './hardwareProfiler';

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
  
  // 🚀 AGGRESSIVE SETTINGS for native processing
  private static currentSettings: ProcessingSettings = {
    compressionWorkers: 8,        // More workers with native
    uploadStreams: 4,             // More parallel uploads
    batchSize: 15,                // Larger batches
    compressionQuality: 0.7,      // Higher quality (native is faster)
    maxImageSize: 512,           // Larger size (native handles it)
    cacheSize: 100,               // Larger cache
    enableAggressive: true,       // Enable aggressive mode
    memoryWarningThreshold: 1536
  };
  
  private static hardwareProfile: HardwareProfile | null = null;
  private static isProcessing = false;
  private static shouldThrottle = false;
  
  // Enhanced caching and queuing
  private static compressionCache = new Map<string, string>();
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

  /**
   * 🔍 Initialize with hardware-optimized settings
   */
  private static async initializeHardwareOptimization(): Promise<void> {
    try {
      console.log('🔍 Initializing NATIVE hardware optimization...');
      
      this.hardwareProfile = await HardwareProfiler.getHardwareProfile();
      
      // Override with more aggressive settings for native processing
      this.currentSettings = {
        ...this.hardwareProfile.recommendedSettings,
        compressionWorkers: Math.min(12, this.hardwareProfile.recommendedSettings.compressionWorkers * 2),
        uploadStreams: Math.min(6, this.hardwareProfile.recommendedSettings.uploadStreams * 2),
        batchSize: Math.min(20, this.hardwareProfile.recommendedSettings.batchSize * 1.5),
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
   * ⚠️ Handle memory warnings by throttling processing
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
        cacheSize: Math.max(20, Math.floor(this.currentSettings.cacheSize / 3))
      };
      
      // Clear cache to free memory
      this.clearOldCache();
      
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
   * 🧹 Clear old cache entries
   */
  private static clearOldCache(): void {
    if (this.compressionCache.size > this.currentSettings.cacheSize) {
      const keysToDelete = Array.from(this.compressionCache.keys())
        .slice(0, this.compressionCache.size - this.currentSettings.cacheSize);
      keysToDelete.forEach(key => this.compressionCache.delete(key));
      console.log(`🧹 Cleared ${keysToDelete.length} cache entries`);
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
   * 🚀 NATIVE: Ultra-fast image compression using react-native-image-resizer
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

      console.log(`🗜️ NATIVE compressing: ${uri}`);
      
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

      console.log(`⚡ NATIVE compressed: ${uri} → ${result.uri} (${processingTime}ms, avg: ${this.compressionStats.averageTimeMs.toFixed(0)}ms)`);
      
      return result.uri;
      
    } catch (error) {
      console.warn('⚠️ Native compression failed, using original:', error);
      return uri;
    }
  }

  /**
   * 🚀 PARALLEL: Streaming compression with native processing
   */
  private static async startNativeCompressionStream(
    imageUris: string[],
    onProgress?: (compressed: number, total: number) => void
  ): Promise<void> {
    console.log(`🔥 Starting NATIVE compression stream for ${imageUris.length} images`);
    
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
        if (this.compressionCache.size > this.currentSettings.cacheSize) {
          this.clearOldCache();
        }
        
        onComplete();
        
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
    
    console.log(`✅ Native worker ${workerId} completed`);
  }

  /**
   * 🚀 PARALLEL: Enhanced upload stream with larger batches
   */
  private static async startEnhancedUploadStream(
    imageUris: string[],
    userId: string,
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<{ jobIds: string[], bucketNames: string[], totalUploaded: number }> {
    console.log(`🔥 Starting ENHANCED upload stream for ${imageUris.length} images`);
    
    const allJobIds: string[] = [];
    const allBucketNames: string[] = [];
    let totalUploaded = 0;
    let uploadedBatches = 0;
    
    // Create larger batches for better efficiency
    const batches: string[][] = [];
    for (let i = 0; i < imageUris.length; i += this.currentSettings.batchSize) {
      batches.push(imageUris.slice(i, i + this.currentSettings.batchSize));
    }
    
    this.uploadQueue = batches.map((batch, index) => ({ batch, index }));
    
    console.log(`📦 Created ${batches.length} batches of ${this.currentSettings.batchSize} images each`);
    
    // Start multiple upload streams
    const uploadStreams = Array.from({ length: this.currentSettings.uploadStreams }, (_, i) =>
      this.enhancedUploadWorker(i, userId, (result) => {
        allJobIds.push(result.jobId);
        allBucketNames.push(result.bucketName);
        totalUploaded += result.uploadedCount;
        uploadedBatches++;
        
        if (onProgress) {
          onProgress(uploadedBatches, batches.length);
        }
      })
    );
    
    await Promise.all(uploadStreams);
    
    return { jobIds: allJobIds, bucketNames: allBucketNames, totalUploaded };
  }

  /**
   * 🔥 Enhanced upload worker with better error handling
   */
  private static async enhancedUploadWorker(
    workerId: number,
    userId: string,
    onComplete: (result: { jobId: string, bucketName: string, uploadedCount: number }) => void
  ): Promise<void> {
    console.log(`🚀 Enhanced upload worker ${workerId} started`);
    
    while (this.uploadQueue.length > 0 && this.isProcessing) {
      // Dynamic throttling check
      if (this.shouldThrottle && this.activeUploads >= this.currentSettings.uploadStreams) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      const queueItem = this.uploadQueue.shift();
      if (!queueItem) break;
      
      const { batch, index } = queueItem;
      
      // Wait for compression to be ready for this batch
      await this.waitForCompressionReady(batch);
      
      this.activeUploads++;
      
      try {
        // Get compressed URIs
        const compressedBatch = batch.map(uri => this.compressionCache.get(uri) || uri);
        
        console.log(`🚀 Worker ${workerId} uploading batch ${index + 1} (${compressedBatch.length} images)`);
        
        const result = await this.uploadBatchWithRetry(compressedBatch, userId, index);
        onComplete(result);
        
      } catch (error) {
        console.error(`❌ Worker ${workerId} upload failed for batch ${index + 1}:`, error);
        // Don't fail completely - continue with other batches
      } finally {
        this.activeUploads--;
      }
      
      // Minimal delay for enhanced processing
      const delay = this.shouldThrottle ? 1000 : 50;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log(`✅ Enhanced upload worker ${workerId} completed`);
  }

  /**
   * 🔥 Wait for batch compression to be ready (optimized)
   */
  private static async waitForCompressionReady(batch: string[]): Promise<void> {
    const maxWait = 45000; // 45 seconds max wait (increased for larger batches)
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const readyCount = batch.filter(uri => this.compressionCache.has(uri)).length;
      
      // Allow partial batch processing if most images are ready
      if (readyCount >= batch.length * 0.8) {
        console.log(`⚡ Batch 80% ready (${readyCount}/${batch.length}), proceeding...`);
        return;
      }
      
      if (readyCount === batch.length) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 50)); // Faster polling
    }
    
    console.warn('⚠️ Compression timeout, proceeding with available images');
  }

  /**
   * Upload a single batch with retry logic and timeout (SAME AS BEFORE - no changes to data flow)
   */
  private static async uploadBatchWithRetry(
    batchUris: string[],
    userId: string,
    batchIndex: number,
    retryCount = 0
  ): Promise<{ jobId: string; bucketName: string; uploadedCount: number }> {
    const maxRetries = 3; // Increased retries
    
    try {
      console.log(`📤 Uploading batch ${batchIndex + 1} (${batchUris.length} images) - Attempt ${retryCount + 1}`);
      
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('batchIndex', batchIndex.toString());
      formData.append('totalImages', batchUris.length.toString());

      let successfulImages = 0;
      for (let i = 0; i < batchUris.length; i++) {
        const compressedUri = batchUris[i]; // Already compressed by native worker
        try {
          console.log(`📷 Processing image ${i + 1}/${batchUris.length} in batch ${batchIndex + 1}`);
          
          // SAME DATA FLOW - just using pre-compressed URIs
          const fileObject = {
            uri: compressedUri,
            type: 'image/jpeg',
            name: `image_${i}.jpg`,
          };
          
          (formData as any).append(`image_${i}`, fileObject);
          successfulImages++;
          
          console.log(`✅ Image ${i + 1} added to FormData with URI: ${compressedUri}`);
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
   * 🚀 ULTIMATE NATIVE PERFORMANCE: Parallel streaming pipeline with native compression
   */
  static async processBulkImagesNative(
    imageUris: string[],
    userId: string,
    onProgress?: (progress: BulkProcessingProgress) => void
  ): Promise<BulkProcessingResult> {
    const startTime = Date.now();
    this.isProcessing = true;
    
    try {
      // Initialize hardware optimization
      await this.initializeHardwareOptimization();
      
      console.log(`🚀🚀🚀 NATIVE ULTRA-FAST processing for ${imageUris.length} images`);
      console.log(`⚡ Using ${this.currentSettings.compressionWorkers} native workers, ${this.currentSettings.uploadStreams} upload streams, ${this.currentSettings.batchSize} batch size`);
      
      // Clear caches and reset stats
      this.compressionCache.clear();
      this.compressionStats = { totalProcessed: 0, totalTimeMs: 0, averageTimeMs: 0 };
      
      if (onProgress) {
        onProgress({
          current: 0,
          total: 100,
          status: 'preparing',
          message: `🚀 Initializing NATIVE pipeline for ${imageUris.length} images...`
        });
      }

      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // 🔥 PHASE 1: Start NATIVE compression stream immediately
      let compressionProgress = 0;
      const compressionPromise = this.startNativeCompressionStream(
        imageUris,
        (compressed, total) => {
          compressionProgress = Math.round((compressed / total) * 30); // 0-30% for compression
          if (onProgress) {
            onProgress({
              current: compressionProgress,
              total: 100,
              status: 'compressing',
              message: `⚡ NATIVE compressed ${compressed}/${total} images (${this.currentSettings.compressionWorkers} workers, avg: ${this.compressionStats.averageTimeMs.toFixed(0)}ms)`
            });
          }
        }
      );

      // 🔥 PHASE 2: Start enhanced upload stream with shorter delay
      await new Promise(resolve => setTimeout(resolve, 1000)); // Just 1 second head start
      
      let uploadProgress = 0;
      const uploadPromise = this.startEnhancedUploadStream(
        imageUris,
        userId,
        (uploaded, total) => {
          uploadProgress = 30 + Math.round((uploaded / total) * 40); // 30-70% for upload
          if (onProgress) {
            onProgress({
              current: uploadProgress,
              total: 100,
              status: 'uploading',
              message: `🚀 Uploaded ${uploaded}/${total} batches (${this.currentSettings.uploadStreams} streams, ${this.currentSettings.batchSize} per batch)`
            });
          }
        }
      );

      // Wait for both streams to complete
      const [, uploadResults] = await Promise.all([compressionPromise, uploadPromise]);
      
      const { jobIds, bucketNames, totalUploaded } = uploadResults;

      if (jobIds.length === 0) {
        throw new Error('All uploads failed');
      }

      console.log(`🚀 NATIVE stream processing complete: ${jobIds.length} batches, ${totalUploaded} images`);
      console.log(`📊 Compression stats: ${this.compressionStats.totalProcessed} images, avg ${this.compressionStats.averageTimeMs.toFixed(0)}ms per image`);

      // 🔥 PHASE 3: Parallel submission (SAME AS BEFORE)
      if (onProgress) {
        onProgress({
          current: 75,
          total: 100,
          status: 'submitting',
          message: `⚡ Submitting ${jobIds.length} batches for AWS analysis...`
        });
      }

      // Submit all batches in parallel
      const submitPromises = jobIds.map(async (jobId, index) => {
        try {
          const { data, error } = await supabase.functions.invoke('bulk-nsfw-submit', {
            body: {
              jobId,
              bucketName: bucketNames[index],
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

      console.log(`⚡ Submitted ${successfulSubmits.length} batches for processing`);

      if (onProgress) {
        onProgress({
          current: 80,
          total: 100,
          status: 'processing',
          message: `🔥 AWS processing ${successfulSubmits.length} batches...`
        });
      }

      // Monitor all jobs (SAME AS BEFORE)
      const results = await this.monitorAllJobs(
        successfulSubmits.map(submit => submit.jobId),
        onProgress
      );

      const processingTime = Date.now() - startTime;

      return {
        jobId: `native_optimized_${Date.now()}`,
        totalImages: totalUploaded,
        nsfwDetected: results.totalNsfwDetected,
        results: results.allResults,
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.error('❌ Native-optimized processing failed:', error);
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
   * Monitor all batch jobs for completion (SAME AS BEFORE)
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
      console.log('🧪 Running NATIVE performance test...');
      
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
        console.warn('⚠️ Native compression not supported, falling back');
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
      console.error('❌ Native performance test failed:', error);
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
}
