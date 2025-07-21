import { useEffect, useRef, useCallback } from 'react';
import { ImageCacheManager } from '../utils/imageCache';
import { ImageMeta } from '../types';

interface UseImagePreloaderOptions {
  images: ImageMeta[];
  currentIndex: number;
  lookahead?: number;
  enabled?: boolean;
}

/**
 * Enhanced hook for seamless infinite scroll with intelligent image preloading
 * - Velocity-based aggressive preloading during fast scroll
 * - Bidirectional preloading (ahead and behind current position)
 * - Memory-aware cache management
 * - Zero-delay critical image loading
 */
export function useImagePreloader({
  images,
  currentIndex,
  lookahead = 25,
  enabled = true,
}: UseImagePreloaderOptions) {
  const lastIndexRef = useRef(-1);
  const lastTimestampRef = useRef(Date.now());
  const velocityRef = useRef(0);
  const preloadingRef = useRef(false);
  const criticalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate scroll velocity for intelligent preloading
  const calculateVelocity = useCallback((newIndex: number) => {
    const now = Date.now();
    const timeDelta = now - lastTimestampRef.current;
    const indexDelta = Math.abs(newIndex - lastIndexRef.current);
    
    if (timeDelta > 0) {
      velocityRef.current = (indexDelta / timeDelta) * 1000; // items per second
    }
    
    lastIndexRef.current = newIndex;
    lastTimestampRef.current = now;
    
    return velocityRef.current;
  }, []);

  // Critical preloading - immediate vicinity with zero delay
  const preloadCritical = useCallback(async (index: number, velocity: number) => {
    if (preloadingRef.current) return;
    preloadingRef.current = true;

    try {
      // High velocity = more aggressive preloading (but less aggressive than before)
      const isHighVelocity = velocity > 3; // Increased threshold
      const criticalLookahead = isHighVelocity ? Math.min(lookahead * 1.5, 50) : lookahead; // Reduced multiplier
      const criticalBehind = Math.min(15, Math.floor(criticalLookahead / 3));

      // Bidirectional critical range
      const startIndex = Math.max(0, index - criticalBehind);
      const endIndex = Math.min(images.length, index + criticalLookahead);

      // Split into priority zones
      const immediateStart = Math.max(startIndex, index - 5);
      const immediateEnd = Math.min(endIndex, index + 15);
      const extendedStart = startIndex;
      const extendedEnd = endIndex;

      // Immediate zone - highest priority, zero delay
      const immediateImages = images
        .slice(immediateStart, immediateEnd)
        .map(img => img.uri)
        .filter(uri => !ImageCacheManager.isImageCached(uri)); // Avoid re-preloading

      if (immediateImages.length > 0) {
        await ImageCacheManager.preloadImages(immediateImages, 'high');
      }

      // Extended zone - normal priority, slight delay
      const extendedImages = images
        .slice(extendedStart, immediateStart)
        .concat(images.slice(immediateEnd, extendedEnd))
        .map(img => img.uri)
        .filter(uri => !ImageCacheManager.isImageCached(uri)); // Avoid re-preloading

      if (extendedImages.length > 0) {
        setTimeout(() => {
          ImageCacheManager.preloadImages(extendedImages, 'normal');
        }, isHighVelocity ? 10 : 25);
      }

    } finally {
      preloadingRef.current = false;
    }
  }, [images, lookahead]);

  // Background preloading - fill gaps during idle time
  const scheduleBackgroundPreload = useCallback((index: number) => {
    if (backgroundTimeoutRef.current) {
      clearTimeout(backgroundTimeoutRef.current);
    }

    backgroundTimeoutRef.current = setTimeout(() => {
      // Fill any gaps in a wider range around current position
      const wideStart = Math.max(0, index - 30);
      const wideEnd = Math.min(images.length, index + 60);
      
      const backgroundImages = images
        .slice(wideStart, wideEnd)
        .map(img => img.uri)
        .filter(uri => !ImageCacheManager.isImageCached(uri)); // Avoid re-preloading

      if (backgroundImages.length > 0) {
        ImageCacheManager.preloadImages(backgroundImages, 'low');
      }
    }, 300); // Only after brief idle period
  }, [images]);

  useEffect(() => {
    if (!enabled || images.length === 0) return;

    const velocity = calculateVelocity(currentIndex);
    
    // Clear any pending critical preload
    if (criticalTimeoutRef.current) {
      clearTimeout(criticalTimeoutRef.current);
    }

    // More conservative delay calculation to prevent thumbnail conflicts
    const delay = velocity > 5 ? 0 : velocity > 2 ? 50 : 100;

    criticalTimeoutRef.current = setTimeout(() => {
      preloadCritical(currentIndex, velocity);
    }, delay);

    // Schedule background preloading
    scheduleBackgroundPreload(currentIndex);

    return () => {
      if (criticalTimeoutRef.current) {
        clearTimeout(criticalTimeoutRef.current);
      }
    };
  }, [currentIndex, enabled, calculateVelocity, preloadCritical, scheduleBackgroundPreload]);

  // Initial warm-up preload
  useEffect(() => {
    if (enabled && images.length > 0 && currentIndex === 0) {
      // Preload first batch immediately for initial load
      ImageCacheManager.warmUpCache(images, 40);
    }
  }, [enabled, images, currentIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (criticalTimeoutRef.current) {
        clearTimeout(criticalTimeoutRef.current);
      }
      if (backgroundTimeoutRef.current) {
        clearTimeout(backgroundTimeoutRef.current);
      }
    };
  }, []);
}