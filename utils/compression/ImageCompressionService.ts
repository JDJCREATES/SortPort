import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as FileSystem from 'expo-file-system';
import { CompressionCacheService } from '../cache/CompressionCacheService';
import { FileSystemService } from '../filesystem/FileSystemService';

// Import centralized logging system
import { 
  logError, 
  logWarn, 
  logInfo, 
  logDebug, 
  logVerbose,
  LogLevel,
  loggingConfig
} from '../shared/LoggingConfig';

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
   * Compress a single image using ID-based approach
   */
  async compressImage(uri: string): Promise<string> {
    const startTime = Date.now();
    const originalUri = uri;
    const filename = originalUri.split('/').pop() || 'image.jpg';    // Check cache first
    if (this.cache.has(originalUri)) {
      const cached = this.cache.get(originalUri)!;
      logVerbose('Compression cache hit', {
        component: 'ImageCompressionService',
        originalUri: originalUri.substring(originalUri.lastIndexOf('/') + 1),
        usedCache: cached !== originalUri
      });
      return cached;
    }

    // Validate input file (original) with additional accessibility checks
    const validation = await FileSystemService.validateFile(originalUri);
    if (!validation.exists) {
      throw new Error(`Input file doesn't exist: ${originalUri}`);
    }
    if (validation.size === 0) {
      throw new Error(`Input file is empty: ${originalUri}`);
    }
    
    // Additional check: verify file is actually readable before compression
    try {
      const fileInfo = await import('expo-file-system').then(fs => fs.getInfoAsync(originalUri));
      if (!fileInfo.exists || fileInfo.isDirectory) {
        throw new Error(`File is not accessible or is a directory: ${originalUri}`);
      }
      // Double-check file size consistency
      if ((fileInfo as any).size !== validation.size) {
        throw new Error(`File size inconsistency detected: ${originalUri} (${(fileInfo as any).size} vs ${validation.size})`);
      }
    } catch (error) {
      throw new Error(`File accessibility check failed for ${originalUri}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Only log PNG detection at debug level to reduce noise
    const isPng = originalUri.toLowerCase().includes('.png');
    if (isPng) {
      logDebug('PNG file detected, preserving format and transparency', {
        component: 'ImageCompressionService',
        filename
      });
    }

    // Compression retry loop with diagnostics and memory pressure handling
    let result: { uri: string } | undefined;
    let compressionError = null;
    let finalAttempt = 0;
    const maxCompressionAttempts = 3;
    
    for (let attempt = 1; attempt <= maxCompressionAttempts; attempt++) {
      finalAttempt = attempt;
      try {
        // Add small delay between attempts to reduce memory pressure
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 200 * attempt));
        }
        
        if (isPng) {
          result = await ImageResizer.createResizedImage(
            originalUri,
            this.settings.maxImageSize,
            this.settings.maxImageSize,
            'PNG',
            100,
            0,
            undefined,
            false,
            {
              mode: 'contain',
              onlyScaleDown: true
            }
          );
        } else {
          result = await ImageResizer.createResizedImage(
            originalUri,
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
        
        // ✅ SIMPLE & EFFECTIVE: Just ensure the file isn't 0 bytes
        if (!result?.uri) {
          throw new Error('ImageResizer returned invalid result');
        }
        
        const compressedUri = result.uri;
        const stats = await import('expo-file-system').then(fs => fs.getInfoAsync(compressedUri));
        
        if (!stats.exists || stats.isDirectory || (stats as any).size === 0) {
          throw new Error(`Compression produced invalid file: ${compressedUri} (size: ${(stats as any).size || 0} bytes)`);
        }
        
        // ✅ CRITICAL FIX: Move compressed file from cache to document directory
        // to prevent Android from cleaning it up under memory pressure
        const timestamp = Date.now();
        const extension = compressedUri.substring(compressedUri.lastIndexOf('.'));
        const filename = `compressed_${timestamp}_${Math.random().toString(36).substr(2, 9)}${extension}`;
        const documentDirectory = FileSystem.documentDirectory!;
        const persistentUri = documentDirectory + filename;
        
        // Copy from cache directory to document directory
        await FileSystem.copyAsync({
          from: compressedUri,
          to: persistentUri
        });
        
        // Update result to use persistent location
        result.uri = persistentUri;
        
        console.log(`✅ Compressed file created and moved to persistent storage: ${persistentUri} (${(stats as any).size} bytes)`);
      } catch (err) {
        compressionError = err;
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // Check if this is a memory-related error
        const isMemoryError = errorMessage.toLowerCase().includes('memory') || 
                             errorMessage.toLowerCase().includes('rotate image');
        
        logWarn('Compression attempt failed', {
          component: 'ImageCompressionService',
          attempt,
          maxAttempts: maxCompressionAttempts,
          originalUri: originalUri,
          error: errorMessage,
          isMemoryError
        });
        
        // If memory error and we have more attempts, try with reduced quality
        if (isMemoryError && attempt < maxCompressionAttempts) {
          console.log(`🧠 Memory pressure detected, will retry with reduced quality on attempt ${attempt + 1}`);
          // Temporarily reduce quality for next attempt
          const originalQuality = this.settings.compressionQuality;
          this.settings.compressionQuality = Math.max(0.3, originalQuality * 0.7);
          
          // Restore original quality after this attempt
          setTimeout(() => {
            this.settings.compressionQuality = originalQuality;
          }, 1000);
        }
        
        // Try next attempt
      }
    }
    if (!result) {
      throw new Error(`Compression failed for '${originalUri}' after ${maxCompressionAttempts} attempts. Last error: ${compressionError}`);
    }

    // Success - update stats and cache ONLY after file is confirmed stable
    const processingTime = Date.now() - startTime;
    this.updateStats(processingTime, true, originalUri);
    
    // ✅ CRITICAL FIX: Only cache after file is confirmed written and stable
    this.cache.set(originalUri, result.uri);
    
    logVerbose('Compression completed successfully', {
      component: 'ImageCompressionService',
      originalUri: originalUri.substring(originalUri.lastIndexOf('/') + 1),
      compressedUri: result.uri.substring(result.uri.lastIndexOf('/') + 1),
      processingTimeMs: processingTime,
      attempts: finalAttempt
    });
    
    return result.uri;
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

    logInfo('Starting image compression batch', {
      component: 'ImageCompressionService', 
      totalImages: imageUris.length,
      workers: this.settings.workers,
      cacheSize: requiredCacheSize
    });
    
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
      logInfo('Compression batch completed', {
        component: 'ImageCompressionService',
        totalImages: imageUris.length,
        successful: stats.successCount,
        failed: stats.failureCount,
        avgTimeMs: stats.averageTimeMs.toFixed(0),
        pngCount: stats.pngCount,
        jpegCount: stats.jpegCount
      });
      
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
    logDebug('Compression worker started', {
      component: 'ImageCompressionService',
      workerId
    });
    
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
        logError('Compression worker failed', {
          component: 'ImageCompressionService',
          workerId,
          uri: uri.substring(uri.lastIndexOf('/') + 1),
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        onComplete();
        this.activeCompressions--;
      }
      
      // Small delay between compressions
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    logDebug('Compression worker finished', {
      component: 'ImageCompressionService',
      workerId
    });
  }

  /**
   * Wait for specific URIs to be compressed
   */
  async waitForCompressionReady(uris: string[], timeoutMs: number = 45000): Promise<void> {
    const startTime = Date.now();
    logInfo('Waiting for compression completion', {
      component: 'ImageCompressionService',
      imageCount: uris.length,
      timeoutMs
    });
    
    while (Date.now() - startTime < timeoutMs) {
      const status = this.cache.getBatchStatus(uris);
      
      if (status.misses.length === 0) {
        logInfo('All images compressed successfully', {
          component: 'ImageCompressionService',
          imageCount: uris.length,
          completionTime: Date.now() - startTime
        });
        return;
      }
      
      // Log progress every 5 seconds
      if ((Date.now() - startTime) % 5000 < 100) {
        logDebug('Compression progress update', {
          component: 'ImageCompressionService',
          completed: status.hits.length,
          total: uris.length,
          hitRate: status.hitRate.toFixed(0),
          remaining: status.misses.length
        });
        
        if (status.misses.length <= 5) {
          const missingNames = status.misses.map(uri => uri.substring(uri.lastIndexOf('/') + 1));
          logVerbose('Remaining files to compress', {
            component: 'ImageCompressionService',
            remainingFiles: missingNames
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const finalStatus = this.cache.getBatchStatus(uris);
    if (finalStatus.misses.length > 0) {
      const missingNames = finalStatus.misses.map(uri => uri.substring(uri.lastIndexOf('/') + 1));
      logWarn('Compression timeout occurred', {
        component: 'ImageCompressionService',
        timeoutMs,
        completed: finalStatus.hits.length,
        total: uris.length,
        hitRate: finalStatus.hitRate.toFixed(0),
        missingFiles: missingNames
      });
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
    logInfo('Compression settings updated', {
      component: 'ImageCompressionService',
      newSettings: this.settings
    });
  }

  /**
   * Clear compression cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clean up compressed files from document directory
   * Call this after successful batch upload to free up space
   */
  async cleanupCompressedFiles(compressedUris: string[]): Promise<void> {
    for (const uri of compressedUris) {
      try {
        // Only delete files that are in our document directory and are compressed files
        if (uri.includes(FileSystem.documentDirectory!) && uri.includes('compressed_')) {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            console.log(`🧹 Cleaned up compressed file: ${uri.substring(uri.lastIndexOf('/') + 1)}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup compressed file ${uri}:`, error);
      }
    }
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
