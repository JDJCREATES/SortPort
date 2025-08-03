/**
 * Image Path Helper for ML Kit
 * Converts various image path formats to ML Kit compatible URIs
 */

import { Platform } from 'react-native';

export class ImagePathHelper {
  /**
   * Convert image path to ML Kit compatible URI with robust validation
   */
  static convertToMLKitPath(imagePath: string): string {
    // Input validation
    if (!imagePath || typeof imagePath !== 'string') {
      throw new Error('Invalid image path provided');
    }

    // Trim and clean the path
    let cleanPath = imagePath.trim();
    
    // Log original path for debugging
    console.log(`🔧 Converting path: ${imagePath}`);
    
    // Check for obvious corruption patterns in UUID-based filenames
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const pathContainsUuid = uuidPattern.test(cleanPath);
    
    if (pathContainsUuid) {
      // Extract the UUID and verify its integrity
      const uuidMatches = cleanPath.match(uuidPattern);
      if (uuidMatches) {
        const extractedUuid = uuidMatches[0];
        console.log(`🔍 Detected UUID in path: ${extractedUuid}`);
        
        // Check for common corruption patterns (missing characters)
        if (extractedUuid.length !== 36) {
          console.error(`❌ UUID corruption detected - invalid length: ${extractedUuid.length} (expected 36)`);
          throw new Error(`Corrupted UUID detected in path: ${extractedUuid}`);
        }
      }
    }
    
    // Handle different URI schemes
    if (cleanPath.startsWith('content://') || cleanPath.startsWith('asset://')) {
      // Android content URIs and assets should be passed as-is
      console.log(`📱 Using Android content/asset URI: ${cleanPath}`);
      return cleanPath;
    }
    
    // Remove file:// prefix for processing
    if (cleanPath.startsWith('file://')) {
      cleanPath = cleanPath.substring(7); // Remove 'file://'
    }
    
    // Validate the path structure
    if (!cleanPath.startsWith('/')) {
      throw new Error(`Invalid file path structure: ${cleanPath}`);
    }
    
    // Ensure the path contains valid characters (check for corruption)
    // Allow alphanumeric, hyphens, underscores, dots, slashes for file paths and UUIDs
    if (!/^[a-zA-Z0-9\/\-_\.\:]+$/.test(cleanPath)) {
      console.warn(`⚠️ Path contains invalid characters that may cause issues: ${cleanPath}`);
      // Log the problematic characters for debugging
      const invalidChars = cleanPath.match(/[^a-zA-Z0-9\/\-_\.\:]/g);
      if (invalidChars) {
        console.warn(`⚠️ Invalid characters found: ${invalidChars.join(', ')}`);
      }
    }
    
    // Reconstruct the file URI
    const finalPath = `file://${cleanPath}`;
    
    // Final validation - check for length discrepancies that might indicate corruption
    const expectedLength = imagePath.startsWith('file://') ? imagePath.length : imagePath.length + 7;
    if (Math.abs(finalPath.length - expectedLength) > 1) {
      console.warn(`⚠️ Significant path length change during conversion: ${imagePath.length} -> ${finalPath.length}`);
      console.warn(`Original: ${imagePath}`);
      console.warn(`Converted: ${finalPath}`);
    }
    
    console.log(`✅ Converted to: ${finalPath}`);
    return finalPath;
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
