import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as FileSystem from 'expo-file-system';
import { CompressionCacheService } from '../cache/CompressionCacheService';
import { FileSystemService } from '../filesystem/FileSystemService';

export interface CompressionSettings {
  maxImageSize: number;
  compressionQuality: number;
  workers: number;
}

export interface CompressionStats {
  totalProcessed: number;
  totalTimeMs: number;
  averageTimeMs: number;
  successCount: number;
  failureCount: number;
  pngCount: number; // ✅ Track PNG files processed
  jpegCount: number; // ✅ Track JPEG files processed
}

/**
 * Image Compression Service - handles native image compression with enhanced debugging
 */
export class ImageCompressionService {
  private cache: CompressionCacheService;
  private settings: CompressionSettings;
  private stats: CompressionStats;
  private isProcessing = false;
  private activeCompressions = 0;
  private compressionQueue: string[] = [];

  constructor(settings: CompressionSettings, cache?: CompressionCacheService) {
    this.cache = cache || new CompressionCacheService(200);
    this.settings = settings;
    this.stats = {
      totalProcessed: 0,
      totalTimeMs: 0,
      averageTimeMs: 0,
      successCount: 0,
      failureCount: 0,
      pngCount: 0, // ✅ Initialize PNG counter
      jpegCount: 0 // ✅ Initialize JPEG counter
    };
  }

  /**
   * Compress a single image with enhanced validation and debugging
   */
  async compressImage(uri: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.cache.has(uri)) {
        const cached = this.cache.get(uri)!;
        // Cache hit logging removed to reduce terminal spam
        // console.log(`💨 Cache hit: ${uri.substring(uri.lastIndexOf('/') + 1)}`);
        return cached;
      }

      // Validate input file
      const validation = await FileSystemService.validateFile(uri);
      if (!validation.exists) {
        console.warn(`⚠️ Input file doesn't exist: ${uri}, using original`);
        this.cache.set(uri, uri);
        this.stats.failureCount++;
        return uri;
      }

      if (validation.size === 0) {
        console.warn(`⚠️ Input file is empty: ${uri}, using original`);
        this.cache.set(uri, uri);
        this.stats.failureCount++;
        return uri;
      }

      // Per-image compression start logging removed to reduce terminal spam
      // console.log(`🔄 Compressing: ${uri.substring(uri.lastIndexOf('/') + 1)} (${FileSystemService.formatFileSize(validation.size)})`);

      // ✅ SMART COMPRESSION: Detect file type and handle PNG vs JPEG differently
      const isPng = uri.toLowerCase().includes('.png');
      
      let result;
      if (isPng) {
        // For PNG files: focus on resizing rather than quality compression
        // PNG is lossless, so we rely on dimension reduction for file size savings
        console.log(`🖼️ PNG detected: preserving format and transparency`);
        result = await ImageResizer.createResizedImage(
          uri,
          this.settings.maxImageSize,
          this.settings.maxImageSize,
          'PNG', // Preserve PNG format and transparency
          100,   // PNG doesn't use quality - this is ignored
          0,
          undefined,
          false,
          {
            mode: 'contain',
            onlyScaleDown: true
          }
        );
      } else {
        // For JPEG and other formats: use standard compression
        result = await ImageResizer.createResizedImage(
          uri,
          this.settings.maxImageSize,
          this.settings.maxImageSize,
          'JPEG',
          this.settings.compressionQuality * 100,
          0,
          undefined,
          false,
          {
            mode: 'contain',
            onlyScaleDown: true
          }
        );
      }

      // FIXED: Increased delay to ensure file is fully written by ImageResizer
      // This prevents race conditions where file exists but is still being written
      // Increased from 10ms to 50ms for better reliability under heavy load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Validate compressed file with retries
      let compressedValidation = await FileSystemService.validateFile(result.uri);
      let retryCount = 0;
      const maxRetries = 3;
      
      while ((!compressedValidation.exists || compressedValidation.size === 0) && retryCount < maxRetries) {
        console.warn(`⚠️ Compressed file not ready (attempt ${retryCount + 1}/${maxRetries}): ${result.uri}`);
        await new Promise(resolve => setTimeout(resolve, 25));
        compressedValidation = await FileSystemService.validateFile(result.uri);
        retryCount++;
      }

      if (!compressedValidation.exists) {
        console.warn(`⚠️ Compressed file doesn't exist after retries: ${result.uri}, falling back to original`);
        this.cache.set(uri, uri);
        this.stats.failureCount++;
        return uri;
      }

      if (compressedValidation.size === 0) {
        console.warn(`⚠️ Compressed file is empty: ${result.uri}, falling back to original`);
        this.cache.set(uri, uri);
        this.stats.failureCount++;
        return uri;
      }

      // Success - update stats and cache
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, true, uri); // ✅ Pass URI for file type detection
      
      const compressionRatio = ((validation.size - compressedValidation.size) / validation.size * 100).toFixed(1);
      // Per-image compression success logging removed to reduce terminal spam
      // console.log(`✅ Compressed: ${uri.substring(uri.lastIndexOf('/') + 1)} -> ${FileSystemService.formatFileSize(compressedValidation.size)} (${compressionRatio}% reduction, ${processingTime}ms)`);
      
      this.cache.set(uri, result.uri);
      return result.uri;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, false, uri); // ✅ Pass URI for file type detection
      
      // ✅ Enhanced error logging with PNG-specific context
      const isPng = uri.toLowerCase().includes('.png');
      const fileType = isPng ? 'PNG' : 'JPEG';
      const errorContext = isPng ? ' (PNG transparency preservation failed)' : '';
      
      console.warn(`⚠️ ${fileType} compression failed for ${uri.substring(uri.lastIndexOf('/') + 1)}${errorContext}:`, error);
      this.cache.set(uri, uri);
      return uri;
    }
  }

  /**
   * Compress multiple images using worker pool
   */
  async compressImages(
    imageUris: string[],
    onProgress?: (compressed: number, total: number) => void
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Compression already in progress');
    }

    // Reset stats at the beginning of each compression session
    this.stats = {
      totalProcessed: 0,
      totalTimeMs: 0,
      averageTimeMs: 0,
      successCount: 0,
      failureCount: 0,
      pngCount: 0, // ✅ Reset PNG counter
      jpegCount: 0 // ✅ Reset JPEG counter
    };

    this.isProcessing = true;
    this.compressionQueue = [...imageUris];
    
    // Adjust cache size to accommodate all images
    const requiredCacheSize = Math.max(imageUris.length * 1.2, 200);
    this.cache.setMaxSize(requiredCacheSize);

    console.log(`🚀 Starting compression: ${imageUris.length} images, ${this.settings.workers} workers`);
    
    let completedCount = 0;
    
    try {
      // Start worker pool
      const workers = Array.from({ length: this.settings.workers }, (_, i) => 
        this.compressionWorker(i, () => {
          completedCount++;
          if (onProgress) {
            onProgress(completedCount, imageUris.length);
          }
        })
      );
      
      await Promise.all(workers);
      
      const stats = this.getStats();
      console.log(`⚡ Compression complete: ${stats.successCount}/${imageUris.length} successful (avg: ${stats.averageTimeMs.toFixed(0)}ms per image)`);
      console.log(`📊 File types processed: ${stats.pngCount} PNG, ${stats.jpegCount} JPEG`); // ✅ Show PNG vs JPEG breakdown
      
    } finally {
      this.isProcessing = false;
      this.compressionQueue = [];
      this.activeCompressions = 0;
    }
  }

  /**
   * Compression worker implementation
   */
  private async compressionWorker(
    workerId: number,
    onComplete: () => void
  ): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      // Worker start logging removed to reduce terminal spam
      // console.log(`🔧 Compression worker ${workerId} started`);
    }
    
    while (this.compressionQueue.length > 0 && this.isProcessing) {
      const uri = this.compressionQueue.shift();
      if (!uri) break;
      
      // Skip if already cached
      if (this.cache.has(uri)) {
        onComplete();
        continue;
      }
      
      this.activeCompressions++;
      
      try {
        await this.compressImage(uri);
        // onComplete() call moved to finally block to ensure it's called exactly once
      } catch (error) {
        console.error(`❌ Worker ${workerId} failed for ${uri}:`, error);
      } finally {
        onComplete();
        this.activeCompressions--;
      }
      
      // Small delay between compressions
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    if (process.env.NODE_ENV === 'development') {
      // Worker finish logging removed to reduce terminal spam
      // console.log(`🏁 Compression worker ${workerId} finished`);
    }
  }

  /**
   * Wait for specific URIs to be compressed
   */
  async waitForCompressionReady(uris: string[], timeoutMs: number = 45000): Promise<void> {
    const startTime = Date.now();
    console.log(`⏳ Waiting for compression of ${uris.length} images...`);
    
    while (Date.now() - startTime < timeoutMs) {
      const status = this.cache.getBatchStatus(uris);
      
      if (status.misses.length === 0) {
        console.log(`✅ All ${uris.length} images compressed and ready (100%)`);
        return;
      }
      
      // Log progress every 5 seconds
      if ((Date.now() - startTime) % 5000 < 100) {
        console.log(`⏳ Compression progress: ${status.hits.length}/${uris.length} (${status.hitRate.toFixed(0)}%) ready...`);
        
        if (status.misses.length <= 5) {
          const missingNames = status.misses.map(uri => uri.substring(uri.lastIndexOf('/') + 1));
          console.log(`🔍 Still waiting for: ${missingNames.join(', ')}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const finalStatus = this.cache.getBatchStatus(uris);
    if (finalStatus.misses.length > 0) {
      console.warn(`⚠️ Compression timeout after ${timeoutMs}ms. Only ${finalStatus.hits.length}/${uris.length} (${finalStatus.hitRate.toFixed(0)}%) images ready. Proceeding anyway...`);
      
      const missingNames = finalStatus.misses.map(uri => uri.substring(uri.lastIndexOf('/') + 1));
      console.warn(`❌ Missing compressed images: ${missingNames.join(', ')}`);
    }
  }

  /**
   * Get compressed URI for original URI
   */
  getCompressedUri(originalUri: string): string {
    return this.cache.get(originalUri) || originalUri;
  }

  /**
   * Get original URI for compressed URI
   */
  getOriginalUri(compressedUri: string): string {
    return this.cache.getOriginal(compressedUri) || compressedUri;
  }

  /**
   * Update compression statistics
   */
  private updateStats(processingTimeMs: number, success: boolean, uri?: string): void {
    this.stats.totalProcessed++;
    this.stats.totalTimeMs += processingTimeMs;
    this.stats.averageTimeMs = this.stats.totalTimeMs / this.stats.totalProcessed;
    
    // ✅ Track PNG vs JPEG file types
    if (uri) {
      const isPng = uri.toLowerCase().includes('.png');
      if (isPng) {
        this.stats.pngCount++;
      } else {
        this.stats.jpegCount++;
      }
    }
    
    if (success) {
      this.stats.successCount++;
    } else {
      this.stats.failureCount++;
    }
  }

  /**
   * Get compression statistics
   */
  getStats(): CompressionStats {
    return { ...this.stats };
  }

  /**
   * Update compression settings
   */
  updateSettings(settings: Partial<CompressionSettings>): void {
    this.settings = { ...this.settings, ...settings };
    console.log(`⚙️ Compression settings updated:`, this.settings);
  }

  /**
   * Clear compression cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Debug cache contents
   */
  debugCache(maxEntries: number = 10): void {
    this.cache.debugLogCache(maxEntries);
  }
}
