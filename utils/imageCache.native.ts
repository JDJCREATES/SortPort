import FastImage from 'react-native-fast-image';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';

export class ImageCacheManager {
  private static preloadQueue: Set<string> = new Set();
  private static isPreloading = false;
  private static readonly PRELOAD_BATCH_SIZE = 5;
  private static readonly PRELOAD_DELAY = 100; // ms between preloads

  /**
   * Preload images for better performance
   */
  static async preloadImages(uris: string[], priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    const fastImagePriority = priority === 'high' 
      ? FastImage.priority.high 
      : priority === 'low' 
      ? FastImage.priority.low 
      : FastImage.priority.normal;

    const sources = uris
      .filter(uri => !this.preloadQueue.has(uri))
      .map(uri => {
        this.preloadQueue.add(uri);
        return { uri, priority: fastImagePriority };
      });

    if (sources.length === 0) return;

    try {
      // Batch preload to avoid overwhelming the system
      for (let i = 0; i < sources.length; i += this.PRELOAD_BATCH_SIZE) {
        const batch = sources.slice(i, i + this.PRELOAD_BATCH_SIZE);
        await FastImage.preload(batch);
        
        // Small delay between batches
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
    lookahead: number = 10
  ): void {
    const upcomingImages = allImages
      .slice(currentIndex, currentIndex + lookahead)
      .map(img => img.uri);

    if (upcomingImages.length > 0) {
      this.preloadImages(upcomingImages, 'normal');
    }
  }

  /**
   * Clear image caches
   */
  static async clearCache(): Promise<void> {
    try {
      await FastImage.clearMemoryCache();
      await FastImage.clearDiskCache();
      this.preloadQueue.clear();
    } catch (error) {
      console.warn('Error clearing image cache:', error);
    }
  }

  /**
   * Get cache statistics (for debugging)
   */
  static getCacheStats(): { preloadQueueSize: number } {
    return {
      preloadQueueSize: this.preloadQueue.size,
    };
  }

  /**
   * Remove URI from preload queue
   */
  static removeFromPreloadQueue(uri: string): void {
    this.preloadQueue.delete(uri);
  }
}