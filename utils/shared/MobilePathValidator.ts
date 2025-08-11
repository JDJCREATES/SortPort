/**
 * Mobile-Specific Path Validator
 * Enhanced path validation for React Native mobile applications
 * Handles iOS/Android specific path issues and mobile file system constraints
 */

import { Platform } from 'react-native';
import { logWarn, logDebug, logError } from './LoggingConfig';

export interface MobilePathValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  autoFixAttempted?: string;
  platform: 'ios' | 'android';
}

export interface MobileFilenameSanitizationOptions {
  maxLength?: number;
  preserveExtension?: boolean;
  allowUnicode?: boolean;
  platform?: 'ios' | 'android';
}

export class MobilePathValidator {
  // Mobile-specific reserved names and patterns
  private static readonly WINDOWS_RESERVED_NAMES = [
    'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 
    'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 
    'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  private static readonly MOBILE_PROBLEMATIC_CHARS = {
    ios: /[<>:"|?*\x00-\x1f]/g,
    android: /[<>:"|?*\x00-\x1f\\]/g,
    general: /[<>:"|?*\x00-\x1f\\\/]/g
  };

  private static readonly MOBILE_PATH_LIMITS = {
    ios: {
      maxFilenameLength: 255,
      maxPathLength: 1024,
      maxPathDepth: 40
    },
    android: {
      maxFilenameLength: 255,
      maxPathLength: 4096,
      maxPathDepth: 40
    }
  };

  /**
   * Validate a file path for mobile-specific issues
   */
  public static validateMobilePath(path: string): MobilePathValidationResult {
    const platform = Platform.OS as 'ios' | 'android';
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for null/empty paths
    if (!path || path.trim().length === 0) {
      issues.push('Path is empty or null');
      suggestions.push('Provide a valid file path');
      return { isValid: false, issues, suggestions, platform };
    }

    // Handle file URIs properly (file://, content://, etc.)
    let actualPath = path;
    let isFileUri = false;
    
    if (path.startsWith('file://')) {
      isFileUri = true;
      actualPath = path.substring(7); // Remove 'file://' prefix
    } else if (path.startsWith('content://')) {
      // Content URIs are valid on Android - don't validate as file paths
      return { isValid: true, issues: [], suggestions: [], platform };
    }

    // Extract filename from path
    const filename = actualPath.split('/').pop() || '';
    const pathWithoutFilename = actualPath.substring(0, actualPath.lastIndexOf('/'));

    // Check filename length
    const limits = this.MOBILE_PATH_LIMITS[platform];
    if (filename.length > limits.maxFilenameLength) {
      issues.push(`Filename too long (${filename.length} > ${limits.maxFilenameLength})`);
      suggestions.push('Shorten the filename');
    }

    // Check total path length
    if (actualPath.length > limits.maxPathLength) {
      issues.push(`Path too long (${actualPath.length} > ${limits.maxPathLength})`);
      suggestions.push('Reduce path depth or shorten folder/file names');
    }

    // Check path depth
    const pathDepth = actualPath.split('/').length - 1;
    if (pathDepth > limits.maxPathDepth) {
      issues.push(`Path too deep (${pathDepth} > ${limits.maxPathDepth})`);
      suggestions.push('Reduce folder nesting');
    }

    // Check for problematic characters (but allow spaces in folder names)
    const problematicChars = /[<>:"|?*\x00-\x1f]/g; // Removed space from problematic chars
    if (problematicChars.test(filename)) {
      issues.push('Filename contains problematic characters');
      suggestions.push('Remove or replace special characters: < > : " | ? * and control characters');
    }

    // Check for reserved names (primarily Windows compatibility)
    const fileBaseName = filename.split('.')[0].toUpperCase();
    if (this.WINDOWS_RESERVED_NAMES.includes(fileBaseName)) {
      issues.push(`Filename uses reserved name: ${fileBaseName}`);
      suggestions.push('Use a different filename');
    }

    // Check for leading/trailing spaces or dots in filename only
    if (filename.startsWith(' ') || filename.endsWith(' ')) {
      issues.push('Filename has leading or trailing spaces');
      suggestions.push('Remove leading/trailing spaces from filename');
    }

    if (filename.startsWith('.') && filename !== filename.replace(/^\.+/, '')) {
      issues.push('Filename starts with multiple dots');
      suggestions.push('Remove leading dots or use a single dot for hidden files');
    }

    // Check for Unicode normalization issues
    if (filename !== filename.normalize('NFC')) {
      issues.push('Filename has Unicode normalization issues');
      suggestions.push('Normalize Unicode characters');
    }

    // Platform-specific checks
    if (platform === 'ios') {
      // iOS specific validations
      if (actualPath.includes('//')) {
        issues.push('Path contains double slashes');
        suggestions.push('Remove duplicate slashes');
      }
    } else if (platform === 'android') {
      // Android specific validations - only check if not a file URI
      if (!isFileUri && actualPath.length > 0 && !actualPath.startsWith('/')) {
        issues.push('Android path should start with / (unless using file:// URI)');
        suggestions.push('Use absolute paths starting with / or file:// URIs');
      }
    }

    const result: MobilePathValidationResult = {
      isValid: issues.length === 0,
      issues,
      suggestions,
      platform
    };

    if (!result.isValid) {
      logDebug('Mobile path validation failed', {
        component: 'MobilePathValidator',
        path: filename, // Log only filename for privacy
        isFileUri,
        platform,
        issueCount: issues.length,
        issues
      });
    }

    return result;
  }

  /**
   * Sanitize a filename for mobile use
   */
  public static sanitizeFilename(
    filename: string, 
    options: MobileFilenameSanitizationOptions = {}
  ): string {
    const {
      maxLength = 200,
      preserveExtension = true,
      allowUnicode = true,
      platform = Platform.OS as 'ios' | 'android'
    } = options;

    if (!filename) return 'unnamed_file';

    let sanitized = filename;

    // Normalize Unicode if allowed
    if (allowUnicode) {
      sanitized = sanitized.normalize('NFC');
    } else {
      // Remove non-ASCII characters
      sanitized = sanitized.replace(/[^\x00-\x7F]/g, '');
    }

    // Remove problematic characters (but preserve spaces in most cases)
    const problematicChars = /[<>:"|?*\x00-\x1f]/g; // Removed space from automatic replacement
    sanitized = sanitized.replace(problematicChars, '_');

    // Only replace spaces if specifically requested or if they're leading/trailing
    if (!allowUnicode) {
      // In strict mode, replace spaces with underscores
      sanitized = sanitized.replace(/ /g, '_');
    } else {
      // Just trim leading/trailing spaces but preserve internal spaces
      sanitized = sanitized.trim();
    }

    // Handle reserved names
    const parts = sanitized.split('.');
    const baseName = parts[0].toUpperCase();
    if (this.WINDOWS_RESERVED_NAMES.includes(baseName)) {
      parts[0] = parts[0] + '_file';
      sanitized = parts.join('.');
    }

    // Trim whitespace and dots
    sanitized = sanitized.trim().replace(/^\.+/, '').replace(/\.+$/, '');

    // Ensure we have something
    if (sanitized.length === 0) {
      sanitized = 'unnamed_file';
    }

    // Handle length limits
    if (preserveExtension && sanitized.includes('.')) {
      const lastDotIndex = sanitized.lastIndexOf('.');
      const name = sanitized.substring(0, lastDotIndex);
      const extension = sanitized.substring(lastDotIndex);
      
      if (sanitized.length > maxLength) {
        const availableNameLength = maxLength - extension.length;
        if (availableNameLength > 0) {
          sanitized = name.substring(0, availableNameLength) + extension;
        } else {
          sanitized = name.substring(0, maxLength);
        }
      }
    } else {
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
      }
    }

    return sanitized;
  }

  /**
   * Attempt automatic path correction
   */
  public static attemptPathFix(path: string): string | null {
    try {
      const validation = this.validateMobilePath(path);
      if (validation.isValid) return path;

      let fixed = path;
      let isFileUri = false;
      let uriPrefix = '';

      // Handle file URIs
      if (path.startsWith('file://')) {
        isFileUri = true;
        uriPrefix = 'file://';
        fixed = path.substring(7);
      }

      // Fix double slashes (but not in URI schemes)
      fixed = fixed.replace(/\/+/g, '/');

      // Extract and sanitize filename only (preserve folder structure)
      const parts = fixed.split('/');
      const filename = parts.pop() || '';
      const sanitizedFilename = this.sanitizeFilename(filename, {
        allowUnicode: true, // Allow spaces and Unicode in mobile contexts
        preserveExtension: true
      });
      
      if (sanitizedFilename !== filename) {
        parts.push(sanitizedFilename);
        fixed = parts.join('/');
        
        // Add back URI prefix if it was there
        if (isFileUri) {
          fixed = uriPrefix + fixed;
        }
        
        logDebug('Attempted automatic path fix', {
          component: 'MobilePathValidator',
          originalFilename: filename,
          fixedFilename: sanitizedFilename,
          wasFileUri: isFileUri
        });
        
        return fixed;
      }

      return null;
    } catch (error) {
      logError('Path fix attempt failed', {
        component: 'MobilePathValidator',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get platform-specific file system limits
   */
  public static getPlatformLimits() {
    const platform = Platform.OS as 'ios' | 'android';
    return this.MOBILE_PATH_LIMITS[platform];
  }

  /**
   * Validate a batch of paths efficiently
   */
  public static validateBatch(paths: string[]): {
    valid: string[];
    invalid: Array<{ path: string; validation: MobilePathValidationResult }>;
  } {
    const valid: string[] = [];
    const invalid: Array<{ path: string; validation: MobilePathValidationResult }> = [];

    for (const path of paths) {
      const validation = this.validateMobilePath(path);
      if (validation.isValid) {
        valid.push(path);
      } else {
        invalid.push({ path, validation });
      }
    }

    if (invalid.length > 0) {
      logWarn('Batch path validation found issues', {
        component: 'MobilePathValidator',
        totalPaths: paths.length,
        validPaths: valid.length,
        invalidPaths: invalid.length,
        commonIssues: this.getCommonIssues(invalid.map(i => i.validation))
      });
    }

    return { valid, invalid };
  }

  /**
   * Extract common issues from validation results
   */
  private static getCommonIssues(validations: MobilePathValidationResult[]): string[] {
    const issueCount: { [key: string]: number } = {};
    
    validations.forEach(v => {
      v.issues.forEach(issue => {
        issueCount[issue] = (issueCount[issue] || 0) + 1;
      });
    });

    return Object.entries(issueCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([issue, count]) => `${issue} (${count} files)`);
  }
}
