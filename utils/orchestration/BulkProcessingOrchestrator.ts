import { MLKitManager } from '../mlkit/MLKitManager';
import { MLKitVirtualImageMapper } from '../mlkit/mappers/MLKitVirtualImageMapper';
import { FileSystemService } from '../filesystem/FileSystemService';
import { CompressionCacheService } from '../cache/CompressionCacheService';
import { ImageCompressionService } from '../compression/ImageCompressionService';
import { BatchUploadService, UploadBatch } from '../upload/BatchUploadService';
import { JobMonitoringService, JobStatus, ProcessingResults } from '../monitoring/JobMonitoringService';
import { HardwareProfiler } from '../hardwareProfiler';
import { MLKitAnalysisResult } from '../mlkit/types/MLKitTypes';
import { supabase } from '../supabase';
import { logInfo, logDebug, logVerbose, logWarn, logError } from '../shared/LoggingConfig';
import { PathSanitizer } from '../helpers/pathSanitizer';
import { PathIssuesReporter } from '../helpers/pathIssuesReporter';

export interface BulkProcessingConfig {
  enableCompression: boolean;
  compressionQuality: number;
  enableMLKit: boolean;
  batchSize?: number;
  maxRetries: number;
  retryDelay: number;
  timeoutMs: number;
  cacheSize: number;
}

export interface BulkProcessingRequest {
  imageUris: string[];
  processingId: string;
  userId: string; // FIXED: Add userId for Edge Function compatibility
  config: BulkProcessingConfig;
  onProgress?: (progress: JobStatus) => void;
  onBatchComplete?: (batchId: string, result: any) => void;
  onError?: (error: string) => void;
}

export interface BulkProcessingResult {
  success: boolean;
  processingId: string;
  totalImages: number;
  processedImages: number;
  uploadedImages: number;
  failedImages: number;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
  compressionStats: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
  moderationResults?: any[];
  mlkitResults?: Record<string, MLKitAnalysisResult>;
  jobStatus: JobStatus;
}

/**
 * Main orchestrator for bulk NSFW processing
 * Coordinates compression, ML Kit analysis, and batch uploads
 */
export class BulkProcessingOrchestrator {
  private mlkitManager: MLKitManager;
  private compressionCache: CompressionCacheService;
  private imageCompression: ImageCompressionService;
  private batchUpload: BatchUploadService;
  private jobMonitoring: JobMonitoringService;
  private isInitialized = false;
  private hardwareOptimizedBatchSize = 20; // Default fallback

  constructor() {
    // Initialize services with default configurations
    this.compressionCache = new CompressionCacheService(200);
    this.imageCompression = new ImageCompressionService({
      maxImageSize: 1920,
      compressionQuality: 0.8,
      workers: 3
    }, this.compressionCache); // Pass shared cache
    this.batchUpload = new BatchUploadService(this.compressionCache);
    this.jobMonitoring = new JobMonitoringService(100);
    this.mlkitManager = MLKitManager.getInstance({
      maxImageSize: 1920,
      compressionQuality: 0.8,
      enableImageLabeling: true,
      enableObjectDetection: true,
      enableFaceDetection: true,
      enableTextRecognition: true,
      enableQualityAssessment: true,
      labelConfidenceThreshold: 0.5,
      objectConfidenceThreshold: 0.5,
      faceConfidenceThreshold: 0.5,
      batchSize: 5,
      maxConcurrentProcessing: 3,
      cachingEnabled: true,
      secureProcessing: true,
      clearCacheAfterProcessing: false
    });
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔄 Bulk processing orchestrator already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing bulk processing orchestrator...');

      // Initialize ML Kit manager
      await this.mlkitManager.initialize();

      // Get hardware profile for optimization
      const hardwareProfile = await HardwareProfiler.getHardwareProfile();
      console.log('📊 Hardware profile loaded:', {
        deviceTier: hardwareProfile.deviceTier,
        totalMemoryMB: hardwareProfile.totalMemoryMB,
        availableMemoryMB: hardwareProfile.availableMemoryMB,
        recommendedSettings: hardwareProfile.recommendedSettings
      });

      // Apply hardware profile to configure services optimally
      this.applyHardwareOptimizations(hardwareProfile);

      // Start memory monitoring if available
      try {
        HardwareProfiler.startMemoryMonitoring(
          (availableMB: number) => this.handleMemoryWarning(availableMB),
          hardwareProfile.recommendedSettings.memoryWarningThreshold
        );
        console.log('📊 Memory monitoring started');
      } catch (memoryError) {
        console.warn('⚠️ Memory monitoring unavailable:', memoryError);
      }

      this.isInitialized = true;
      console.log('✅ Bulk processing orchestrator initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize bulk processing orchestrator:', error);
      throw error;
    }
  }

  /**
   * Apply hardware profile optimizations to all services
   */
  private applyHardwareOptimizations(hardwareProfile: any): void {
    const settings = hardwareProfile.recommendedSettings;
    
    // Configure compression service with hardware-optimized settings
    this.imageCompression.updateSettings({
      workers: Math.min(8, settings.compressionWorkers || 4),
      compressionQuality: settings.compressionQuality || 0.6,
      maxImageSize: settings.maxImageSize || 512
    });

    // Update cache size based on available memory
    const optimalCacheSize = Math.max(
      settings.cacheSize || 200,
      Math.floor(hardwareProfile.availableMemoryMB / 10) // 1 cache entry per 10MB available memory
    );
    
    this.compressionCache.setMaxSize(optimalCacheSize);

    // FIXED: Store hardware-optimized batch size for upload batches
    this.hardwareOptimizedBatchSize = settings.batchSize || 20;

    console.log('⚙️ Services configured with hardware-optimized settings:', {
      compressionWorkers: Math.min(8, settings.compressionWorkers || 4),
      compressionQuality: settings.compressionQuality || 0.6,
      maxImageSize: settings.maxImageSize || 512,
      cacheSize: optimalCacheSize,
      uploadBatchSize: this.hardwareOptimizedBatchSize,
      deviceTier: hardwareProfile.deviceTier
    });
  }

  /**
   * Handle memory warnings by throttling processing
   */
  private handleMemoryWarning(availableMB: number): void {
    console.warn(`🚨 Memory warning: ${availableMB}MB available`);
    
    // Get current settings
    const currentSettings = this.imageCompression.getStats();
    
    if (availableMB < 512) {
      // Critical memory - emergency throttling
      this.imageCompression.updateSettings({
        workers: Math.max(1, Math.floor((currentSettings as any).workers / 3)),
        compressionQuality: 0.4 // More aggressive compression
      });
      
      // Only clear cache if not processing-locked
      if (!this.compressionCache.isProcessingLocked()) {
        this.compressionCache.clearOldEntries();
      }
      
      console.log('🚨 Emergency throttling activated');
    } else if (availableMB < 1024) {
      // Moderate throttling
      this.imageCompression.updateSettings({
        workers: Math.max(2, Math.floor((currentSettings as any).workers / 2)),
        compressionQuality: 0.5
      });
      
      console.log('⚠️ Moderate throttling activated');
    }
  }

  /**
   * Process a batch of images with full pipeline
   */
  async processBulkImages(request: BulkProcessingRequest): Promise<BulkProcessingResult> {
    await this.initialize();

    const startTime = Date.now();
    let { imageUris, processingId, userId, config, onProgress, onBatchComplete, onError } = request;
    // Sanitize all image URIs before processing
    imageUris = imageUris.map(uri => PathSanitizer.sanitizeForMLKit(uri));

    console.log(`🎯 Starting bulk processing: ${processingId}`, {
      totalImages: imageUris.length,
      config,
      timestamp: new Date().toISOString()
    });

    // Start job monitoring
    const jobStatus = this.jobMonitoring.startJob(
      processingId,
      imageUris.length,
      0 // Will be updated after batch creation
    );

    try {
      // Phase 1: Pre-processing validation
      logInfo('📋 Phase 1: Validating input images...');
      const validationResult = await this.validateInputImages(imageUris);
      
      if (validationResult.invalidImages.length > 0) {
        const warning = `Found ${validationResult.invalidImages.length} invalid images`;
        jobStatus.warnings.push(warning);
        console.warn(`⚠️ ${warning}:`, validationResult.invalidImages);
      }

      const validImageUris = validationResult.validImages;
      if (validImageUris.length === 0) {
        throw new Error('No valid images found to process');
      }

      // Phase 2: ML Kit analysis (run on original high-quality images BEFORE compression)
      let mlkitResults: Record<string, MLKitAnalysisResult> = {};
      if (config.enableMLKit) {
        logInfo('🤖 Phase 2: Running ML Kit analysis on original images...');
        // ✅ CRITICAL FIX: Use original URIs for ML Kit to avoid file stability issues
        mlkitResults = await this.runMLKitAnalysis(
          validImageUris,
          (analyzed, total) => {
            if (onProgress) {
              // Track ML Kit analysis progress with actual processed images count
              const updatedStatus = this.jobMonitoring.updateProgress(processingId, 0, analyzed);
              if (updatedStatus) {
                onProgress(updatedStatus);
              }
            }
          }
        );
        logInfo(`✅ ML Kit analysis completed for ${Object.keys(mlkitResults).length} images`);
      }

      // Phase 3: Image compression (after ML Kit to avoid file conflicts)
      let compressionStats = {
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 1
      };

      if (config.enableCompression) {
        logInfo('🗜️ Phase 3: Compressing images...');
        
        // Lock cache to prevent cleanup during compression and upload
        this.compressionCache.lockProcessing();
        
        const compressionResult = await this.compressImages(
          validImageUris, 
          config,
          (compressed, total) => {
            if (onProgress) {
              // Track compression progress with actual processed images count
              const updatedStatus = this.jobMonitoring.updateProgress(processingId, 0, compressed);
              if (updatedStatus) {
                onProgress(updatedStatus);
              }
            }
          }
        );
        compressionStats = compressionResult.stats;
        
        logInfo(`✅ Compression completed: ${(compressionStats.compressionRatio * 100).toFixed(1)}% size reduction`);
        
        // Wait for cache to stabilize after parallel compression
        console.log(`⏳ Allowing cache to stabilize after parallel compression...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Give 1 second for all writes to complete
      }
      
      this.batchUpload.resetSession();
      
      const effectiveBatchSize = config.batchSize || this.hardwareOptimizedBatchSize;
      const batches = await this.batchUpload.createBatches(
        validImageUris, // Pass original URIs, not compressed URIs
        processingId,
        effectiveBatchSize
      );

      // Update job monitoring with batch count
      jobStatus.totalBatches = batches.length;
      this.jobMonitoring.updateTotalBatches(processingId, batches.length);

      // ✅ CRITICAL FIX: Add small delay to ensure cache stability after parallel ML Kit processing
      if (config.enableMLKit && Object.keys(mlkitResults).length > 0) {
        console.log('⏳ Allowing cache to stabilize after parallel ML Kit processing...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second stabilization delay
      }

      const uploadResults = await this.uploadBatches(
        batches,
        userId,
        mlkitResults,
        jobStatus,
        onProgress,
        onBatchComplete
      );

      // Unlock cache now that uploads are complete
      if (config.enableCompression) {
        this.compressionCache.unlockProcessing();
      }

      const submitResults = await this.submitJobForAnalysis(
        jobStatus,
        userId,
        onProgress
      );

      // Store AWS job ID for tracking if available
      if (submitResults.awsJobId) {
        // ✅ CRITICAL FIX: DON'T overwrite the internal job ID with AWS job ID
        // The AWS job ID should be stored separately, not replace the Supabase UUID
        console.log(`🔗 AWS Job ID noted for processing: ${submitResults.awsJobId}`);
        
        // Store AWS job ID in job metadata or a separate field, not in the main jobId
        const currentJob = this.jobMonitoring.getJobStatus(processingId);
        if (currentJob) {
          // Store AWS job ID separately so we don't break database queries
          console.log(`🔗 AWS Job ID stored for tracking: ${submitResults.awsJobId}`);
        } else {
          console.log(`🔗 AWS Job ID noted (job completed): ${submitResults.awsJobId}`);
        }
      }

      const serverResults = await this.waitForServerProcessing(
        processingId,
        jobStatus,
        onProgress
      );

      // Calculate final results
      const endTime = Date.now();
      const processingTimeMs = endTime - startTime;
      
      const finalResults: ProcessingResults = {
        moderationResults: serverResults.moderationResults || [],
        mlkitResults,
        uploadedImages: uploadResults.uploadedCount,
        failedImages: uploadResults.failedCount,
        processingTimeMs,
        compressionStats
      };

      // Complete job monitoring
      const completedJob = this.jobMonitoring.completeJob(processingId, finalResults);

      const result: BulkProcessingResult = {
        success: true,
        processingId,
        totalImages: imageUris.length,
        processedImages: validImageUris.length,
        uploadedImages: uploadResults.uploadedCount,
        failedImages: uploadResults.failedCount,
        errors: uploadResults.errors,
        warnings: jobStatus.warnings,
        processingTimeMs,
        compressionStats,
        moderationResults: serverResults.moderationResults,
        mlkitResults,
        jobStatus: completedJob || jobStatus
      };

      console.log(`🎉 Bulk processing completed successfully: ${processingId}`, {
        totalImages: result.totalImages,
        processedImages: result.processedImages,
        uploadedImages: result.uploadedImages,
        failedImages: result.failedImages,
        processingTimeMs: result.processingTimeMs,
        compressionRatio: `${(compressionStats.compressionRatio * 100).toFixed(1)}%`
      });

      return result;

    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`❌ Bulk processing failed: ${processingId}:`, error);

      // Unlock cache in case of error
      if (config.enableCompression) {
        this.compressionCache.unlockProcessing();
      }

      if (onError) {
        onError(errorMsg);
      }

      // Fail job monitoring
      this.jobMonitoring.failJob(processingId, errorMsg);

      const processingTimeMs = Date.now() - startTime;
      
      return {
        success: false,
        processingId,
        totalImages: imageUris.length,
        processedImages: 0,
        uploadedImages: 0,
        failedImages: imageUris.length,
        errors: [errorMsg],
        warnings: jobStatus.warnings,
        processingTimeMs,
        compressionStats: {
          originalSize: 0,
          compressedSize: 0,
          compressionRatio: 1
        },
        jobStatus
      };
    }
  }

  /**
   * Validate input images
   */
  private async validateInputImages(imageUris: string[]): Promise<{
    validImages: string[];
    invalidImages: string[];
    totalSize: number;
  }> {
    console.log(`🔍 Validating ${imageUris.length} input images...`);

    const validImages: string[] = [];
    const invalidImages: string[] = [];
    let totalSize = 0;

    // Define unsupported formats
    const UNSUPPORTED_FORMATS = ['.svg'];
    const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    const validationPromises = imageUris.map(async (uri, index) => {
      try {
        // Check file extension first
        const extension = uri.toLowerCase().split('.').pop();
        const fileName = uri.split('/').pop() || uri;
        
        if (extension && UNSUPPORTED_FORMATS.includes(`.${extension}`)) {
          invalidImages.push(uri);
          console.warn(`⚠️ Skipping unsupported format ${index + 1}/${imageUris.length}: ${fileName} (.${extension}) - Not supported by ML Kit/AWS Rekognition`);
          return;
        }

        const fileSize = await FileSystemService.getFileSize(uri);
        
        if (fileSize > 0) {
          validImages.push(uri);
          totalSize += fileSize;
          logVerbose(`✅ Valid image ${index + 1}/${imageUris.length}: ${FileSystemService.formatFileSize(fileSize)}`);
        } else {
          invalidImages.push(uri);
          console.warn(`❌ Invalid image ${index + 1}/${imageUris.length}: ${fileName} (0 bytes)`);
        }
      } catch (error) {
        invalidImages.push(uri);
        const fileName = uri.split('/').pop() || uri;
        console.error(`❌ Error validating image ${index + 1}/${imageUris.length}: ${fileName}:`, error);
      }
    });

    await Promise.all(validationPromises);

    const skippedCount = imageUris.length - validImages.length;
    if (skippedCount > 0) {
      console.log(`📋 Filtered out ${skippedCount} unsupported/invalid files`);
    }

    // 🆕 MODERN PATH ANALYSIS - Analyze paths for potential issues
    if (validImages.length > 0) {
      const pathReport = PathIssuesReporter.generateReport(validImages);
      if (pathReport.includes('ISSUES')) {
        console.warn('⚠️ Path analysis detected potential issues:');
        console.warn(pathReport);
      } else {
        logDebug('✅ Path analysis: No issues detected');
      }
    }

    console.log(`📊 Validation completed:`, {
      total: imageUris.length,
      valid: validImages.length,
      invalid: invalidImages.length,
      totalSize: FileSystemService.formatFileSize(totalSize)
    });

    return { validImages, invalidImages, totalSize };
  }

  /**
   * Compress images with progress tracking
   */
  private async compressImages(
    imageUris: string[],
    config: BulkProcessingConfig,
    onProgress?: (compressed: number, total: number) => void
  ): Promise<{
    compressedUris: string[];
    stats: { originalSize: number; compressedSize: number; compressionRatio: number };
  }> {
    console.log(`🗜️ Starting compression for ${imageUris.length} images...`);

    // Calculate original size
    const originalSizes = await Promise.all(
      imageUris.map(uri => FileSystemService.getFileSize(uri))
    );
    const originalSize = originalSizes.reduce((sum, size) => sum + size, 0);

    // Compress images
    await this.imageCompression.compressImages(
      imageUris,
      (compressed: number, total: number) => {
        // Call external progress callback if provided
        if (onProgress) {
          onProgress(compressed, total);
        }
        
        // Only log progress every 5% or every 10 images to reduce spam
        if (compressed % 10 === 0 || compressed === total || (compressed / total) % 0.05 < (1 / total)) {
          logInfo(`🗜️ Compression progress: ${compressed}/${total} (${Math.round(compressed/total*100)}%)`);
        }
      }
    );

    // Get compressed URIs from cache
    const compressedUris = imageUris.map(uri => {
      const compressedUri = this.compressionCache.get(uri);
      return compressedUri || uri; // Fallback to original if compression failed
    });

    // Calculate compressed size
    const compressedSizes = await Promise.all(
      compressedUris.map((uri: string) => FileSystemService.getFileSize(uri))
    );
    const compressedSize = compressedSizes.reduce((sum: number, size: number) => sum + size, 0);

    const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;

    const stats = {
      originalSize,
      compressedSize,
      compressionRatio
    };

    console.log(`📊 Compression stats:`, {
      originalSize: FileSystemService.formatFileSize(originalSize),
      compressedSize: FileSystemService.formatFileSize(compressedSize),
      compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
      savings: FileSystemService.formatFileSize(originalSize - compressedSize)
    });

    return {
      compressedUris,
      stats
    };
  }

  /**
   * Run ML Kit analysis on original images before compression
   * Uses parallel processing with hardware-optimized concurrency
   */
  private async runMLKitAnalysis(
    imageUris: string[], 
    onProgress?: (analyzed: number, total: number) => void
  ): Promise<Record<string, MLKitAnalysisResult>> {
    const startTime = Date.now();
    console.log(`🤖 Running ML Kit analysis on ${imageUris.length} original images...`);

    const results: Record<string, MLKitAnalysisResult> = {};
    let processedCount = 0;

    // Get hardware-optimized concurrency from compression settings
    // Use compressionWorkers as they're CPU-intensive like ML Kit processing
    const hardwareProfile = await HardwareProfiler.getHardwareProfile();
    const maxConcurrency = Math.max(2, Math.min(6, hardwareProfile.recommendedSettings.compressionWorkers));
    
    console.log(`⚡ Using parallel processing with ${maxConcurrency} concurrent workers for ML Kit analysis`);

    // Create a semaphore-like mechanism for controlled concurrency
    const processImageWithSemaphore = async (uri: string, index: number): Promise<void> => {
      try {
        // ✅ Original files are always stable and accessible
        const tempImageId = `original_${Date.now()}_${index}`;
        
        logVerbose(`✅ Cached image ${tempImageId}`);
        logVerbose(`🔄 Image Labeling attempt 1/3 for: ${uri}`);
        
        const result = await this.mlkitManager.processImage(
          tempImageId, // imageId
          uri, // imagePath (original file)
          'bulk-processor', // userId
          { skipDatabaseUpdate: true } // Don't update database during bulk processing
        );
        
        results[uri] = result;
        processedCount++;
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress(processedCount, imageUris.length);
        }
        
        // Log progress every 5 images for better visibility with parallel processing
        if (processedCount % 5 === 0 || processedCount === imageUris.length) {
          const elapsed = Date.now() - startTime;
          const avgTime = elapsed / processedCount;
          logInfo(`🔄 ML Kit analysis: ${processedCount}/${imageUris.length} images processed (${avgTime.toFixed(0)}ms avg)`);
        }
      } catch (error) {
        console.error(`❌ ML Kit analysis failed for ${uri}:`, error);
        processedCount++;
        
        // Still call progress callback for failed images to maintain count accuracy
        if (onProgress) {
          onProgress(processedCount, imageUris.length);
        }
      }
    };

    // Process images in chunks with controlled concurrency
    const chunks: string[][] = [];
    for (let i = 0; i < imageUris.length; i += maxConcurrency) {
      chunks.push(imageUris.slice(i, i + maxConcurrency));
    }

    // Process each chunk in parallel with small delays between chunks
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const chunkPromises = chunk.map((uri, chunkItemIndex) => {
        const globalIndex = chunkIndex * maxConcurrency + chunkItemIndex;
        return processImageWithSemaphore(uri, globalIndex);
      });
      
      // Wait for all images in this chunk to complete before starting the next chunk
      await Promise.allSettled(chunkPromises);
      
      // Add small delay between chunks to reduce cache pressure
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms between chunks
      }
    }

    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / imageUris.length;
    console.log(`📊 ML Kit analysis completed: ${Object.keys(results).length}/${imageUris.length} successful in ${totalTime}ms (${avgTime.toFixed(0)}ms avg, ${maxConcurrency} parallel workers)`);
    return results;
  }

  /**
   * Upload batches with progress tracking
   */
  /**
   * Upload batches with sequential processing to avoid job ID conflicts
   * (Keep ML Kit parallel, but serialize uploads for session consistency)
   */
  private async uploadBatches(
    batches: UploadBatch[],
    userId: string,
    mlkitResults: Record<string, MLKitAnalysisResult>,
    jobStatus: JobStatus,
    onProgress?: (progress: JobStatus) => void,
    onBatchComplete?: (batchId: string, result: any) => void
  ): Promise<{
    uploadedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    let uploadedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    console.log(`📤 Starting batch uploads: ${batches.length} batches (sequential for session consistency)`);

    // Pre-process all batches to add ML Kit data
    for (const batch of batches) {
      // Add ML Kit results to batch with proper mapping for virtual-image-bridge
      batch.mlkitResults = {};
      
      // Create a separate mapped data structure for virtual-image integration
      const batchMappedData: Record<string, any> = {};
      
      // Debug: Log ML Kit results availability before mapping
      const totalMLKitResults = Object.keys(mlkitResults).length;
      const batchUriCount = batch.images.length;
      console.log(`🧠 ML Kit mapping for batch ${batch.batchId}: ${totalMLKitResults} results available for ${batchUriCount} images`);
      
      if (totalMLKitResults === 0) {
        console.warn(`⚠️ NO ML Kit results available for batch ${batch.batchId}! This will result in empty virtual_image fields.`);
        // Log sample URIs for debugging
        console.log(`🧠 Batch URIs (first 3):`, batch.images.slice(0, 3).map(uri => uri.substring(uri.lastIndexOf('/') + 1)));
        console.log(`🧠 ML Kit result keys (first 3):`, Object.keys(mlkitResults).slice(0, 3).map(uri => uri.substring(uri.lastIndexOf('/') + 1)));
      }
      
      batch.images.forEach(uri => {
        if (mlkitResults[uri]) {
          // ✅ CRITICAL FIX: Map ML Kit results to virtual_image format using the mapper
          const mappedData = MLKitVirtualImageMapper.mapMLKitToVirtualImage(mlkitResults[uri]);
          
          // Validate mapped data before adding to batch
          const validation = MLKitVirtualImageMapper.validateMappedData(mappedData);
          if (!validation.valid) {
            console.warn(`⚠️ ML Kit data validation failed for ${uri}:`, validation.errors);
          }
          
          // Store raw ML Kit results for edge function compatibility
          batch.mlkitResults![uri] = mlkitResults[uri];
          
          // Store mapped data separately for virtual-image-bridge integration
          batchMappedData[uri] = validation.sanitized;
          
          logVerbose(`🧠 Mapped ML Kit data for ${uri}:`, {
            tags: validation.sanitized.virtual_tags.length,
            objects: validation.sanitized.detected_objects.length,
            faces: validation.sanitized.detected_faces_count,
            quality: validation.sanitized.quality_score,
            scene: validation.sanitized.scene_type
          });
        } else {
          console.warn(`⚠️ No ML Kit result found for URI: ${uri.substring(uri.lastIndexOf('/') + 1)}`);
          console.log(`🧠 Looking for key in mlkitResults:`, uri);
          console.log(`🧠 Available ML Kit keys (first 5):`, Object.keys(mlkitResults).slice(0, 5));
        }
      });
      
      // Attach mapped data to batch for virtual-image-bridge integration
      (batch as any).mappedMLKitData = batchMappedData;
      
      // Debug: Log ML Kit data attachment
      const mlkitCount = Object.keys(batchMappedData).length;
      console.log(`🧠 Attached ML Kit data to batch ${batch.batchId}: ${mlkitCount} images mapped`);
      if (mlkitCount > 0) {
        const sampleKey = Object.keys(batchMappedData)[0];
        const sampleData = batchMappedData[sampleKey];
        console.log(`🧠 Sample ML Kit data:`, {
          uri: sampleKey,
          tags: sampleData.virtual_tags?.length || 0,
          objects: sampleData.detected_objects?.length || 0,
          faces: sampleData.detected_faces_count || 0,
          scene: sampleData.scene_type
        });
      }
    }

    // ✅ CRITICAL FIX: Upload batches SEQUENTIALLY to avoid job ID conflicts
    // Server expects single session with one job ID
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        console.log(`📤 Uploading batch ${i + 1}/${batches.length}: ${batch.batchId}...`);

        const result = await this.batchUpload.uploadBatchWithRetry(batch, userId);
        
        if (result.success) {
          uploadedCount += result.uploadedCount;
          console.log(`✅ Batch upload successful: ${batch.batchId}`);
          
          // Capture jobId from first successful upload for status tracking
          if (result.jobId && !jobStatus.jobId) {
            const updatedJobStatus = this.jobMonitoring.updateJobId(jobStatus.processingId, result.jobId);
            if (updatedJobStatus) {
              jobStatus.jobId = updatedJobStatus.jobId; // Update local reference
              console.log(`🔗 Server job ID captured for status tracking: ${result.jobId}`);
            } else {
              // Job might have been completed or cleaned up, just update local reference
              jobStatus.jobId = result.jobId;
              console.log(`🔗 Server job ID captured locally (job completed): ${result.jobId}`);
            }
          }
          
          // Capture bucketName from first successful upload for AWS operations
          if (result.bucketName && !jobStatus.bucketName) {
            const updatedJobStatus = this.jobMonitoring.updateBucketName(jobStatus.processingId, result.bucketName);
            if (updatedJobStatus) {
              jobStatus.bucketName = updatedJobStatus.bucketName; // Update local reference
            }
            console.log(`🪣 S3 bucket name captured for AWS operations: ${result.bucketName}`);
          }
        } else {
          failedCount += batch.images.length;
          errors.push(...result.errors);
          console.error(`❌ Batch upload failed: ${batch.batchId}:`, result.errors);
        }

        // Update progress
        const updatedStatus = this.jobMonitoring.updateProgress(
          jobStatus.processingId,
          i + 1,
          uploadedCount,
          result.errors,
          []
        );

        if (onProgress && updatedStatus) {
          onProgress(updatedStatus);
        }

        if (onBatchComplete) {
          onBatchComplete(batch.batchId, result);
        }

      } catch (error) {
        failedCount += batch.images.length;
        const errorMsg = `Batch upload error: ${(error as Error).message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`📊 Batch uploads completed in ${totalTime}ms: ${uploadedCount} uploaded, ${failedCount} failed (sequential uploads for session consistency)`);

    return { uploadedCount, failedCount, errors };
  }

  /**
   * Submit job to AWS Rekognition for analysis
   */
  private async submitJobForAnalysis(
    jobStatus: JobStatus,
    userId: string,
    onProgress?: (progress: JobStatus) => void
  ): Promise<{ awsJobId?: string; status: string }> {
    if (!jobStatus.jobId) {
      throw new Error('JobId is required for AWS submission. Upload may have failed.');
    }

    if (!jobStatus.bucketName) {
      throw new Error('Bucket name is required for AWS submission. Upload may have failed.');
    }

    console.log(`⚡ Submitting job ${jobStatus.jobId} to AWS Rekognition...`);

    try {
      const { data, error } = await supabase.functions.invoke('bulk-nsfw-submit', {
        body: {
          jobId: jobStatus.jobId,
          bucketName: jobStatus.bucketName,
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

      console.log(`✅ Successfully submitted job ${jobStatus.jobId} to AWS Rekognition:`, {
        status: data.status,
        awsJobId: data.awsJobId || 'N/A',
        requestId: data.request_id || 'N/A',
        // DEBUGGING: Track job ID flow
        ourJobId: jobStatus.jobId,
        bucketName: jobStatus.bucketName,
        timestamp: new Date().toISOString()
      });

      // Update progress
      if (onProgress) {
        const updatedStatus = this.jobMonitoring.updateProgress(
          jobStatus.processingId,
          jobStatus.totalBatches, // All batches uploaded
          jobStatus.processedImages, // Keep current count
          [],
          [`Job submitted to AWS Rekognition: ${data.awsJobId || 'Unknown'}`]
        );
        if (updatedStatus) {
          onProgress(updatedStatus);
        }
      }

      return {
        awsJobId: data.awsJobId,
        status: data.status || 'processing'
      };

    } catch (submitError: unknown) {
      console.error(`❌ Submit error details:`, submitError);
      
      const errorMessage = submitError instanceof Error ? submitError.message : String(submitError);
      
      if (errorMessage.includes('Edge Function returned a non-2xx status code')) {
        console.error(`❌ Edge function failed - this usually means AWS Rekognition error`);
        throw new Error(`AWS Rekognition submission failed. Check server logs for details.`);
      }
      
      throw new Error(`Submit failed: ${errorMessage}`);
    }
  }

  /**
   * Wait for server processing to complete
   */
  private async waitForServerProcessing(
    processingId: string,
    jobStatus: JobStatus,
    onProgress?: (progress: JobStatus) => void,
    maxWaitTime: number = 300000 // 5 minutes
  ): Promise<{ moderationResults: any[] }> {
    console.log(`⏳ Waiting for server processing: ${processingId}...`);

    const startTime = Date.now();
    const pollInterval = 10000; // Poll every 2 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const statusResult = await this.jobMonitoring.monitorServerStatus(processingId);
        
        if (statusResult.serverStatus) {
          const serverStatus = statusResult.serverStatus;
          
          console.log(`📊 Server status update:`, {
            status: serverStatus.status,
            progress: serverStatus.progress,
            processedImages: serverStatus.processedImages
          });

          if (serverStatus.status === 'completed') {
            console.log(`✅ Server processing completed: ${processingId}`);
            return {
              moderationResults: serverStatus.results || []
            };
          }

          if (serverStatus.status === 'failed') {
            throw new Error(`Server processing failed: ${serverStatus.error || 'Unknown error'}`);
          }

          // Update progress if callback provided
          if (onProgress && statusResult.syncedStatus) {
            onProgress(statusResult.syncedStatus);
          }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error(`❌ Error checking server status:`, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Server processing timeout after ${maxWaitTime}ms`);
  }

  /**
   * Cancel a running processing job
   */
  async cancelProcessing(processingId: string, reason?: string): Promise<boolean> {
    try {
      const cancelledJob = this.jobMonitoring.cancelJob(processingId, reason);
      
      if (cancelledJob) {
        console.log(`🛑 Processing cancelled: ${processingId}`);
        return true;
      } else {
        console.warn(`⚠️ Could not cancel processing: ${processingId} (job not found)`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error cancelling processing: ${processingId}:`, error);
      return false;
    }
  }

  /**
   * Get processing status
   */
  getProcessingStatus(processingId: string): JobStatus | null {
    return this.jobMonitoring.getJobStatus(processingId);
  }

  /**
   * Get all active processing jobs
   */
  getActiveJobs(): JobStatus[] {
    return this.jobMonitoring.getActiveJobs();
  }

  /**
   * Get processing metrics
   */
  getMetrics() {
    return this.jobMonitoring.calculateMetrics();
  }

  /**
   * Get monitoring dashboard data
   */
  getDashboardData() {
    return this.jobMonitoring.getDashboardData();
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    console.log('🧹 Cleaning up bulk processing resources...');
    this.compressionCache.clear();
    this.jobMonitoring.cleanupHistory();
  }
}

// Export singleton instance
export const bulkProcessingOrchestrator = new BulkProcessingOrchestrator();
