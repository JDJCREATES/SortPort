/**
 * Modern Path Sanitization Utility
 * Production-ready filename and path handling with React Native compatible libraries
 */

import sanitizeFilename from 'sanitize-filename';
import normalizePath from 'normalize-path';
import { Platform } from 'react-native';

/**
 * React Native compatible path utilities
 * Replaces upath with custom implementations
 */
class PathUtils {
  static parse(filePath: string): { dir: string; name: string; ext: string; base: string } {
    // Handle different URI schemes
    let cleanPath = filePath;
    if (cleanPath.startsWith('file://')) {
      cleanPath = cleanPath.substring(7);
    }
    
    // Normalize separators
    cleanPath = normalizePath(cleanPath);
    
    const lastSlash = cleanPath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? cleanPath.substring(0, lastSlash) : '';
    const base = lastSlash >= 0 ? cleanPath.substring(lastSlash + 1) : cleanPath;
    
    const lastDot = base.lastIndexOf('.');
    const name = lastDot >= 0 ? base.substring(0, lastDot) : base;
    const ext = lastDot >= 0 ? base.substring(lastDot) : '';
    
    return { dir, name, ext, base };
  }
  
  static join(...paths: string[]): string {
    const validPaths = paths.filter(p => p && typeof p === 'string');
    if (validPaths.length === 0) return '';
    
    let result = validPaths[0];
    for (let i = 1; i < validPaths.length; i++) {
      const path = validPaths[i];
      if (result.endsWith('/')) {
        result += path.startsWith('/') ? path.substring(1) : path;
      } else {
        result += path.startsWith('/') ? path : '/' + path;
      }
    }
    
    return normalizePath(result);
  }
  
  static normalize(filePath: string): string {
    return normalizePath(filePath);
  }
}

export interface PathValidationResult {
  isValid: boolean;
  sanitized: string;
  warnings: string[];
  fixes: string[];
}

export interface FilenameOptions {
  /** Replace spaces with underscores (default: false) */
  replaceSpaces?: boolean;
  /** Maximum filename length (default: 255) */
  maxLength?: number;
  /** Custom replacement character for invalid chars (default: '_') */
  replacement?: string;
  /** Preserve file extension (default: true) */
  preserveExtension?: boolean;
}

export class PathSanitizer {
  /**
   * 🧹 Modern filename sanitization using sanitize-filename library
   */
  static sanitizeFilename(filename: string, options: FilenameOptions = {}): string {
    const {
      replaceSpaces = false,
      maxLength = 255,
      replacement = '_',
      preserveExtension = true
    } = options;

    if (!filename || typeof filename !== 'string') {
      return 'unnamed_file';
    }

    // Extract extension if preserving
    let extension = '';
    let nameWithoutExt = filename;
    
    if (preserveExtension) {
      const lastDot = filename.lastIndexOf('.');
      if (lastDot > 0) {
        extension = filename.substring(lastDot);
        nameWithoutExt = filename.substring(0, lastDot);
      }
    }

    // Use sanitize-filename for robust sanitization
    let sanitized = sanitizeFilename(nameWithoutExt, { replacement });

    // Handle spaces if requested
    if (replaceSpaces) {
      sanitized = sanitized.replace(/\s+/g, replacement);
    }

    // Handle length limits
    const maxNameLength = maxLength - extension.length;
    if (sanitized.length > maxNameLength) {
      sanitized = sanitized.substring(0, maxNameLength);
    }

    return sanitized + extension;
  }

  /**
   * 🛣️ Modern path normalization using normalize-path and upath
   */
  static normalizePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      return '';
    }

    // Use normalize-path for consistent forward slashes
    let normalized = normalizePath(filePath);

    // Use PathUtils for additional normalization
    normalized = PathUtils.normalize(normalized);

    // Handle platform-specific cases
    if (Platform.OS === 'android') {
      // Ensure Android paths are properly formatted
      if (normalized.startsWith('content://') || normalized.startsWith('asset://')) {
        return normalized; // Keep content URIs as-is
      }
      
      // Handle Android storage paths like file:///storage/...
      if (normalized.startsWith('file:///')) {
        return normalized; // Keep file URIs with proper format
      }
      
      // Ensure file:// prefix for local absolute paths
      if (normalized.startsWith('/') && !normalized.startsWith('file://')) {
        normalized = `file://${normalized}`;
      }
    }

    return normalized;
  }

  /**
   * 🔍 Comprehensive path validation and sanitization
   */
  static validateAndSanitizePath(filePath: string, options: FilenameOptions = {}): PathValidationResult {
    const warnings: string[] = [];
    const fixes: string[] = [];
    
    if (!filePath || typeof filePath !== 'string') {
      return {
        isValid: false,
        sanitized: '',
        warnings: ['Invalid or empty path'],
        fixes: []
      };
    }

    // Extract directory and filename
    const pathInfo = PathUtils.parse(filePath);
    const { dir, name, ext } = pathInfo;

    // Sanitize filename component
    const originalFilename = name + ext;
    const sanitizedFilename = this.sanitizeFilename(originalFilename, options);
    
    if (originalFilename !== sanitizedFilename) {
      warnings.push('Filename contained invalid characters');
      fixes.push(`Filename sanitized: ${originalFilename} → ${sanitizedFilename}`);
    }

    // Normalize directory path
    const normalizedDir = dir ? this.normalizePath(dir) : '';
    
    // Detect common issues
    if (filePath.includes(' ')) {
      warnings.push('Path contains spaces which may cause issues in some systems');
      if (options.replaceSpaces) {
        fixes.push('Spaces will be replaced with underscores');
      }
    }

    if (filePath.length > 260) {
      warnings.push('Path exceeds Windows MAX_PATH limit (260 characters)');
    }

    // Build sanitized path
    const sanitized = normalizedDir 
      ? PathUtils.join(normalizedDir, sanitizedFilename)
      : sanitizedFilename;

    return {
      isValid: warnings.length === 0,
      sanitized: this.normalizePath(sanitized),
      warnings,
      fixes
    };
  }

  /**
   * 🚀 Quick path sanitization for ML Kit compatibility
   * Special handling for Android file:/// URIs to preserve exact format
   */
  static sanitizeForMLKit(imagePath: string): string {
    // Special case: Android file URIs must preserve triple slashes
    if (imagePath.startsWith('file:///')) {
      // For Android file URIs, we need to preserve the exact format
      // Only sanitize the filename portion, not the full path
      const uriScheme = 'file:///';
      const pathPortion = imagePath.substring(uriScheme.length);
      
      // Extract just the filename for sanitization warning purposes
      const lastSlash = pathPortion.lastIndexOf('/');
      const filename = lastSlash >= 0 ? pathPortion.substring(lastSlash + 1) : pathPortion;
      
      // Log warnings in development (for filename only)
      if (__DEV__) {
        if (filename.includes(' ')) {
          console.log(`📝 Path sanitization warnings for ${imagePath}:`, ["Path contains spaces which may cause issues in some systems"]);
        }
      }
      
      // Return the original Android file URI unchanged to preserve compatibility
      return imagePath;
    }

    // For all other paths, use normal sanitization
    const result = this.validateAndSanitizePath(imagePath, {
      replaceSpaces: false, // Keep spaces for ML Kit compatibility
      maxLength: 255,
      replacement: '_'
    });

    // Log warnings in development
    if (__DEV__ && result.warnings.length > 0) {
      console.log(`📝 Path sanitization warnings for ${imagePath}:`, result.warnings);
      if (result.fixes.length > 0) {
        console.log(`🔧 Applied fixes:`, result.fixes);
      }
    }

    return result.sanitized;
  }

  /**
   * 🗂️ Sanitize folder/directory names
   */
  static sanitizeFolderName(folderName: string): string {
    return this.sanitizeFilename(folderName, {
      replaceSpaces: true,
      preserveExtension: false,
      replacement: '_'
    });
  }

  /**
   * 🔤 Extract safe filename from URI/path
   */
  static extractSafeFilename(uri: string): string {
    try {
      // Handle different URI schemes
      let cleanPath = uri;
      
      if (uri.startsWith('file://')) {
        cleanPath = uri.substring(7);
      } else if (uri.startsWith('content://')) {
        // For Android content URIs, generate a safe filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `content_${timestamp}_${random}.jpg`;
      }

      const pathInfo = PathUtils.parse(cleanPath);
      const filename = pathInfo.name + pathInfo.ext;
      
      return this.sanitizeFilename(filename);
    } catch (error) {
      console.warn('Failed to extract filename from URI:', uri, error);
      const timestamp = Date.now();
      return `file_${timestamp}.jpg`;
    }
  }

  /**
   * 🎯 Production-ready filename generation for uploads
   */
  static generateUploadFilename(originalPath: string, prefix?: string): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    
    try {
      const pathInfo = PathUtils.parse(originalPath);
      const extension = pathInfo.ext || '.jpg';
      const baseName = this.sanitizeFilename(pathInfo.name || 'image', {
        replaceSpaces: true,
        maxLength: 50
      });
      
      const parts = [
        prefix,
        baseName,
        timestamp.toString(),
        randomId
      ].filter(Boolean);
      
      return `${parts.join('_')}${extension}`;
    } catch (error) {
      return `${prefix || 'upload'}_${timestamp}_${randomId}.jpg`;
    }
  }
}
