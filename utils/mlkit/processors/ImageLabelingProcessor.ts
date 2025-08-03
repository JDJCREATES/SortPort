/**
 * Image Labeling Processor using official react-native-ml-kit
 * Provides image labeling functionality using Google ML Kit
 */

import ImageLabeling from '@react-native-ml-kit/image-labeling';
import { ImageLabel, ProcessingStatus } from '../types/MLKitTypes';
import { ImagePathHelper } from '../helpers/imagePathHelper';
import { MLKitProcessingHelper } from '../helpers/MLKitProcessingHelper';
import { MLKitErrorHandler } from '../errors/MLKitErrorHandler';

export interface ImageLabelingConfig {
  confidenceThreshold: number;
  maxLabels: number;
}

/**
 * Function to run image labeling on multiple URIs
 * Returns a promise that resolves to a map from URI to labels array
 */
export async function runImageLabeling(uris: string[]): Promise<Record<string, { text: string; confidence: number }[]>> {
  const results: Record<string, { text: string; confidence: number }[]> = {};

  try {
    console.log('🏷️ Starting image labeling process...');

    // Process each image with the official ML Kit package
    for (const uri of uris) {
      try {
        console.log(`🏷️ Processing image: ${uri}`);
        
        // Validate input URI
        if (!uri || typeof uri !== 'string' || uri.trim().length === 0) {
          console.warn(`⚠️ Invalid URI provided: ${uri}`);
          results[uri] = [];
          continue;
        }

        // Prepare and validate image path
        const pathResult = await MLKitProcessingHelper.prepareImagePath(uri);
        
        if (!pathResult.success) {
          console.error(`❌ Path preparation failed for ${uri}: ${pathResult.error}`);
          results[uri] = [];
          continue;
        }
        
        const imagePath = pathResult.convertedPath!;

        // Use the official ML Kit image labeling API
        console.log(`🔍 Calling ML Kit with validated path: ${imagePath}`);
        const labels = await ImageLabeling.label(imagePath);

        // Convert to our format
        const processedLabels: { text: string; confidence: number }[] = (labels || []).map(label => ({
          text: label.text || 'Unknown',
          confidence: Math.max(0, Math.min(1, label.confidence || 0))
        }));

        results[uri] = processedLabels;
        console.log(`✅ Found ${processedLabels.length} labels for ${uri}`);
        
      } catch (error) {
        // Use centralized error handling
        const errorResult = await MLKitErrorHandler.handleError(
          error, 
          uri, 
          'Image Labeling',
          true // attempt recovery
        );
        
        if (errorResult.recoveredPath && errorResult.shouldRetry) {
          console.log(`� Retrying with recovered path: ${errorResult.recoveredPath}`);
          // TODO: Implement retry logic with recovered path
        }
        
        // Use fallback data or empty array
        results[uri] = errorResult.fallbackData || [];
      }
    }

    return results;

  } catch (error) {
    console.error('❌ Error in image labeling process:', error);
    return {};
  }
}

export class ImageLabelingProcessor {
  private config: ImageLabelingConfig;

  constructor(config: ImageLabelingConfig = { confidenceThreshold: 0.5, maxLabels: 20 }) {
    this.config = config;
  }

  /**
   * Process image for labels using the new function-based approach with retry logic
   */
  public async processImage(imagePath: string): Promise<ImageLabel[]> {
    try {
      console.log(`🏷️ Processing image for labels: ${imagePath}`);
      
      // Use the processing helper with retry logic
      const result = await MLKitProcessingHelper.executeWithRetry(
        async () => {
          const results = await runImageLabeling([imagePath]);
          return results[imagePath] || [];
        },
        imagePath,
        'Image Labeling'
      );
      
      if (!result.success) {
        console.error(`❌ Image labeling failed: ${result.error}`);
        return this.getFallbackLabels();
      }
      
      const labels = result.data || [];
      
      // Convert to the expected format and apply filters
      return labels
        .filter(label => label.confidence >= this.config.confidenceThreshold)
        .slice(0, this.config.maxLabels)
        .map((label, index) => ({
          text: label.text,
          confidence: label.confidence,
          index
        }));

    } catch (error) {
      console.error('❌ Error processing image labels:', error);
      return this.getFallbackLabels();
    }
  }

  /**
   * Fallback labels when ML Kit is not available
   */
  private getFallbackLabels(): ImageLabel[] {
    return [
      { text: 'Image', confidence: 0.7, index: 0 },
      { text: 'Photo', confidence: 0.6, index: 1 }
    ];
  }

  /**
   * Process multiple images in batch
   */
  public async processBatch(
    imagePaths: string[],
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<{ path: string; labels: ImageLabel[] }[]> {
    const results: { path: string; labels: ImageLabel[] }[] = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      
      try {
        // Update progress
        if (onProgress) {
          onProgress({
            status: 'processing',
            progress: (i / imagePaths.length) * 100,
            currentStep: `Processing image ${i + 1} of ${imagePaths.length}`,
            estimatedTimeRemaining: ((imagePaths.length - i) * 1000) // Rough estimate
          });
        }

        const labels = await this.processImage(imagePath);
        results.push({ path: imagePath, labels });

      } catch (error) {
        console.error(`❌ Error processing image ${imagePath}:`, error);
        results.push({ path: imagePath, labels: [] });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 100,
        currentStep: 'Processing complete'
      });
    }

    return results;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ImageLabelingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): ImageLabelingConfig {
    return { ...this.config };
  }
}
