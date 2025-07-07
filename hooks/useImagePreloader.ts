import { useEffect, useRef } from 'react';
import { ImageCacheManager } from '../utils/imageCache';
import { ImageMeta } from '../types';

interface UseImagePreloaderOptions {
  images: ImageMeta[];
  currentIndex: number;
  lookahead?: number;
  enabled?: boolean;
}

/**
 * Hook to automatically preload upcoming images based on current scroll position
 */
export function useImagePreloader({
  images,
  currentIndex,
  lookahead = 10,
  enabled = true,
}: UseImagePreloaderOptions) {
  const lastPreloadIndex = useRef(-1);
  const preloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // ✅ Even better: Use ReturnType

  useEffect(() => {
    if (!enabled || images.length === 0) return;

    // Clear any pending preload
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }

    // Debounce preloading to avoid excessive calls during fast scrolling
    preloadTimeoutRef.current = setTimeout(() => {
      const preloadIndex = Math.floor(currentIndex / 5) * 5; // Preload in chunks of 5
      
      if (preloadIndex !== lastPreloadIndex.current) {
        lastPreloadIndex.current = preloadIndex;
        ImageCacheManager.preloadUpcomingImages(images, currentIndex, lookahead);
      }
    }, 200);

    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, [images, currentIndex, lookahead, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, []);
}