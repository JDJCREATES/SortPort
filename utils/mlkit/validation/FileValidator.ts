/**
 * File Validator for ML Kit Processing
 * Validates file existence and integrity before ML Kit processing
 * Enhanced with mobile-specific path validation
 */

import { Platform } from 'react-native';
import { MobilePathValidator, MobilePathValidationResult } from '../../shared/MobilePathValidator';
import { logError, logWarn, logDebug } from '../../shared/LoggingConfig';

export interface FileValidationResult {
  exists: boolean;
  accessible: boolean;
  size: number;
  error?: string;
  corruption?: {
    detected: boolean;
    type: string;
    suggestion: string;
  };
  pathValidation?: MobilePathValidationResult;
}

export class FileValidator {
  /**
   * Validate if a file exists and is accessible for ML Kit processing
   * Uses fetch HEAD request as a basic check and includes mobile path validation
   */
  static async validateFile(filePath: string): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      exists: false,
      accessible: false,
      size: 0
    };

    // First, validate the path structure for mobile compatibility
    const pathValidation = MobilePathValidator.validateMobilePath(filePath);
    result.pathValidation = pathValidation;

    if (!pathValidation.isValid) {
      result.error = `Invalid path structure: ${pathValidation.issues.join(', ')}`;
      logWarn('File path validation failed', {
        component: 'FileValidator',
        filePath: filePath.substring(filePath.lastIndexOf('/') + 1),
        issues: pathValidation.issues,
        suggestions: pathValidation.suggestions
      });
      return result;
    }

    try {
      // Use fetch to test file accessibility
      const response = await fetch(filePath, { method: 'HEAD' });
      
      if (response.ok) {
        result.exists = true;
        result.accessible = true;
        
        // Try to get content length
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          result.size = parseInt(contentLength, 10);
          
          if (result.size === 0) {
            result.accessible = false;
            result.error = 'File is empty';
            logWarn('Empty file detected', {
              component: 'FileValidator',
              filePath: filePath.substring(filePath.lastIndexOf('/') + 1)
            });
          }
        }
      } else {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        logError('File access failed', {
          component: 'FileValidator',
          filePath: filePath.substring(filePath.lastIndexOf('/') + 1),
          status: response.status,
          statusText: response.statusText
        });
      }

    } catch (error) {
      result.error = `Validation failed: ${error}`;
      
      // Check for specific file not found patterns
      if (error && error.toString().includes('Network request failed')) {
        result.error = 'File does not exist or is not accessible';
      }
      
      logError('File validation exception', {
        component: 'FileValidator',
        filePath: filePath.substring(filePath.lastIndexOf('/') + 1),
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return result;
  }

  /**
   * Validate multiple files and return results
   */
  static async validateBatch(filePaths: string[]): Promise<{ [path: string]: FileValidationResult }> {
    const results: { [path: string]: FileValidationResult } = {};
    
    const validationPromises = filePaths.map(async (path) => {
      const result = await this.validateFile(path);
      results[path] = result;
    });

    await Promise.all(validationPromises);
    return results;
  }

  /**
   * Check if the file path looks corrupted based on common patterns
   * Enhanced with mobile-specific checks
   */
  static detectPathCorruption(filePath: string): {
    isCorrupted: boolean;
    issues: string[];
    suggestions: string[];
  } {
    // Use mobile path validator for comprehensive checking
    const mobileValidation = MobilePathValidator.validateMobilePath(filePath);
    const issues: string[] = [...mobileValidation.issues];
    const suggestions: string[] = [...mobileValidation.suggestions];

    // Add legacy corruption checks for backwards compatibility
    
    // Check for UUID corruption
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const uuidMatches = filePath.match(uuidPattern);
    
    if (uuidMatches) {
      for (const uuid of uuidMatches) {
        if (uuid.length !== 36) {
          issues.push(`UUID length incorrect: ${uuid} (expected 36 characters)`);
          suggestions.push('Check for missing or extra characters in UUID');
        }
        
        if (!/^[0-9a-f-]+$/i.test(uuid)) {
          issues.push(`UUID contains invalid characters: ${uuid}`);
          suggestions.push('Remove non-hexadecimal characters from UUID');
        }
      }
    }

    // Check for double extensions
    if ((filePath.match(/\.(jpg|jpeg|png|gif|bmp|webp)/gi) || []).length > 1) {
      issues.push('Multiple file extensions detected');
      suggestions.push('Remove duplicate file extensions');
    }

    return {
      isCorrupted: issues.length > 0,
      issues,
      suggestions
    };
  }

  /**
   * Attempt to fix common path corruption issues
   * Enhanced with mobile-specific path fixing
   */
  static attemptPathFix(corruptedPath: string): string | null {
    // First try the mobile path validator's auto-fix
    const mobileFixed = MobilePathValidator.attemptPathFix(corruptedPath);
    if (mobileFixed && mobileFixed !== corruptedPath) {
      return mobileFixed;
    }

    // Fall back to legacy fix methods
    let fixedPath = corruptedPath;

    // Try to fix UUID corruption by removing extra characters
    // Look for patterns like "5b6ff138b" and try to fix to "5b6f138b"
    const uuidPattern = /([0-9a-f]{8})[0-9a-f]?-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})/gi;
    
    fixedPath = fixedPath.replace(uuidPattern, (match, p1, p2, p3, p4, p5) => {
      // If first group has extra character, remove it
      if (p1.length > 8) {
        p1 = p1.substring(0, 8);
      }
      return `${p1}-${p2}-${p3}-${p4}-${p5}`;
    });

    // Remove double extensions
    fixedPath = fixedPath.replace(/\.(jpg|jpeg|png|gif|bmp|webp)\.(jpg|jpeg|png|gif|bmp|webp)/gi, '.$1');

    // Return fixed path only if it's different
    if (fixedPath !== corruptedPath) {
      logDebug('Legacy path fix applied', {
        component: 'FileValidator',
        originalPath: corruptedPath.substring(corruptedPath.lastIndexOf('/') + 1),
        fixedPath: fixedPath.substring(fixedPath.lastIndexOf('/') + 1)
      });
      return fixedPath;
    }
    
    return null;
  }
}
