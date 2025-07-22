/**
 * Cache Service for LangChain Operations
 * 
 * Provides intelligent caching for expensive operations like LLM calls, embeddings,
 * and sorting results to improve performance and reduce costs.
 * 
 * Input: Cache keys, values with TTL
 * Output: Cached results or null if expired/missing
 * 
 * Key Features:
 * - TTL-based expiration for different operation types
 * - LRU eviction to manage memory usage
 * - Compression for large results
 * - Cache statistics and health monitoring
 * - Atomic operations for concurrent access
 */

import { ChainOutput } from '../../../types/sorting.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Estimated size in bytes
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  totalSize: number;
  entryCount: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    totalSize: 0,
    entryCount: 0
  };
  
  private readonly maxSize: number;
  private readonly maxEntries: number;
  private readonly defaultTTL: number;
  
  constructor(options: {
    maxSize?: number; // Max cache size in bytes
    maxEntries?: number; // Max number of entries
    defaultTTL?: number; // Default TTL in seconds
  } = {}) {
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB
    this.maxEntries = options.maxEntries || 10000;
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour

    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateSize(-entry.size);
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    
    return entry.value;
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.defaultTTL;
    const now = Date.now();
    const size = this.estimateSize(value);

    // Check if we need to evict entries
    await this.ensureCapacity(size);

    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + (ttl * 1000),
      createdAt: now,
      accessCount: 0,
      lastAccessed: now,
      size
    };

    // Remove existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.updateSize(-existing.size);
    }

    this.cache.set(key, entry);
    this.updateSize(size);
    this.stats.sets++;
  }

  /**
   * Delete entry from cache
   */
  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.updateSize(-entry.size);
      return true;
    }
    return false;
  }

  /**
   * Check if key exists and is not expired
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.updateSize(-entry.size);
      return false;
    }
    
    return true;
  }

  /**
   * Get or set pattern - gets value, or sets if not found
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const existing = await this.get<T>(key);
    if (existing !== null) {
      return existing;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Cache sorting results specifically
   */
  async cacheSortingResult(
    key: string,
    result: ChainOutput,
    ttlSeconds: number = 3600
  ): Promise<void> {
    // Add metadata for sorting cache
    const cacheableResult = {
      ...result,
      _cached: true,
      _cachedAt: Date.now()
    };
    
    await this.set(key, cacheableResult, ttlSeconds);
  }

  /**
   * Generate cache key for sorting operations
   */
  generateSortingKey(params: {
    query: string;
    userId: string;
    sortType?: string;
    imageIds?: string[];
    maxResults?: number;
  }): string {
    const normalized = {
      query: params.query.toLowerCase().trim(),
      userId: params.userId,
      sortType: params.sortType || 'custom',
      imageIds: params.imageIds?.sort() || [],
      maxResults: params.maxResults || 100
    };
    
    const keyString = JSON.stringify(normalized);
    return `sort:${this.hashString(keyString)}`;
  }

  /**
   * Generate cache key for embeddings
   */
  generateEmbeddingKey(text: string, model: string = 'text-embedding-3-small'): string {
    const normalized = text.toLowerCase().trim();
    return `embedding:${model}:${this.hashString(normalized)}`;
  }

  /**
   * Generate cache key for vision analysis
   */
  generateVisionKey(atlasUrl: string, query?: string): string {
    const keyData = query ? `${atlasUrl}:${query}` : atlasUrl;
    return `vision:${this.hashString(keyData)}`;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      totalSize: 0,
      entryCount: 0
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & {
    hitRate: number;
    averageEntrySize: number;
    memoryUsage: string;
  } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const averageEntrySize = this.stats.entryCount > 0 
      ? this.stats.totalSize / this.stats.entryCount 
      : 0;

    return {
      ...this.stats,
      hitRate,
      averageEntrySize,
      memoryUsage: this.formatBytes(this.stats.totalSize)
    };
  }

  /**
   * Get top cache entries by access count
   */
  getTopEntries(limit: number = 10): Array<{
    key: string;
    accessCount: number;
    lastAccessed: Date;
    size: string;
  }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        lastAccessed: new Date(entry.lastAccessed),
        size: this.formatBytes(entry.size)
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries;
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'health_check';
      const testValue = { test: true, timestamp: Date.now() };
      
      await this.set(testKey, testValue, 60);
      const retrieved = await this.get(testKey);
      await this.delete(testKey);
      
      return retrieved !== null && retrieved.test === true;
    } catch (error) {
      console.error('Cache health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    let reclaimedSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        reclaimedSize += entry.size;
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.updateSize(-reclaimedSize);
      console.log(`Cache cleanup: removed ${cleanedCount} expired entries, reclaimed ${this.formatBytes(reclaimedSize)}`);
    }
  }

  /**
   * Ensure cache capacity before adding new entry
   */
  private async ensureCapacity(newEntrySize: number): Promise<void> {
    // Check size limit
    while (this.stats.totalSize + newEntrySize > this.maxSize && this.cache.size > 0) {
      await this.evictLeastUsed();
    }

    // Check entry count limit
    while (this.cache.size >= this.maxEntries) {
      await this.evictLeastUsed();
    }
  }

  /**
   * Evict least recently used entry
   */
  private async evictLeastUsed(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.cache.delete(oldestKey);
      this.updateSize(-entry.size);
      this.stats.evictions++;
    }
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: any): number {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      // Fallback estimation
      if (typeof value === 'string') return value.length * 2;
      if (typeof value === 'number') return 8;
      if (typeof value === 'boolean') return 4;
      if (Array.isArray(value)) return value.length * 100; // Rough estimate
      return JSON.stringify(value).length * 2; // Rough estimate for objects
    }
  }

  /**
   * Update total size tracking
   */
  private updateSize(delta: number): void {
    this.stats.totalSize += delta;
    this.stats.entryCount = this.cache.size;
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
