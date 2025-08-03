/**
 * Quality Assessment Processor for ML Kit
 * Analyzes image quality metrics using ML Kit labels and face detection
 */

import { QualityScores, ProcessingStatus } from '../types/MLKitTypes';
import { runImageLabeling } from './ImageLabelingProcessor';

export interface QualityAssessmentConfig {
  enableBrightnessAnalysis: boolean;
  enableBlurDetection: boolean;
  enableAestheticScoring: boolean;
  enableContrastAnalysis: boolean;
}

export class QualityAssessmentProcessor {
  private config: QualityAssessmentConfig;

  constructor(config: QualityAssessmentConfig = {
    enableBrightnessAnalysis: true,
    enableBlurDetection: true,
    enableAestheticScoring: true,
    enableContrastAnalysis: true
  }) {
    this.config = config;
  }

  /**
   * Process image for quality metrics using ML Kit data
   */
  public async processImage(imagePath: string): Promise<QualityScores> {
    try {
      console.log(`⭐ Processing image for quality: ${imagePath}`);
      
      const qualityScores = await this.analyzeImageQuality(imagePath);

      console.log(`✅ Quality analysis complete - Overall: ${(qualityScores.overall * 100).toFixed(1)}%`);
      return qualityScores;

    } catch (error) {
      console.error('❌ Error processing image quality:', error);
      return this.getFallbackQualityScores();
    }
  }

  /**
   * Analyze image quality using ML Kit labels
   */
  private async analyzeImageQuality(imagePath: string): Promise<QualityScores> {
    try {
      // console.log(`🏷️ Getting ML Kit data for quality assessment: ${imagePath}`);
      
      // Get image labels from ML Kit
      const labelResults = await runImageLabeling([imagePath]);
      const labels = labelResults[imagePath] || [];
      
      console.log(`📊 Found ${labels.length} labels for quality assessment`);
      
      // Extract quality indicators from labels
      const qualityIndicators = this.extractQualityFromLabels(labels);
      
      // Calculate overall quality based on available data
      const qualityScores = this.calculateQualityScores(qualityIndicators, imagePath);
      
      return qualityScores;

    } catch (error) {
      console.error('❌ Error in quality analysis:', error);
      return this.getFallbackQualityScores();
    }
  }

  /**
   * Extract quality indicators from image labels
   */
  private extractQualityFromLabels(labels: { text: string; confidence: number }[]): {
    sharpnessScore: number;
    aestheticScore: number;
    brightnessScore: number;
    compositionScore: number;
  } {
    const labelTexts = labels.map(label => label.text.toLowerCase());
    const avgConfidence = labels.length > 0 ? labels.reduce((sum, label) => sum + label.confidence, 0) / labels.length : 0.5;
    
    // Sharpness indicators from labels
    const sharpnessIndicators = ['clear', 'sharp', 'detailed', 'crisp', 'focused'];
    const blurIndicators = ['blur', 'blurry', 'unfocused', 'motion'];
    
    let sharpnessScore = avgConfidence; // Base on label confidence
    if (labelTexts.some(label => sharpnessIndicators.some(indicator => label.includes(indicator)))) {
      sharpnessScore = Math.min(1.0, sharpnessScore + 0.2);
    }
    if (labelTexts.some(label => blurIndicators.some(indicator => label.includes(indicator)))) {
      sharpnessScore = Math.max(0.1, sharpnessScore - 0.3);
    }
    
    // Aesthetic indicators
    const aestheticPositive = ['beautiful', 'scenic', 'landscape', 'portrait', 'art', 'colorful', 'vibrant'];
    const aestheticNegative = ['dark', 'grainy', 'poor', 'low quality'];
    
    let aestheticScore = avgConfidence;
    if (labelTexts.some(label => aestheticPositive.some(indicator => label.includes(indicator)))) {
      aestheticScore = Math.min(1.0, aestheticScore + 0.3);
    }
    if (labelTexts.some(label => aestheticNegative.some(indicator => label.includes(indicator)))) {
      aestheticScore = Math.max(0.1, aestheticScore - 0.2);
    }
    
    // Brightness indicators
    const brightIndicators = ['bright', 'light', 'sunny', 'illuminated', 'well-lit'];
    const darkIndicators = ['dark', 'shadow', 'dim', 'underexposed'];
    
    let brightnessScore = 0.6; // Default neutral brightness
    if (labelTexts.some(label => brightIndicators.some(indicator => label.includes(indicator)))) {
      brightnessScore = 0.8;
    }
    if (labelTexts.some(label => darkIndicators.some(indicator => label.includes(indicator)))) {
      brightnessScore = 0.3;
    }
    
    // Composition score based on subject matter
    const compositionPositive = ['portrait', 'landscape', 'architecture', 'nature', 'person', 'face'];
    let compositionScore = avgConfidence;
    if (labelTexts.some(label => compositionPositive.some(indicator => label.includes(indicator)))) {
      compositionScore = Math.min(1.0, compositionScore + 0.2);
    }
    
    console.log(`🎨 Quality from labels - Sharpness: ${sharpnessScore.toFixed(2)}, Aesthetic: ${aestheticScore.toFixed(2)}`);
    
    return {
      sharpnessScore,
      aestheticScore,
      brightnessScore,
      compositionScore
    };
  }

  /**
   * Calculate final quality scores
   */
  private calculateQualityScores(
    indicators: { sharpnessScore: number; aestheticScore: number; brightnessScore: number; compositionScore: number },
    imagePath: string
  ): QualityScores {
    // Base scores from ML Kit analysis
    let sharpness = indicators.sharpnessScore;
    let aesthetic = indicators.aestheticScore;
    let brightness = indicators.brightnessScore;
    let composition = indicators.compositionScore;
    
    // Ensure scores are within bounds
    sharpness = Math.max(0, Math.min(1, sharpness));
    aesthetic = Math.max(0, Math.min(1, aesthetic));
    brightness = Math.max(0, Math.min(1, brightness));
    composition = Math.max(0, Math.min(1, composition));
    
    // Calculate overall score
    const overall = (sharpness * 0.3 + aesthetic * 0.3 + brightness * 0.2 + composition * 0.2);
    
    // Blur is inverse of sharpness
    const blur = 1 - sharpness;
    
    console.log(`📊 Final quality scores - Overall: ${overall.toFixed(2)}, Sharpness: ${sharpness.toFixed(2)}, Aesthetic: ${aesthetic.toFixed(2)}`);
    
    return {
      overall,
      brightness,
      blur,
      aesthetic,
      sharpness,
      contrast: brightness, // Use brightness as proxy for contrast
      exposure: brightness,
      saturation: aesthetic // Use aesthetic as proxy for saturation
    };
  }

  /**
   * Get fallback quality scores when analysis fails
   */
  private getFallbackQualityScores(): QualityScores {
    return {
      overall: 0.6,
      brightness: 0.6,
      blur: 0.4,
      aesthetic: 0.6,
      sharpness: 0.6,
      contrast: 0.6,
      exposure: 0.6,
      saturation: 0.6
    };
  }

  /**
   * Process multiple images in batch
   */
  public async processBatch(
    imagePaths: string[],
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<{ path: string; quality: QualityScores }[]> {
    const results: { path: string; quality: QualityScores }[] = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      
      try {
        // Update progress
        if (onProgress) {
          onProgress({
            status: 'processing',
            progress: (i / imagePaths.length) * 100,
            currentStep: `Assessing quality ${i + 1} of ${imagePaths.length}`,
            estimatedTimeRemaining: ((imagePaths.length - i) * 1000) // Rough estimate
          });
        }

        const quality = await this.processImage(imagePath);
        results.push({ path: imagePath, quality });

      } catch (error) {
        console.error(`❌ Error processing quality for ${imagePath}:`, error);
        results.push({ path: imagePath, quality: this.getFallbackQualityScores() });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 100,
        currentStep: 'Quality assessment complete'
      });
    }

    return results;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<QualityAssessmentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): QualityAssessmentConfig {
    return { ...this.config };
  }
}
