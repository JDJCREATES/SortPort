/**
 * Image Path    // Use PathSanitizer for modern filename handling
    const sanitized = PathSanitizer.sanitizeForMLKit(imagePath);
    
    // Trim and clean the path
    let cleanPath = sanitized.trim();
    
    // Log conversion process for debugging (in development only)
    if (__DEV__) {
      console.log(`🔧 ML Kit path conversion:`, {
        original: imagePath,
        sanitized: sanitized,
        cleaned: cleanPath
      });
    }

    // Special case: If sanitized path is same as original Android file URI, handle it properly
    if (cleanPath.startsWith('file:///')) {
      // For Android file URIs, extract the file system path for ML Kit
      const filePath = cleanPath.substring(8); // Remove 'file:///' (8 chars)
      
      // Validate that we have a proper absolute path
      if (!filePath.startsWith('/')) {
        const errorMsg = `Invalid Android file URI structure: expected file:///absolute/path, got: ${cleanPath}. Original: ${imagePath}`;
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log(`📱 Android file URI converted: ${cleanPath} → ${filePath}`);
      return filePath;
    } Kit
 * Converts various image path formats to ML Kit compatible URIs
 */

import { Platform } from 'react-native';
import { PathSanitizer } from '../../helpers/pathSanitizer';

export class ImagePathHelper {
  /**
   * Convert image path to ML Kit compatible URI with robust validation
   */
  static convertToMLKitPath(imagePath: string): string {
    // Input validation
    if (!imagePath || typeof imagePath !== 'string') {
      throw new Error('Invalid image path provided');
    }

    // Fast path: Android file URIs don't need sanitization
    if (imagePath.startsWith('file:///')) {
      return imagePath;
    }

    // For other paths, use sanitization
    const sanitized = PathSanitizer.sanitizeForMLKit(imagePath);
    
    // Trim and clean the path
    let cleanPath = sanitized.trim();
    
    // Log conversion process only in development and for errors
    const shouldLogDebug = __DEV__ && Math.random() < 0.1; // Only log 10% of the time in dev
    if (shouldLogDebug) {
      console.log(`🔧 ML Kit path conversion sample:`, {
        original: imagePath,
        sanitized: sanitized,
        cleaned: cleanPath
      });
    }

    // Handle different URI schemes
    if (cleanPath.startsWith('content://') || cleanPath.startsWith('asset://')) {
      // Android content URIs and assets should be passed as-is
      if (shouldLogDebug) {
        console.log(`📱 Using Android content/asset URI: ${cleanPath}`);
      }
      return cleanPath;
    }
    
    // Check for obvious corruption patterns in UUID-based filenames
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const pathContainsUuid = uuidPattern.test(cleanPath);
    
    if (pathContainsUuid) {
      // Extract the UUID and verify its integrity
      const uuidMatches = cleanPath.match(uuidPattern);
      if (uuidMatches) {
        const extractedUuid = uuidMatches[0];
        
        // Check for common corruption patterns (missing characters)
        if (extractedUuid.length !== 36) {
          console.error(`❌ UUID corruption detected - invalid length: ${extractedUuid.length} (expected 36)`);
          throw new Error(`Corrupted UUID detected in path: ${extractedUuid}`);
        }
      }
    }
    
    // For other paths (not Android file URIs), validate they start with /
    if (!cleanPath.startsWith('/')) {
      const errorMsg = `Invalid file path structure: expected absolute path starting with /, got: ${cleanPath}. Original: ${imagePath}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Modern validation - allow characters common in modern filesystems
    if (!/^[a-zA-Z0-9\/\-_\.\:\s\(\)\[\]]+$/.test(cleanPath)) {
      console.warn(`⚠️ Path contains unusual characters: ${cleanPath}`);
      // Log the problematic characters for debugging
      const invalidChars = cleanPath.match(/[^a-zA-Z0-9\/\-_\.\:\s\(\)\[\]]/g);
      if (invalidChars) {
        console.warn(`⚠️ Unusual characters found: ${invalidChars.join(', ')}`);
      }
    }
    
    console.log(`✅ Converted absolute path: ${cleanPath}`);
    return cleanPath;
  }

  /**
   * Detect if a file path has been corrupted
   */
  static detectPathCorruption(originalPath: string, errorMessage?: string): {
    isCorrupted: boolean;
    corruptionType: string | null;
    suggestedFix: string | null;
  } {
    const result = {
      isCorrupted: false,
      corruptionType: null as string | null,
      suggestedFix: null as string | null
    };

    // Check for FileNotFoundException with specific corruption patterns
    if (errorMessage && errorMessage.includes('FileNotFoundException')) {
      // Extract the path from the error message
      const pathMatch = errorMessage.match(/\/data\/user\/0\/[^:]+/);
      if (pathMatch) {
        const errorPath = pathMatch[0];
        const originalFilename = originalPath.split('/').pop() || '';
        const errorFilename = errorPath.split('/').pop() || '';
        
        // Check for character insertion corruption
        if (errorFilename.length > originalFilename.length) {
          result.isCorrupted = true;
          result.corruptionType = 'character_insertion';
          result.suggestedFix = `Remove extra characters from ${errorFilename}`;
        }
        
        // Check for UUID corruption patterns
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        if (uuidPattern.test(originalFilename) && !uuidPattern.test(errorFilename)) {
          result.isCorrupted = true;
          result.corruptionType = 'uuid_corruption';
          result.suggestedFix = `Restore UUID format in ${errorFilename}`;
        }
      }
    }

    return result;
  }

  /**
   * Check if the image path exists and is accessible
   */
  static async validateImagePath(imagePath: string): Promise<boolean> {
    try {
      const convertedPath = this.convertToMLKitPath(imagePath);
      
      // For React Native, we can use fetch to test if the file exists
      const response = await fetch(convertedPath, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.warn('⚠️ Image path validation failed:', error);
      return false;
    }
  }

  /**
   * Get image info if available
   */
  static getImageInfo(imagePath: string): { 
    originalPath: string; 
    convertedPath: string; 
    platform: string; 
  } {
    return {
      originalPath: imagePath,
      convertedPath: this.convertToMLKitPath(imagePath),
      platform: Platform.OS
    };
  }

  /**
   * Extract filename from path
   */
  static getFilename(imagePath: string): string {
    const cleanPath = imagePath.replace(/^file:\/\//, '');
    return cleanPath.split('/').pop() || cleanPath;
  }

  /**
   * Check if path is a local file
   */
  static isLocalFile(imagePath: string): boolean {
    const cleanPath = imagePath.toLowerCase();
    return cleanPath.startsWith('file://') || 
           cleanPath.startsWith('/') || 
           (Platform.OS === 'android' && cleanPath.startsWith('content://'));
  }
}
