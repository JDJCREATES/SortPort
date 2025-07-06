import { Platform } from 'react-native';
import { ImageMeta } from '../types';

export class ImageCacheManager {
  private static preloadQueue: Set<string> = new Set();
  private static isPreloading = false;
  private static readonly PRELOAD_BATCH_SIZE = 5;
  private static readonly PRELOAD_DELAY = 100; // ms between preloads

  /**
   * Preload images for better performance (Web implementation)
   */
  static async preloadImages(uris: string[], priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    const promises = uris
      .filter(uri => !this.preloadQueue.has(uri))
      .map(uri => {
        this.preloadQueue.add(uri);
        return new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Failed to preload ${uri}`));
          img.src = uri;
        });
      });

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.warn('Error preloading images on web:', error);
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
   * Clear image caches (Web implementation)
   */
  static async clearCache(): Promise<void> {
    // Web doesn't have a direct cache clear method
    this.preloadQueue.clear();
    
    // Clear browser cache if possible (limited in web environment)
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      } catch (error) {
        console.warn('Error clearing web cache:', error);
      }
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