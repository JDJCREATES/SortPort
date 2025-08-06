/**
 * Compression Cache Service - manages compression cache with enhanced debugging
 */
import { logInfo, logDebug, logVerbose, logWarn, logError } from '../shared/LoggingConfig';

export class CompressionCacheService {
  private compressionCache = new Map<string, string>();
  private compressionCacheReverse = new Map<string, string>();
  private maxCacheSize: number;
  
  constructor(maxCacheSize: number = 200) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Set cache entry with validation and reverse mapping
   */
  set(originalUri: string, compressedUri: string): void {
    // Always update forward mapping
    this.compressionCache.set(originalUri, compressedUri);
    
    // Only set reverse mapping if compression actually succeeded (different URIs)
    if (compressedUri !== originalUri) {
      this.compressionCacheReverse.set(compressedUri, originalUri);
      logVerbose(`💾 Cached: ${originalUri.substring(originalUri.lastIndexOf('/') + 1)} -> ${compressedUri.substring(compressedUri.lastIndexOf('/') + 1)}`);
    } else {
      logVerbose(`💾 Cached fallback: ${originalUri.substring(originalUri.lastIndexOf('/') + 1)} (compression failed)`);
    }
    
    // Auto-cleanup if needed
    if (this.compressionCache.size > this.maxCacheSize * 1.5) {
      this.clearOldEntries();
    }
  }

  /**
   * Get compressed URI from cache
   */
  get(originalUri: string): string | undefined {
    return this.compressionCache.get(originalUri);
  }

  /**
   * Get original URI from compressed URI (reverse lookup)
   */
  getOriginal(compressedUri: string): string | undefined {
    return this.compressionCacheReverse.get(compressedUri) || compressedUri;
  }

  /**
   * Check if URI is cached
   */
  has(originalUri: string): boolean {
    return this.compressionCache.has(originalUri);
  }

  /**
   * Get cache status for a batch of URIs
   */
  getBatchStatus(uris: string[]): {
    hits: string[];
    misses: string[];
    hitRate: number;
  } {
    const hits: string[] = [];
    const misses: string[] = [];
    
    uris.forEach(uri => {
      if (this.has(uri)) {
        hits.push(uri);
      } else {
        misses.push(uri);
      }
    });
    
    const hitRate = uris.length > 0 ? (hits.length / uris.length) * 100 : 0;
    
    return { hits, misses, hitRate };
  }

  /**
   * Clear old cache entries when over limit
   */
  clearOldEntries(): void {
    const clearThreshold = this.maxCacheSize * 1.5;
    
    if (this.compressionCache.size > clearThreshold) {
      const entriesToClear = this.compressionCache.size - this.maxCacheSize;
      const keysToDelete = Array.from(this.compressionCache.keys()).slice(0, entriesToClear);
      
      console.log(`🧹 Cache cleanup: Removing ${entriesToClear} entries (${this.compressionCache.size} -> ${this.maxCacheSize})`);
      
      keysToDelete.forEach(originalUri => {
        const compressedUri = this.compressionCache.get(originalUri);
        this.compressionCache.delete(originalUri);
        if (compressedUri && compressedUri !== originalUri) {
          this.compressionCacheReverse.delete(compressedUri);
        }
      });
      
      console.log(`✅ Cache cleanup complete: ${this.compressionCache.size} entries remaining`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const beforeSize = this.compressionCache.size;
    this.compressionCache.clear();
    this.compressionCacheReverse.clear();
    console.log(`🗑️ Cache cleared: ${beforeSize} entries removed`);
  }

  /**
   * Update cache size limit
   */
  setMaxSize(newSize: number): void {
    this.maxCacheSize = newSize;
    logInfo(`⚙️ Cache size limit updated: ${newSize}`);
    
    // Trigger cleanup if current size exceeds new limit
    if (this.compressionCache.size > newSize) {
      this.clearOldEntries();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    usage: number;
    forwardEntries: number;
    reverseEntries: number;
  } {
    const size = this.compressionCache.size;
    const usage = this.maxCacheSize > 0 ? (size / this.maxCacheSize) * 100 : 0;
    
    return {
      size,
      maxSize: this.maxCacheSize,
      usage,
      forwardEntries: this.compressionCache.size,
      reverseEntries: this.compressionCacheReverse.size
    };
  }

  /**
   * Debug method to log cache contents
   */
  debugLogCache(maxEntries: number = 10): void {
    const stats = this.getStats();
    console.log(`🔍 Cache Debug:`, stats);
    
    if (this.compressionCache.size > 0) {
      console.log(`📋 First ${Math.min(maxEntries, this.compressionCache.size)} entries:`);
      let count = 0;
      this.compressionCache.forEach((compressed, original) => {
        if (count >= maxEntries) return;
        const originalName = original.substring(original.lastIndexOf('/') + 1);
        const compressedName = compressed.substring(compressed.lastIndexOf('/') + 1);
        console.log(`  ${count + 1}. ${originalName} -> ${compressedName}`);
        count++;
      });
    }
  }
}
