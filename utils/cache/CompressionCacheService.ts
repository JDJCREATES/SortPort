/**
 * Compression Cache Service - manages compression cache with enhanced debugging and path normalization
 */
import { logInfo, logDebug, logVerbose, logWarn, logError } from '../shared/LoggingConfig';

export class CompressionCacheService {
  private compressionCache = new Map<string, string>();
  private compressionCacheReverse = new Map<string, string>();
  private pathNormalizationMap = new Map<string, string>(); // normalized key -> original path
  private maxCacheSize: number;
  private processingLocked = false; // Prevent cleanup during active processing
  private debugCacheAccess = false; // Enable for debugging cache access patterns
  private cacheFormatVersion = '1.1'; // Added for path normalization compatibility
  
  constructor(maxSize: number = 200) {
    this.maxCacheSize = maxSize;
    // For now, always clear cache on initialization to ensure compatibility
    // TODO: Remove this aggressive clearing once all clients are using normalized keys
    console.log('🧹 CompressionCacheService: Clearing cache for path normalization compatibility');
  }

  /**
   * Normalize path for use as cache key - removes problematic characters
   */
  private normalizePath(path: string): string {
    // Create a stable, safe key from the path
    // Remove/replace characters that cause issues in cache keys
    return path
      .replace(/[;()[\]{}|\\/"'`~!@#$%^&*+= ]/g, '_') // Replace problematic chars with underscore
      .replace(/_+/g, '_') // Collapse multiple underscores
      .toLowerCase(); // Normalize case
  }

  /**
   * Get original path from normalized key
   */
  private getOriginalPath(normalizedKey: string): string {
    return this.pathNormalizationMap.get(normalizedKey) || normalizedKey;
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
   * Add to cache (file should already be validated by compression service)
   */
  set(originalUri: string, compressedUri: string): void {
    const normalizedKey = this.normalizePath(originalUri);
    
    // Store the mapping from normalized key to original path
    this.pathNormalizationMap.set(normalizedKey, originalUri);
    
    // Since compression service already validated the file, we can cache immediately
    this.compressionCache.set(normalizedKey, compressedUri);
    if (originalUri !== compressedUri) {
      this.compressionCacheReverse.set(compressedUri, normalizedKey);
    }
    
    // Debug logging to understand cache behavior
    console.log(`✅ Cache SET: ${originalUri.substring(originalUri.lastIndexOf('/') + 1)} → normalized: ${normalizedKey.substring(0, 40)}... → cached: ${compressedUri.substring(compressedUri.lastIndexOf('/') + 1)}`);
    
    // Trigger cleanup if cache is getting too large and not locked
    if (!this.processingLocked && this.compressionCache.size > this.maxCacheSize * 1.5) {
      this.clearOldEntries();
    }
  }

  /**
   * Get compressed URI from cache with file validation logging
   */
  get(originalUri: string): string | undefined {
    const normalizedKey = this.normalizePath(originalUri);
    const compressedUri = this.compressionCache.get(normalizedKey);
    
    // Debug logging to understand cache behavior
    if (this.debugCacheAccess || compressedUri) {
      console.log(`🔍 Cache GET: ${originalUri.substring(originalUri.lastIndexOf('/') + 1)} → normalized: ${normalizedKey.substring(0, 40)}... → result: ${compressedUri ? compressedUri.substring(compressedUri.lastIndexOf('/') + 1) : 'MISS'}`);
    }
    
    return compressedUri;
  }

  /**
   * Get original URI from compressed URI (reverse lookup)
   */
  getOriginal(compressedUri: string): string | undefined {
    const normalizedKey = this.compressionCacheReverse.get(compressedUri);
    if (normalizedKey) {
      return this.pathNormalizationMap.get(normalizedKey) || normalizedKey;
    }
    return compressedUri;
  }

  /**
   * Remove entry from cache (useful for cache corruption recovery)
   */
  remove(originalUri: string): void {
    const normalizedKey = this.normalizePath(originalUri);
    const compressedUri = this.compressionCache.get(normalizedKey);
    if (compressedUri) {
      this.compressionCache.delete(normalizedKey);
      if (compressedUri !== originalUri) {
        this.compressionCacheReverse.delete(compressedUri);
      }
      this.pathNormalizationMap.delete(normalizedKey);
      console.log(`🧹 Removed corrupted cache entry: ${originalUri}`);
    }
  }

  /**
   * Validate and clean corrupted cache entries
   */
  async validateAndCleanCache(): Promise<number> {
    if (this.processingLocked) {
      console.log(`🔒 Cache validation skipped - processing locked`);
      return 0;
    }

    console.log(`🧹 Starting cache validation for ${this.compressionCache.size} entries`);
    
    let removedCount = 0;
    const entriesToRemove: string[] = [];

    for (const [normalizedKey, compressedUri] of this.compressionCache.entries()) {
      const originalUri = this.pathNormalizationMap.get(normalizedKey);
      
      if (!originalUri) {
        console.warn(`🧹 Found orphaned cache entry without path mapping: ${normalizedKey}`);
        entriesToRemove.push(normalizedKey);
        continue;
      }
      
      if (compressedUri !== originalUri) {
        try {
          // Check if compressed file exists and has content
          const stats = await import('expo-file-system').then(fs => fs.getInfoAsync(compressedUri));
          const fileSize = stats.exists && !stats.isDirectory ? (stats as any).size || 0 : 0;
          
          if (!stats.exists || fileSize === 0) {
            console.warn(`🧹 Found corrupted cache entry: ${compressedUri} (size: ${fileSize}, exists: ${stats.exists})`);
            entriesToRemove.push(originalUri);
          }
        } catch (error) {
          console.warn(`🧹 Error validating cache entry ${compressedUri}:`, error);
          entriesToRemove.push(originalUri);
        }
      }
    }

    // Remove corrupted entries
    for (const originalUri of entriesToRemove) {
      this.remove(originalUri);
      removedCount++;
    }

    if (removedCount > 0) {
      console.log(`🧹 Cache validation complete: removed ${removedCount} corrupted entries`);
    } else {
      console.log(`✅ Cache validation complete: no corrupted entries found`);
    }

    return removedCount;
  }

  /**
   * Check if URI is cached
   */
  has(originalUri: string): boolean {
    const normalizedKey = this.normalizePath(originalUri);
    return this.compressionCache.has(normalizedKey);
  }

  /**
   * Remove from cache
   */
  delete(originalUri: string): boolean {
    const normalizedKey = this.normalizePath(originalUri);
    const compressedUri = this.compressionCache.get(normalizedKey);
    const deleted = this.compressionCache.delete(normalizedKey);
    
    if (compressedUri && compressedUri !== originalUri) {
      this.compressionCacheReverse.delete(compressedUri);
    }
    
    // Clean up the path normalization mapping
    this.pathNormalizationMap.delete(normalizedKey);
    
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
      keysToDelete.forEach(normalizedKey => {
        const compressedUri = this.compressionCache.get(normalizedKey);
        const originalUri = this.pathNormalizationMap.get(normalizedKey);
        const originalFilename = originalUri ? originalUri.substring(originalUri.lastIndexOf('/') + 1) : normalizedKey;
        
        console.log(`🗑️ Deleting cache entry: ${originalFilename} → ${compressedUri?.substring(compressedUri.lastIndexOf('/') + 1) || 'none'}`);
        this.compressionCache.delete(normalizedKey);
        this.pathNormalizationMap.delete(normalizedKey);
        if (compressedUri && originalUri && compressedUri !== originalUri) {
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
    this.pathNormalizationMap.clear();
    console.log(`🗑️ Cache cleared: ${beforeSize} entries removed`);
  }

  /**
   * Ensure cache compatibility with path normalization
   * Detects and clears legacy cache entries that may contain problematic characters
   */
  private ensureCacheCompatibility(): void {
    // Check if we have any existing cache entries that might be problematic
    // If cache is empty, no need to check
    if (this.compressionCache.size === 0) {
      return;
    }

    // Check for entries with problematic characters in the keys
    const problematicEntries: string[] = [];
    for (const [key] of this.compressionCache.entries()) {
      // If key contains characters that would be normalized, it's from before our fix
      if (/[;()[\]{}|\\/"'`~!@#$%^&*+= ]/.test(key)) {
        problematicEntries.push(key);
      }
    }

    if (problematicEntries.length > 0) {
      console.log(`🧹 Cache compatibility check: Found ${problematicEntries.length} legacy entries with problematic characters`);
      console.log(`🧹 Clearing cache to ensure path normalization compatibility`);
      this.clear();
    }
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
      const normalizedKey = this.normalizePath(uri);
      if (this.compressionCache.has(normalizedKey)) {
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
