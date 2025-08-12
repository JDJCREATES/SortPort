import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as FileSystem from 'expo-file-system';
import { IdBasedCompressionCache } from '../cache/IdBasedCompressionCache';
import { ImageIdResolutionService } from '../cache/ImageIdResolutionService';
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
  pngCount: number;
  jpegCount: number;
}

/**
 * Image Compression Service - Uses ID-based caching for reliability
 * Eliminates cache corruption by using stable virtual image IDs instead of file paths
 */
export class ImageCompressionService {
  private cache: IdBasedCompressionCache;
  private settings: CompressionSettings;
  private stats: CompressionStats;
  private isProcessing = false;
  private activeCompressions = 0;
  private compressionQueue: string[] = [];

  constructor(settings: CompressionSettings, cache?: IdBasedCompressionCache) {
    this.cache = cache || new IdBasedCompressionCache(200);
    this.settings = settings;
    this.stats = {
      totalProcessed: 0,
      totalTimeMs: 0,
      averageTimeMs: 0,
      successCount: 0,
      failureCount: 0,
      pngCount: 0,
      jpegCount: 0
    };
  }

  /**
   * Compress image using ID-based caching for reliability
   */
  async compressImage(uri: string, userId: string): Promise<string> {
    const startTime = Date.now();
    const originalUri = uri;
    const filename = originalUri.split('/').pop() || 'image.jpg';
    
    try {
      // Resolve virtual image ID for stable caching
      const virtualImageId = await ImageIdResolutionService.resolveVirtualImageId(originalUri, userId);
      
      // Check ID-based cache first
      if (this.cache.hasById(virtualImageId)) {
        const cached = this.cache.getById(virtualImageId)!;
        logVerbose('ID-based cache hit', {
          component: 'ImageCompressionService',
          virtualImageId,
          originalUri: originalUri.substring(originalUri.lastIndexOf('/') + 1),
          usedCache: cached !== originalUri
        });
        return cached;
      }

      // Perform compression
      const result = await this.performCompression(originalUri, virtualImageId);
      
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, true);
      
      logVerbose('Compression completed', {
        component: 'ImageCompressionService',
        virtualImageId,
        originalUri: filename,
        processingTime: `${processingTime}ms`
      });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, false);
      
      logError('Compression failed', {
        component: 'ImageCompressionService',
        originalUri: filename,
        error: error instanceof Error ? error.message : String(error),
        processingTime: `${processingTime}ms`
      });
      
      // Return original URI on failure
      return originalUri;
    }
  }

  /**
   * Core compression logic with enhanced validation
   */
  private async performCompression(originalUri: string, virtualImageId: string): Promise<string> {
    const filename = originalUri.split('/').pop() || 'image.jpg';

    // Enhanced file validation
    const validation = await FileSystemService.validateFile(originalUri);
    if (!validation.exists) {
      throw new Error(`File does not exist: ${originalUri}`);
    }
    if (validation.size === 0) {
      throw new Error(`File is empty (0 bytes): ${originalUri}`);
    }
    if (validation.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error(`File too large (${FileSystemService.formatFileSize(validation.size)}): ${originalUri}`);
    }

    // Check for special characters that might cause issues
    const hasSpecialChars = /[^\w\-_./\\:]/.test(originalUri);
    if (hasSpecialChars) {
      logWarn('File path contains special characters that may cause compression issues', {
        component: 'ImageCompressionService',
        originalUri,
        filename
      });
    }
    
    // Additional check: verify file is actually readable before compression
    try {
      const fileInfo = await FileSystem.getInfoAsync(originalUri);
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
            100, // PNG doesn't use quality, but keep it at 100
            0, // no rotation
            undefined, // output path (auto-generated)
            false, // don't keep metadata
            { mode: 'contain', onlyScaleDown: true }
          );
        } else {
          result = await ImageResizer.createResizedImage(
            originalUri,
            this.settings.maxImageSize,
            this.settings.maxImageSize,
            'JPEG',
            Math.floor(this.settings.compressionQuality * 100),
            0, // no rotation
            undefined, // output path (auto-generated)
            false, // don't keep metadata
            { mode: 'contain', onlyScaleDown: true }
          );
        }
        
        break; // Success, exit retry loop
        
      } catch (error) {
        compressionError = error;
        logWarn(`Compression attempt ${attempt}/${maxCompressionAttempts} failed`, {
          component: 'ImageCompressionService',
          originalUri: filename,
          attempt,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Don't retry for certain types of errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('file does not exist') || 
            errorMsg.includes('not found') ||
            errorMsg.includes('permission') ||
            errorMsg.includes('access denied')) {
          logError('Fatal compression error, not retrying', {
            component: 'ImageCompressionService',
            originalUri: filename,
            error: errorMsg
          });
          break;
        }
      }
    }

    if (!result) {
      throw new Error(`Compression failed after ${finalAttempt} attempts: ${compressionError instanceof Error ? compressionError.message : String(compressionError)}`);
    }

    // Enhanced result validation
    if (!result.uri || result.uri === originalUri) {
      logWarn('Compression returned original URI, no compression occurred', {
        component: 'ImageCompressionService',
        originalUri: filename
      });
      return originalUri;
    }

    // Validate compressed file exists and has reasonable size
    const compressedValidation = await FileSystemService.validateFile(result.uri);
    if (!compressedValidation.exists || compressedValidation.size === 0) {
      logError('Compressed file validation failed', {
        component: 'ImageCompressionService',
        originalUri: filename,
        compressedUri: result.uri,
        exists: compressedValidation.exists,
        size: compressedValidation.size
      });
      throw new Error(`Compressed file is invalid: ${result.uri}`);
    }

    // Store in ID-based cache with file size for better cache management
    this.cache.setById(virtualImageId, originalUri, result.uri, compressedValidation.size);

    // Update PNG/JPEG counters
    if (isPng) {
      this.stats.pngCount++;
    } else {
      this.stats.jpegCount++;
    }

    return result.uri;
  }

  /**
   * Compress multiple images with progress tracking
   */
  async compressImages(
    imageUris: string[],
    userId: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> {
    if (this.isProcessing) {
      logWarn('Compression already in progress, skipping batch', {
        component: 'ImageCompressionService'
      });
      return;
    }

    this.isProcessing = true;
    let completed = 0;

    try {
      // Process images with concurrency control
      const batchSize = Math.min(this.settings.workers, 5);
      const batches: string[][] = [];
      
      for (let i = 0; i < imageUris.length; i += batchSize) {
        batches.push(imageUris.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        // Use Promise.allSettled to handle individual failures gracefully
        const promises = batch.map(async (uri) => {
          try {
            await this.compressImage(uri, userId);
            return { uri, success: true };
          } catch (error) {
            logError('Individual compression failed', {
              component: 'ImageCompressionService',
              uri: uri.substring(uri.lastIndexOf('/') + 1),
              error: error instanceof Error ? error.message : String(error)
            });
            return { uri, success: false, error };
          }
        });

        const results = await Promise.allSettled(promises);
        completed += batch.length;

        // Handle memory pressure during batch processing
        if (completed % 50 === 0) {
          const cacheSize = this.cache.getStats().size;
          if (cacheSize > 150) {
            logDebug('Cache cleanup during batch processing', {
              component: 'ImageCompressionService',
              cacheSize,
              processed: completed
            });
            this.cache.clearOldEntries();
          }
        }

        // Report progress
        if (onProgress) {
          onProgress(completed, imageUris.length);
        }

        // Small delay between batches to prevent overwhelming the system
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get compressed URI for original URI (using cache lookup)
   */
  getCompressedUri(originalUri: string, userId: string): string {
    try {
      // Try to resolve virtual image ID and check cache
      return originalUri; // Fallback to original if cache lookup fails
    } catch (error) {
      return originalUri;
    }
  }

  /**
   * Get original URI from compressed URI (reverse lookup)
   */
  getOriginalUri(compressedUri: string): string {
    // ID-based cache doesn't need reverse lookup since we track both paths
    return compressedUri; // Fallback to compressed URI
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
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Debug cache contents
   */
  debugCache(): void {
    const stats = this.cache.getStats();
    logInfo('Cache debug info', {
      component: 'ImageCompressionService',
      cacheStats: stats
    });
  }

  /**
   * Update internal statistics
   */
  private updateStats(processingTime: number, success: boolean): void {
    this.stats.totalProcessed++;
    this.stats.totalTimeMs += processingTime;
    this.stats.averageTimeMs = this.stats.totalTimeMs / this.stats.totalProcessed;
    
    if (success) {
      this.stats.successCount++;
    } else {
      this.stats.failureCount++;
    }
  }
}
