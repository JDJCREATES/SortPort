import { Image } from 'expo-image';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';

export class ImageCacheManager {
  private static preloadQueue: Set<string> = new Set();
  private static isPreloading = false;
  private static readonly PRELOAD_BATCH_SIZE = 25; // Increased for better throughput
  private static readonly PRELOAD_DELAY = 15; // Reduced delay for faster preloading
  private static readonly MAX_CACHE_SIZE = 1000; // Increased to reduce aggressive eviction
  private static cacheOrder: string[] = []; // Track LRU order

  /**
   * Preload images for better performance using Expo Image
   */
  static async preloadImages(uris: string[], priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    const sources = uris
      .filter(uri => !this.preloadQueue.has(uri))
      .map(uri => {
        this.preloadQueue.add(uri);
        this.updateCacheOrder(uri);
        return uri;
      });

    if (sources.length === 0) return;

    // Manage memory by evicting old items if needed
    this.evictOldCache();

    try {
      // Adjust batch processing based on priority
      const batchSize = priority === 'high' ? this.PRELOAD_BATCH_SIZE + 5 : this.PRELOAD_BATCH_SIZE;
      const delay = priority === 'high' ? 0 : priority === 'normal' ? this.PRELOAD_DELAY : this.PRELOAD_DELAY * 2;
      
      for (let i = 0; i < sources.length; i += batchSize) {
        const batch = sources.slice(i, i + batchSize);
        
        // Priority-based cache policy
        const cachePolicy = priority === 'high' ? 'memory-disk' : 
                           priority === 'normal' ? 'memory-disk' : 'disk';
        
        // Preload each image in the batch
        if (priority === 'high') {
          // High priority: sequential for immediate need
          for (const uri of batch) {
            try {
              await Image.prefetch(uri, { cachePolicy });
            } catch (error) {
              console.warn(`Failed to preload high priority image ${uri}:`, error);
              this.preloadQueue.delete(uri);
            }
          }
        } else {
          // Normal/low priority: parallel for efficiency
          await Promise.all(
            batch.map(uri => 
              Image.prefetch(uri, { cachePolicy }).catch(error => {
                console.warn(`Failed to preload image ${uri}:`, error);
                this.preloadQueue.delete(uri);
              })
            )
          );
        }
        
        // Delay between batches (except for high priority)
        if (delay > 0 && i + batchSize < sources.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } catch (error) {
      console.warn('Error preloading images:', error);
    }
  }

  /**
   * Update cache order for LRU management
   */
  private static updateCacheOrder(uri: string): void {
    const existingIndex = this.cacheOrder.indexOf(uri);
    if (existingIndex > -1) {
      this.cacheOrder.splice(existingIndex, 1);
    }
    this.cacheOrder.push(uri);
  }

  /**
   * Conservative cache eviction - only remove items when significantly over limit
   */
  private static evictOldCache(): void {
    // Only evict when significantly over limit to avoid aggressive cache clearing
    if (this.preloadQueue.size > this.MAX_CACHE_SIZE * 1.2) {
      // Remove only a quarter of excess items to be conservative
      const targetReduction = Math.floor((this.preloadQueue.size - this.MAX_CACHE_SIZE) / 4);
      
      for (let i = 0; i < targetReduction && this.cacheOrder.length > 0; i++) {
        const oldestUri = this.cacheOrder.shift();
        if (oldestUri) {
          this.preloadQueue.delete(oldestUri);
        }
      }
    }
  }

  /**
   * Preload upcoming images based on current scroll position
   */
  static preloadUpcomingImages(
    allImages: ImageMeta[], 
    currentIndex: number, 
    lookahead: number = 15
  ): void {
    const upcomingImages = allImages
      .slice(currentIndex, currentIndex + lookahead)
      .map(img => img.uri);

    if (upcomingImages.length > 0) {
      this.preloadImages(upcomingImages, 'normal');
    }
  }

  /**
   * Clear image caches using Expo Image
   */
  static async clearCache(): Promise<void> {
    try {
      // Clear Expo Image cache
      await Image.clearMemoryCache();
      await Image.clearDiskCache();
      
      // Clear our preload queue and cache order
      this.preloadQueue.clear();
      this.cacheOrder = [];
      
      console.log('✅ Image cache cleared successfully');
    } catch (error) {
      console.warn('Error clearing image cache:', error);
    }
  }

  /**
   * Get cache statistics (for debugging)
   * Note: Expo Image doesn't provide cache size info, so we return queue size
   */
  static getCacheStats(): { 
    preloadQueueSize: number;
    platform: string;
  } {
    return {
      preloadQueueSize: this.preloadQueue.size,
      platform: Platform.OS,
    };
  }

  /**
   * Remove URI from preload queue and cache order
   */
  static removeFromPreloadQueue(uri: string): void {
    this.preloadQueue.delete(uri);
    const index = this.cacheOrder.indexOf(uri);
    if (index > -1) {
      this.cacheOrder.splice(index, 1);
    }
  }

  /**
   * Preload a single image with options
   */
  static async preloadSingleImage(
    uri: string, 
    cachePolicy: 'memory' | 'disk' | 'memory-disk' = 'memory-disk'
  ): Promise<boolean> {
    try {
      if (this.preloadQueue.has(uri)) {
        return true; // Already preloaded or in queue
      }

      this.preloadQueue.add(uri);
      
      await Image.prefetch(uri, { cachePolicy });

      return true;
    } catch (error) {
      console.warn(`Failed to preload single image ${uri}:`, error);
      this.preloadQueue.delete(uri);
      return false;
    }
  }

  /**
   * Check if an image is cached
   */
  static isImageCached(uri: string): boolean {
    return this.preloadQueue.has(uri);
  }

  /**
   * Warm up cache with most important images
   */
  static async warmUpCache(images: ImageMeta[], count: number = 20): Promise<void> {
    const priorityImages = images
      .slice(0, count)
      .map(img => img.uri);

    await this.preloadImages(priorityImages, 'high');
  }

  /**
   * Preload images in batches with different cache policies based on priority
   */
  static async preloadWithPriority(
    highPriorityUris: string[] = [],
    normalPriorityUris: string[] = [],
    lowPriorityUris: string[] = []
  ): Promise<void> {
    // High priority - memory-disk cache
    if (highPriorityUris.length > 0) {
      await Promise.all(
        highPriorityUris.map(uri => 
          Image.prefetch(uri, { cachePolicy: 'memory-disk' })
            .catch(error => console.warn(`Failed to preload high priority image ${uri}:`, error))
        )
      );
    }

    // Normal priority - memory-disk cache with delay
    if (normalPriorityUris.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await Promise.all(
        normalPriorityUris.map(uri => 
          Image.prefetch(uri, { cachePolicy: 'memory-disk' })
            .catch(error => console.warn(`Failed to preload normal priority image ${uri}:`, error))
        )
      );
    }

    // Low priority - disk cache only with longer delay
    if (lowPriorityUris.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
      await Promise.all(
        lowPriorityUris.map(uri => 
          Image.prefetch(uri, { cachePolicy: 'disk' })
            .catch(error => console.warn(`Failed to preload low priority image ${uri}:`, error))
        )
      );
    }
  }
}