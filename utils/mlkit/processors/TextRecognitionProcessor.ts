/**
 * Text Recognition Processor for ML Kit
 * Handles Google ML Kit text recognition (OCR)
 */

import TextRecognition from '@react-native-ml-kit/text-recognition';
import { TextAnalysis, TextBlock, ProcessingStatus } from '../types/MLKitTypes';
import { ImagePathHelper } from '../helpers/imagePathHelper';

export interface TextRecognitionConfig {
  language: string;
  enableLanguageDetection: boolean;
  minConfidence: number;
}

export class TextRecognitionProcessor {
  private config: TextRecognitionConfig;

  constructor(config: TextRecognitionConfig = {
    language: 'en',
    enableLanguageDetection: true,
    minConfidence: 0.5
  }) {
    this.config = config;
  }

  /**
   * Process image for text using ML Kit OCR
   */
  public async processImage(imagePath: string): Promise<TextAnalysis> {
    try {
      // Validate input
      if (!imagePath || typeof imagePath !== 'string' || imagePath.trim().length === 0) {
        console.warn('⚠️ Invalid image path provided for text recognition');
        return this.getFallbackTextAnalysis();
      }

      try {
        // Convert path to ML Kit compatible format with validation
        let mlkitPath: string;
        try {
          mlkitPath = ImagePathHelper.convertToMLKitPath(imagePath);
          // console.log(`📁 Converted path for ML Kit: ${mlkitPath}`);
          
          // Validate the converted path
          if (!mlkitPath || mlkitPath.length === 0) {
            throw new Error('Path conversion resulted in empty string');
          }
          
        } catch (pathError) {
          console.error(`❌ Path conversion failed for text recognition:`, pathError);
          return this.getFallbackTextAnalysis();
        }

        // Use the official ML Kit text recognition API
        // console.log(`🔍 Calling ML Kit text recognition with: ${mlkitPath}`);
        const result = await TextRecognition.recognize(mlkitPath);

        if (!result || !result.text) {
          // PRODUCTION: Reduced logging - only errors
          // No text found in image
          return {
            fullText: '',
            blocks: [],
            hasText: false,
            languages: [this.config.language]
          };
        }

        // Convert ML Kit results to our format
        const blocks: TextBlock[] = (result.blocks || []).map((block: any) => ({
          text: block.text || '',
          confidence: Math.max(0, Math.min(1, block.confidence || 0.8)),
          boundingBox: {
            left: block.frame?.left || 0,
            top: block.frame?.top || 0,
            right: block.frame?.right || 0,
            bottom: block.frame?.bottom || 0,
            width: (block.frame?.right || 0) - (block.frame?.left || 0),
            height: (block.frame?.bottom || 0) - (block.frame?.top || 0)
          },
          lines: (block.lines || []).map((line: any) => ({
            text: line.text || '',
            confidence: Math.max(0, Math.min(1, line.confidence || 0.8)),
            boundingBox: {
              left: line.frame?.left || 0,
              top: line.frame?.top || 0,
              right: line.frame?.right || 0,
              bottom: line.frame?.bottom || 0,
              width: (line.frame?.right || 0) - (line.frame?.left || 0),
              height: (line.frame?.bottom || 0) - (line.frame?.top || 0)
            }
          }))
        }));

        const fullText = result.text || '';
        const hasText = fullText.trim().length > 0;

        console.log(`📝 Text recognition results: ${blocks.length} blocks, ${fullText.length} characters`);

        return {
          fullText,
          blocks,
          hasText,
          languages: [this.config.language] // ML Kit doesn't always provide language detection
        };

      } catch (error) {
        console.warn('⚠️ ML Kit text recognition failed:', error);
        
        // Simple error logging
        if (error && error.toString().includes('FileNotFoundException')) {
          console.error(`🔍 File not found for text recognition: ${imagePath}`);
          console.error(`Error details:`, error);
        }
        
        return this.getFallbackTextAnalysis();
      }

    } catch (error) {
      console.error('❌ Error processing text:', error);
      return this.getFallbackTextAnalysis();
    }
  }

  /**
   * Fallback text analysis when ML Kit is not available
   */
  private getFallbackTextAnalysis(): TextAnalysis {
    return {
      fullText: '',
      blocks: [],
      hasText: false,
      languages: [this.config.language]
    };
  }

  /**
   * Process multiple images in batch
   */
  public async processBatch(
    imagePaths: string[],
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<{ path: string; text: TextAnalysis }[]> {
    const results: { path: string; text: TextAnalysis }[] = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      
      try {
        // Update progress
        if (onProgress) {
          onProgress({
            status: 'processing',
            progress: (i / imagePaths.length) * 100,
            currentStep: `Recognizing text in image ${i + 1} of ${imagePaths.length}`,
            estimatedTimeRemaining: ((imagePaths.length - i) * 1200) // Rough estimate
          });
        }

        const text = await this.processImage(imagePath);
        results.push({ path: imagePath, text });

      } catch (error) {
        console.error(`❌ Error processing text in image ${imagePath}:`, error);
        results.push({ 
          path: imagePath, 
          text: { fullText: '', blocks: [], hasText: false, languages: [] }
        });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 100,
        currentStep: 'Text recognition complete'
      });
    }

    return results;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<TextRecognitionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): TextRecognitionConfig {
    return { ...this.config };
  }
}
