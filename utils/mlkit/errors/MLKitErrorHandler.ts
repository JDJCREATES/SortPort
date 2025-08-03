/**
 * Centralized Error Handler for ML Kit Operations
 * Provides consistent error handling, logging, and recovery strategies
 */

import { ImagePathHelper } from '../helpers/imagePathHelper';
import { FileValidator } from '../validation/FileValidator';

export enum MLKitErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PATH_CORRUPTION = 'PATH_CORRUPTION',
  INVALID_IMAGE = 'INVALID_IMAGE',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

export interface MLKitErrorDetails {
  type: MLKitErrorType;
  originalError: any;
  imagePath: string;
  suggestions: string[];
  recoverable: boolean;
  retryable: boolean;
  corruptionAnalysis?: {
    detected: boolean;
    type: string;
    suggestion: string;
  };
}

export class MLKitErrorHandler {
  /**
   * Analyze and categorize ML Kit errors
   */
  static analyzeError(error: any, imagePath: string, operation: string): MLKitErrorDetails {
    const errorString = error?.toString() || '';
    const details: MLKitErrorDetails = {
      type: MLKitErrorType.UNKNOWN,
      originalError: error,
      imagePath,
      suggestions: [],
      recoverable: false,
      retryable: false
    };

    // File not found errors
    if (errorString.includes('FileNotFoundException') || errorString.includes('ENOENT')) {
      details.type = MLKitErrorType.FILE_NOT_FOUND;
      details.suggestions.push('Verify file exists before processing');
      details.retryable = false;
      
      // Check for path corruption
      const corruptionAnalysis = ImagePathHelper.detectPathCorruption(imagePath, errorString);
      if (corruptionAnalysis.isCorrupted) {
        details.type = MLKitErrorType.PATH_CORRUPTION;
        details.corruptionAnalysis = {
          detected: corruptionAnalysis.isCorrupted,
          type: corruptionAnalysis.corruptionType || 'unknown',
          suggestion: corruptionAnalysis.suggestedFix || 'no suggestion available'
        };
        details.suggestions.push('Fix path corruption before retrying');
        details.recoverable = true;
        details.retryable = true;
      }
    }
    
    // Invalid image format
    else if (errorString.includes('invalid image') || errorString.includes('corrupt') || 
             errorString.includes('malformed')) {
      details.type = MLKitErrorType.INVALID_IMAGE;
      details.suggestions.push('Validate image format and integrity');
      details.retryable = false;
    }
    
    // Timeout errors
    else if (errorString.includes('timeout') || errorString.includes('TimeoutException')) {
      details.type = MLKitErrorType.TIMEOUT;
      details.suggestions.push('Reduce image size or increase timeout');
      details.retryable = true;
    }
    
    // Generic processing failures
    else if (errorString.includes('processing failed') || errorString.includes('ML Kit')) {
      details.type = MLKitErrorType.PROCESSING_FAILED;
      details.suggestions.push('Retry with different parameters');
      details.retryable = true;
    }

    return details;
  }

  /**
   * Handle ML Kit error with appropriate logging and recovery
   */
  static async handleError(
    error: any, 
    imagePath: string, 
    operation: string,
    attemptRecovery: boolean = true
  ): Promise<{
    handled: boolean;
    recoveredPath?: string;
    fallbackData?: any;
    shouldRetry: boolean;
  }> {
    const analysis = this.analyzeError(error, imagePath, operation);
    
    // Log structured error information
    console.error(`🚨 ML Kit ${operation} Error Analysis:`);
    console.error(`  Type: ${analysis.type}`);
    console.error(`  Path: ${imagePath}`);
    console.error(`  Recoverable: ${analysis.recoverable}`);
    console.error(`  Retryable: ${analysis.retryable}`);
    console.error(`  Original Error: ${analysis.originalError}`);
    
    if (analysis.suggestions.length > 0) {
      console.error(`  Suggestions:`);
      analysis.suggestions.forEach(suggestion => {
        console.error(`    - ${suggestion}`);
      });
    }

    // Attempt recovery for path corruption
    if (analysis.type === MLKitErrorType.PATH_CORRUPTION && attemptRecovery) {
      console.log(`🔧 Attempting path corruption recovery...`);
      
      try {
        const fixedPath = FileValidator.attemptPathFix(imagePath);
        if (fixedPath) {
          console.log(`🔧 Generated fixed path: ${fixedPath}`);
          
          // Validate the fixed path
          const validation = await FileValidator.validateFile(fixedPath);
          if (validation.accessible) {
            console.log(`✅ Fixed path is accessible, recommending retry`);
            return {
              handled: true,
              recoveredPath: fixedPath,
              shouldRetry: true
            };
          }
        }
      } catch (recoveryError) {
        console.warn(`⚠️ Path recovery failed: ${recoveryError}`);
      }
    }

    // Return fallback data for certain error types
    let fallbackData: any;
    switch (operation.toLowerCase()) {
      case 'image labeling':
        fallbackData = [];
        break;
      case 'face detection':
        fallbackData = { faces: [], count: 0, emotions: [] };
        break;
      case 'text recognition':
        fallbackData = { fullText: '', blocks: [], hasText: false, languages: [] };
        break;
      case 'quality assessment':
        fallbackData = {
          overall: 0.5,
          brightness: 0.5,
          blur: 0.5,
          aesthetic: 0.5,
          sharpness: 0.5,
          contrast: 0.5,
          saturation: 0.5,
          exposure: 0.5
        };
        break;
      case 'scene analysis':
        fallbackData = {
          primaryScene: 'unknown',
          environment: 'unknown',
          activities: [],
          confidence: 0.0
        };
        break;
    }

    return {
      handled: true,
      fallbackData,
      shouldRetry: analysis.retryable
    };
  }

  /**
   * Log error statistics for monitoring
   */
  static logErrorStats(errorType: MLKitErrorType, operation: string): void {
    // In a production environment, this would send to analytics/monitoring
    console.log(`📊 ML Kit Error Stat: ${operation} - ${errorType}`);
  }
}
