import { Image } from 'expo-image';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';

export class ImageCacheManager {
  private static preloadQueue: Set<string> = new Set();
  private static isPreloading = false;
  private static readonly PRELOAD_BATCH_SIZE = 10;
  private static readonly PRELOAD_DELAY = 50;

  /**
   * Preload images for better performance using Expo Image
   */
  static async preloadImages(uris: string[], priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    const sources = uris
      .filter(uri => !this.preloadQueue.has(uri))
      .map(uri => {
        this.preloadQueue.add(uri);
        return uri;
      });

    if (sources.length === 0) return;

    try {
      // Batch preload to avoid overwhelming the system
      for (let i = 0; i < sources.length; i += this.PRELOAD_BATCH_SIZE) {
        const batch = sources.slice(i, i + this.PRELOAD_BATCH_SIZE);
        
        // Preload each image in the batch
        await Promise.all(
          batch.map(uri => 
            Image.prefetch(uri, {
              cachePolicy: 'memory-disk'
            }).catch(error => {
              console.warn(`Failed to preload image ${uri}:`, error);
              // Remove from queue if preload fails
              this.preloadQueue.delete(uri);
            })
          )
        );
        
        // Small delay between batches to prevent overwhelming
        if (i + this.PRELOAD_BATCH_SIZE < sources.length) {
          await new Promise(resolve => setTimeout(resolve, this.PRELOAD_DELAY));
        }
      }
    } catch (error) {
      console.warn('Error preloading images:', error);
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
      
      // Clear our preload queue
      this.preloadQueue.clear();
      
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
   * Remove URI from preload queue
   */
  static removeFromPreloadQueue(uri: string): void {
    this.preloadQueue.delete(uri);
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