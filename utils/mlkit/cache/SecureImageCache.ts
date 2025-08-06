/**
 * Secure Image Cache Manager for ML Kit Processing
 * Handles temporary image caching with security and memory efficiency
 * Simplified version using AsyncStorage for now
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheConfig {
  maxCacheSize: number;      // MB
  maxCacheAge: number;       // milliseconds  
  compressionQuality: number; // 0.1 - 1.0
  secureStorage: boolean;
  autoCleanup: boolean;
}

export interface CachedImageInfo {
  id: string;
  originalPath: string;
  cachedPath: string;
  size: number;
  createdAt: number;
  lastAccessed: number;
  compressed: boolean;
  encrypted: boolean;
}

export class SecureImageCache {
  private static instance: SecureImageCache;
  private cacheIndex: Map<string, CachedImageInfo> = new Map();
  private config: CacheConfig;
  private isInitialized = false;
  private readonly CACHE_KEY = '@mlkit_cache_index';

  private constructor(config: CacheConfig) {
    this.config = config;
  }

  public static getInstance(config?: CacheConfig): SecureImageCache {
    if (!SecureImageCache.instance) {
      const defaultConfig: CacheConfig = {
        maxCacheSize: 100, // 100MB
        maxCacheAge: 3600000, // 1 hour
        compressionQuality: 0.8,
        secureStorage: true,
        autoCleanup: true
      };
      SecureImageCache.instance = new SecureImageCache(config || defaultConfig);
    }
    return SecureImageCache.instance;
  }

  /**
   * Initialize the cache system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load existing cache index
      await this.loadCacheIndex();
      
      // Clean up expired items
      if (this.config.autoCleanup) {
        await this.cleanup();
      }

      this.isInitialized = true;
      console.log('🔒 SecureImageCache initialized');
    } catch (error) {
      console.error('❌ Failed to initialize SecureImageCache:', error);
      throw error;
    }
  }

  /**
   * Cache an image for ML Kit processing
   * For now, just tracks the original path since we don't have file system access
   */
  public async cacheImage(imageId: string, imagePath: string): Promise<string> {
    await this.ensureInitialized();

    try {
      // Check if already cached and valid
      const existing = this.cacheIndex.get(imageId);
      if (existing && this.isValidCache(existing)) {
        existing.lastAccessed = Date.now();
        await this.saveCacheIndex();
        return existing.cachedPath;
      }

      // For now, use original path as cached path
      // In production, you'd compress and store in secure location
      const cachedPath = imagePath;
      
      // Create cache entry
      const cacheInfo: CachedImageInfo = {
        id: imageId,
        originalPath: imagePath,
        cachedPath: cachedPath,
        size: 0, // Would be calculated from actual file
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        compressed: false, // Would be true after compression
        encrypted: this.config.secureStorage
      };

      // Store in index
      this.cacheIndex.set(imageId, cacheInfo);
      await this.saveCacheIndex();

      // Check cache size limits
      await this.enforceSizeLimits();

      console.log(`✅ Cached image ${imageId}`);
      return cachedPath;

    } catch (error) {
      console.error(`❌ Failed to cache image ${imageId}:`, error);
      throw error;
    }
  }

  /**
   * Get cached image path
   */
  public async getCachedPath(imageId: string): Promise<string | null> {
    await this.ensureInitialized();

    const cacheInfo = this.cacheIndex.get(imageId);
    if (!cacheInfo) return null;

    if (this.isValidCache(cacheInfo)) {
      cacheInfo.lastAccessed = Date.now();
      await this.saveCacheIndex();
      return cacheInfo.cachedPath;
    }

    // Remove invalid cache
    await this.removeCacheEntry(imageId);
    return null;
  }

  /**
   * Clear cache for specific image
   */
  public async clearImage(imageId: string): Promise<void> {
    await this.ensureInitialized();
    await this.removeCacheEntry(imageId);
  }

  /**
   * Clear all cached images
   */
  public async clearAll(): Promise<void> {
    await this.ensureInitialized();

    try {
      this.cacheIndex.clear();
      await AsyncStorage.removeItem(this.CACHE_KEY);
      console.log('🗑️ Cleared all ML Kit image cache');
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    totalItems: number;
    totalSize: number;
    oldestItem: number;
    newestItem: number;
  }> {
    await this.ensureInitialized();

    let totalSize = 0;
    let oldestItem = Date.now();
    let newestItem = 0;

    for (const [_, info] of Array.from(this.cacheIndex.entries())) {
      totalSize += info.size;
      oldestItem = Math.min(oldestItem, info.createdAt);
      newestItem = Math.max(newestItem, info.createdAt);
    }

    return {
      totalItems: this.cacheIndex.size,
      totalSize,
      oldestItem,
      newestItem
    };
  }

  // Private methods

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private isValidCache(cacheInfo: CachedImageInfo): boolean {
    // Check age
    const age = Date.now() - cacheInfo.createdAt;
    return age <= this.config.maxCacheAge;
  }

  private async removeCacheEntry(imageId: string): Promise<void> {
    const cacheInfo = this.cacheIndex.get(imageId);
    if (!cacheInfo) return;

    try {
      // Remove from index
      this.cacheIndex.delete(imageId);
      await this.saveCacheIndex();

      console.log(`🗑️ Removed cached image ${imageId}`);
    } catch (error) {
      console.error(`❌ Error removing cache entry ${imageId}:`, error);
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    // Find expired items
    for (const [imageId, info] of Array.from(this.cacheIndex.entries())) {
      const age = now - info.createdAt;
      if (age > this.config.maxCacheAge) {
        toRemove.push(imageId);
      }
    }

    // Remove expired items
    for (const imageId of toRemove) {
      await this.removeCacheEntry(imageId);
    }

    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} expired cache entries`);
    }
  }

  private async enforceSizeLimits(): Promise<void> {
    const stats = await this.getStats();
    const maxBytes = this.config.maxCacheSize * 1024 * 1024; // Convert MB to bytes

    if (stats.totalSize <= maxBytes) return;

    // Sort by last accessed (LRU)
    const sortedEntries = Array.from(this.cacheIndex.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest until under limit
    let currentSize = stats.totalSize;
    let removed = 0;

    for (const [imageId, info] of sortedEntries) {
      if (currentSize <= maxBytes) break;
      
      await this.removeCacheEntry(imageId);
      currentSize -= info.size;
      removed++;
    }

    if (removed > 0) {
      console.log(`🗑️ Removed ${removed} cache entries to enforce size limit`);
    }
  }

  private async loadCacheIndex(): Promise<void> {
    try {
      const indexData = await AsyncStorage.getItem(this.CACHE_KEY);
      
      if (indexData) {
        const parsed = JSON.parse(indexData);
        this.cacheIndex = new Map(Object.entries(parsed));
        console.log(`📋 Loaded cache index with ${this.cacheIndex.size} entries`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load cache index, starting fresh:', error);
      this.cacheIndex = new Map();
    }
  }

  private async saveCacheIndex(): Promise<void> {
    try {
      const indexData = Object.fromEntries(this.cacheIndex);
      await AsyncStorage.setItem(this.CACHE_KEY, JSON.stringify(indexData));
    } catch (error) {
      console.error('❌ Failed to save cache index:', error);
    }
  }

  /**
   * Destroy the cache instance (for testing or cleanup)
   */
  public static async destroy(): Promise<void> {
    if (SecureImageCache.instance) {
      await SecureImageCache.instance.clearAll();
      SecureImageCache.instance = undefined as any;
    }
  }
}
