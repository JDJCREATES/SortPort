import * as FileSystem from 'expo-file-system';

/**
 * File System Service - handles all file operations and size calculations
 */
export class FileSystemService {
  /**
   * Get file size in bytes with error handling
   */
  static async getFileSize(uri: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const size = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;
      return size || 0;
    } catch (error) {
      console.warn(`⚠️ Failed to get file size for ${uri}:`, error);
      return 0;
    }
  }

  /**
   * Calculate total size of multiple files with detailed breakdown
   */
  static async calculateTotalSize(uris: string[]): Promise<{ 
    totalSizeBytes: number; 
    totalSizeMB: number; 
    avgSizeBytes: number;
    validFiles: number;
    invalidFiles: number;
  }> {
    const sizes = await Promise.all(uris.map(async (uri, index) => {
      const size = await this.getFileSize(uri);
      if (size === 0) {
        console.warn(`📁 File ${index + 1}/${uris.length}: ${uri.substring(uri.lastIndexOf('/') + 1)} - 0 bytes (may not exist)`);
      }
      return size;
    }));
    
    const totalSizeBytes = sizes.reduce((sum, size) => sum + size, 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    const validFiles = sizes.filter(size => size > 0).length;
    const invalidFiles = sizes.length - validFiles;
    const avgSizeBytes = validFiles > 0 ? totalSizeBytes / validFiles : 0;
    
    if (invalidFiles > 0) {
      console.warn(`⚠️ Found ${invalidFiles}/${uris.length} files with 0 bytes`);
    }
    
    return { totalSizeBytes, totalSizeMB, avgSizeBytes, validFiles, invalidFiles };
  }

  /**
   * Format file size for human-readable logging
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  /**
   * Validate file existence and accessibility
   */
  static async validateFile(uri: string): Promise<{ exists: boolean; size: number; error?: string }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        return { exists: false, size: 0, error: 'File does not exist' };
      }
      
      const size = 'size' in fileInfo ? fileInfo.size || 0 : 0;
      return { exists: true, size };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { exists: false, size: 0, error: errorMessage };
    }
  }

  /**
   * Batch validate multiple files with detailed reporting
   */
  static async validateFiles(uris: string[]): Promise<{
    valid: string[];
    invalid: { uri: string; reason: string }[];
    totalValidSize: number;
  }> {
    const results = await Promise.all(
      uris.map(async (uri) => {
        const validation = await this.validateFile(uri);
        return { uri, validation };
      })
    );

    const valid: string[] = [];
    const invalid: { uri: string; reason: string }[] = [];
    let totalValidSize = 0;

    results.forEach(({ uri, validation }) => {
      if (validation.exists && validation.size > 0) {
        valid.push(uri);
        totalValidSize += validation.size;
      } else {
        invalid.push({ 
          uri, 
          reason: validation.error || `Empty file (${validation.size} bytes)` 
        });
      }
    });

    if (invalid.length > 0) {
      console.warn(`📁 File validation: ${valid.length} valid, ${invalid.length} invalid files`);
      invalid.forEach(({ uri, reason }) => {
        console.warn(`❌ Invalid: ${uri.substring(uri.lastIndexOf('/') + 1)} - ${reason}`);
      });
    }

    return { valid, invalid, totalValidSize };
  }

  /**
   * Get available storage space
   */
  static async getAvailableStorage(): Promise<number> {
    try {
      const info = await FileSystem.getFreeDiskStorageAsync();
      return info;
    } catch (error) {
      console.error('❌ Failed to get storage info:', error);
      return 0;
    }
  }
}
