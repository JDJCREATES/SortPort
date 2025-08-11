/**
 * ML Kit Processing Helper with Retry Logic
 * Provides robust error handling and retry mechanisms for ML Kit operations
 */

import { ImagePathHelper } from '../helpers/imagePathHelper';
import * as FileSystem from 'expo-file-system';

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface ProcessingResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTime: number;
}

export class MLKitProcessingHelper {
  private static defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    delayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 2000
  };

  /**
   * Execute ML Kit operation with retry logic and error handling
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    imagePath: string,
    operationName: string,
    retryConfig: RetryConfig = MLKitProcessingHelper.defaultRetryConfig
  ): Promise<ProcessingResult<T>> {
    const startTime = Date.now();
    let lastError: any;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        console.log(`🔄 ${operationName} attempt ${attempt}/${retryConfig.maxAttempts} for: ${imagePath}`);
        
        // Simple existence check on first attempt only
        if (attempt === 1) {
          const stats = await FileSystem.getInfoAsync(imagePath);
          if (!stats.exists) {
            throw new Error(`File not found: ${imagePath}`);
          }
        }
        
        const result = await operation();
        const totalTime = Date.now() - startTime;
        
        return {
          success: true,
          data: result,
          attempts: attempt,
          totalTime
        };
        
      } catch (error) {
        lastError = error;
        
        console.warn(`⚠️ ${operationName} attempt ${attempt} failed: ${error}`);
        
        // Calculate delay for next attempt
        if (attempt < retryConfig.maxAttempts) {
          const delay = Math.min(
            retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
            retryConfig.maxDelayMs
          );
          
          console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }
    
    const totalTime = Date.now() - startTime;
    console.error(`❌ ${operationName} failed after ${retryConfig.maxAttempts} attempts in ${totalTime}ms`);
    
    return {
      success: false,
      error: lastError?.toString() || 'Unknown error',
      attempts: retryConfig.maxAttempts,
      totalTime
    };
  }

  /**
   * Validate and convert image path with error handling
   */
  static async prepareImagePath(imagePath: string): Promise<{
    success: boolean;
    convertedPath?: string;
    error?: string;
  }> {
    try {
      // Simple existence check only
      const stats = await FileSystem.getInfoAsync(imagePath);
      if (!stats.exists) {
        return { success: false, error: 'File not found' };
      }

      // Convert to ML Kit format
      const convertedPath = ImagePathHelper.convertToMLKitPath(imagePath);
      return { success: true, convertedPath };
      
    } catch (error) {
      return { success: false, error: error?.toString() || 'Path preparation failed' };
    }
  }

  /**
   * Delay helper for retry logic
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get fallback data for failed operations
   */
  static getFallbackData(operationType: string): any {
    switch (operationType) {
      case 'imageLabeling':
        return [];
      case 'faceDetection':
        return { faces: [], count: 0, emotions: [] };
      case 'textRecognition':
        return { fullText: '', blocks: [], hasText: false, languages: [] };
      case 'qualityAssessment':
        return {
          overall: 0.5,
          brightness: 0.5,
          blur: 0.5,
          aesthetic: 0.5,
          sharpness: 0.5,
          contrast: 0.5,
          saturation: 0.5,
          exposure: 0.5
        };
      case 'sceneAnalysis':
        return {
          scene: 'unknown',
          environment: 'unknown',
          activities: [],
          objects: [],
          confidence: 0.5
        };
      default:
        return null;
    }
  }
}
