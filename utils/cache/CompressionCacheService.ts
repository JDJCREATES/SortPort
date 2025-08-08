/**
 * Compression Cache Service - manages compression cache with enhanced debugging
 */
import { logInfo, logDebug, logVerbose, logWarn, logError } from '../shared/LoggingConfig';

export class CompressionCacheService {
  private compressionCache = new Map<string, string>();
  private compressionCacheReverse = new Map<string, string>();
  private maxCacheSize: number;
  private processingLocked = false; // Prevent cleanup during active processing
  private debugCacheAccess = false; // Enable for debugging cache access patterns
  
  constructor(maxSize: number = 200) {
    this.maxCacheSize = maxSize;
  }

  /**
   * Check if cache is locked for processing
   */
  isProcessingLocked(): boolean {
    return this.processingLocked;
  }

  /**
   * Lock cache to prevent cleanup during active processing
   */
  lockProcessing(): void {
    this.processingLocked = true;
    console.log(`🔒 Cache locked for processing - cleanup disabled`);
  }

  /**
   * Unlock cache to allow cleanup after processing
   */
  unlockProcessing(): void {
    this.processingLocked = false;
    console.log(`🔓 Cache unlocked - cleanup enabled`);
    
    // Perform cleanup now that processing is done
    if (this.compressionCache.size > this.maxCacheSize * 1.5) {
      this.clearOldEntries();
    }
  }

  /**
   * Add to cache
   */
  set(originalUri: string, compressedUri: string): void {
    this.compressionCache.set(originalUri, compressedUri);
    if (originalUri !== compressedUri) {
      this.compressionCacheReverse.set(compressedUri, originalUri);
    }
    
    // Trigger cleanup if cache is getting too large and not locked
    if (!this.processingLocked && this.compressionCache.size > this.maxCacheSize * 1.5) {
      this.clearOldEntries();
    }
  }

  /**
   * Get compressed URI from cache with file validation logging
   */
  get(originalUri: string): string | undefined {
    const compressedUri = this.compressionCache.get(originalUri);
    
    // Only log cache access when debugging is enabled (to reduce terminal spam)
    if (this.debugCacheAccess && compressedUri && compressedUri !== originalUri) {
      console.log(`🔍 Cache access: ${originalUri.substring(originalUri.lastIndexOf('/') + 1)} → ${compressedUri.substring(compressedUri.lastIndexOf('/') + 1)}`);
    }
    
    return compressedUri;
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
   * Remove from cache
   */
  delete(originalUri: string): boolean {
    const compressedUri = this.compressionCache.get(originalUri);
    const deleted = this.compressionCache.delete(originalUri);
    
    if (compressedUri && compressedUri !== originalUri) {
      this.compressionCacheReverse.delete(compressedUri);
    }
    
    return deleted;
  }

  /**
   * Enable or disable debug cache access logging
   */
  setDebugCacheAccess(enabled: boolean): void {
    this.debugCacheAccess = enabled;
    console.log(`🔧 Cache access debugging ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; locked: boolean } {
    return {
      size: this.compressionCache.size,
      maxSize: this.maxCacheSize,
      locked: this.processingLocked
    };
  }

  /**
   * Set maximum cache size
   */
  setMaxSize(maxSize: number): void {
    this.maxCacheSize = maxSize;
    if (!this.processingLocked && this.compressionCache.size > this.maxCacheSize * 1.5) {
      this.clearOldEntries();
    }
  }

  /**
   * Clear old cache entries when over limit
   */
  clearOldEntries(): void {
    // Don't clear cache if currently processing
    if (this.isProcessingLocked()) {
      console.log(`⏸️ Cache cleanup skipped: Processing is locked (${new Date().toISOString()})`);
      return;
    }

    const clearThreshold = this.maxCacheSize * 1.5;
    
    if (this.compressionCache.size > clearThreshold) {
      const entriesToClear = this.compressionCache.size - this.maxCacheSize;
      const keysToDelete = Array.from(this.compressionCache.keys()).slice(0, entriesToClear);
      
      console.log(`🧹 Cache cleanup starting at ${new Date().toISOString()}: Removing ${entriesToClear} entries (${this.compressionCache.size} -> ${this.maxCacheSize})`);
      
      // Log which files are being deleted for debugging
      keysToDelete.forEach(originalUri => {
        const compressedUri = this.compressionCache.get(originalUri);
        console.log(`🗑️ Deleting cache entry: ${originalUri.substring(originalUri.lastIndexOf('/') + 1)} → ${compressedUri?.substring(compressedUri.lastIndexOf('/') + 1) || 'none'}`);
        this.compressionCache.delete(originalUri);
        if (compressedUri && compressedUri !== originalUri) {
          this.compressionCacheReverse.delete(compressedUri);
        }
      });
      
      console.log(`✅ Cache cleanup complete at ${new Date().toISOString()}: ${this.compressionCache.size} entries remaining`);
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
   * Get all cached entries
   */
  entries(): [string, string][] {
    return Array.from(this.compressionCache.entries());
  }

  /**
   * Add multiple entries to cache
   */
  addToCache(originalUri: string, compressedUri: string): void {
    this.set(originalUri, compressedUri);
    
    // Cleanup after addition if needed
    if (!this.processingLocked && this.compressionCache.size > this.maxCacheSize * 1.5) {
      this.clearOldEntries();
    }
  }

  /**
   * Get batch status for multiple URIs
   */
  getBatchStatus(uris: string[]): {
    hits: string[];
    misses: string[];
    hitRate: number;
  } {
    const hits: string[] = [];
    const misses: string[] = [];

    for (const uri of uris) {
      if (this.compressionCache.has(uri)) {
        hits.push(uri);
      } else {
        misses.push(uri);
      }
    }

    const hitRate = uris.length > 0 ? (hits.length / uris.length) * 100 : 0;

    return {
      hits,
      misses,
      hitRate
    };
  }

  /**
   * Debug log cache contents
   */
  debugLogCache(maxEntries: number = 10): void {
    const entries = Array.from(this.compressionCache.entries()).slice(0, maxEntries);
    
    console.log(`🔍 Cache Debug (showing ${entries.length}/${this.compressionCache.size} entries):`);
    console.log(`📊 Cache Stats: Size=${this.compressionCache.size}, Max=${this.maxCacheSize}, Locked=${this.processingLocked}`);
    
    if (entries.length === 0) {
      console.log(`   (Cache is empty)`);
      return;
    }

    entries.forEach(([original, compressed], index) => {
      const originalName = original.substring(original.lastIndexOf('/') + 1);
      const compressedName = compressed.substring(compressed.lastIndexOf('/') + 1);
      const isCompressed = original !== compressed;
      
      console.log(`   ${index + 1}. ${originalName} → ${isCompressed ? compressedName : '(original)'}`);
    });

    if (this.compressionCache.size > maxEntries) {
      console.log(`   ... and ${this.compressionCache.size - maxEntries} more entries`);
    }
  }
}
