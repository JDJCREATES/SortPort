/**
 * ML Kit Manager - Main orchestrator for all ML Kit processing
 * Handles comprehensive image analysis and database updates
 */

import { supabase } from '../supabase';
import { SecureImageCache } from './cache/SecureImageCache';
import { ImageLabelingProcessor } from './processors/ImageLabelingProcessor';
import { FaceDetectionProcessor } from './processors/FaceDetectionProcessor';
import { TextRecognitionProcessor } from './processors/TextRecognitionProcessor';
import { QualityAssessmentProcessor } from './processors/QualityAssessmentProcessor';
import { SceneAnalysisProcessor } from './processors/SceneAnalysisProcessor';
import { MLKitDiagnostics } from './diagnostics/MLKitDiagnostics';
import { FileValidator } from './validation/FileValidator';
import { MLKitProcessingHelper } from './helpers/MLKitProcessingHelper';

import {
  MLKitAnalysisResult,
  MLKitConfig,
  VirtualImageMLUpdate,
  ProcessingStatus,
  BatchProcessingRequest,
  BatchProcessingResult,
  AnalysisMetadata
} from './types/MLKitTypes';

export class MLKitManager {
  private static instance: MLKitManager;
  private cache: SecureImageCache;
  private config: MLKitConfig;
  
  // Processors
  private imageLabelingProcessor: ImageLabelingProcessor;
  private faceDetectionProcessor: FaceDetectionProcessor;
  private textRecognitionProcessor: TextRecognitionProcessor;
  private qualityAssessmentProcessor: QualityAssessmentProcessor;
  private sceneAnalysisProcessor: SceneAnalysisProcessor;
  
  private isInitialized = false;
  private activeProcessing = new Set<string>();

  private constructor(config: MLKitConfig) {
    this.config = config;
    this.cache = SecureImageCache.getInstance();
    
    // Initialize processors
    this.imageLabelingProcessor = new ImageLabelingProcessor({
      confidenceThreshold: config.labelConfidenceThreshold,
      maxLabels: 20
    });
    
    this.faceDetectionProcessor = new FaceDetectionProcessor();
    this.textRecognitionProcessor = new TextRecognitionProcessor();
    this.qualityAssessmentProcessor = new QualityAssessmentProcessor();
    this.sceneAnalysisProcessor = new SceneAnalysisProcessor();
  }

  public static getInstance(config?: MLKitConfig): MLKitManager {
    if (!MLKitManager.instance) {
      const defaultConfig: MLKitConfig = {
        maxImageSize: 1920,
        compressionQuality: 0.8,
        enableImageLabeling: true,
        enableObjectDetection: true,
        enableFaceDetection: true,
        enableTextRecognition: true,
        enableQualityAssessment: true,
        labelConfidenceThreshold: 0.5,
        objectConfidenceThreshold: 0.5,
        faceConfidenceThreshold: 0.5,
        batchSize: 10,
        maxConcurrentProcessing: 3,
        cachingEnabled: true,
        secureProcessing: true,
        clearCacheAfterProcessing: true
      };
      MLKitManager.instance = new MLKitManager(config || defaultConfig);
    }
    return MLKitManager.instance;
  }

  /**
   * Initialize the ML Kit system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Initializing ML Kit Manager...');
      
      if (this.config.cachingEnabled) {
        await this.cache.initialize();
      }
      
      this.isInitialized = true;
      console.log('✅ ML Kit Manager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ML Kit Manager:', error);
      throw error;
    }
  }

  /**
   * Process a single image with full ML Kit analysis
   */
  public async processImage(
    imageId: string, 
    imagePath: string,
    userId: string,
    options: { skipDatabaseUpdate?: boolean } = {}
  ): Promise<MLKitAnalysisResult> {
    await this.ensureInitialized();

    if (this.activeProcessing.has(imageId)) {
      throw new Error(`Image ${imageId} is already being processed`);
    }

    this.activeProcessing.add(imageId);

    try {
      const startTime = Date.now();

      // Validate file before processing
      const validationResult = await FileValidator.validateFile(imagePath);
      
      if (!validationResult.accessible) {
        console.error(`❌ File validation failed for ${imageId}: ${validationResult.error}`);
        
        // Check for path corruption
        const corruptionCheck = FileValidator.detectPathCorruption(imagePath);
        if (corruptionCheck.isCorrupted) {
          console.error(`💥 Path corruption detected in ${imageId}:`);
          corruptionCheck.issues.forEach(issue => console.error(`  - ${issue}`));
          corruptionCheck.suggestions.forEach(suggestion => console.error(`  💡 ${suggestion}`));
        }
        
        throw new Error(`File validation failed: ${validationResult.error}`);
      }

      // Cache image for processing
      let processImagePath = imagePath;
      if (this.config.cachingEnabled) {
        processImagePath = await this.cache.cacheImage(imageId, imagePath);
      }

      // Run all processors in parallel for efficiency
      const [labelResults, faceResults, textResults, qualityResults, sceneResults] = await Promise.all([
        this.config.enableImageLabeling ? this.imageLabelingProcessor.processImage(processImagePath) : [],
        this.config.enableFaceDetection ? this.faceDetectionProcessor.processImage(processImagePath) : { faces: [], count: 0, emotions: [] },
        this.config.enableTextRecognition ? this.textRecognitionProcessor.processImage(processImagePath) : { fullText: '', blocks: [], hasText: false, languages: [] },
        this.config.enableQualityAssessment ? this.qualityAssessmentProcessor.processImage(processImagePath) : null,
        this.sceneAnalysisProcessor.processImage(processImagePath)
      ]);

      const processingTime = Date.now() - startTime;

      // Create analysis metadata
      const metadata: AnalysisMetadata = {
        processingTime,
        modelVersions: {
          imageLabeling: '1.0.0',
          objectDetection: '1.0.0',
          faceDetection: '1.0.0',
          textRecognition: '1.0.0'
        },
        deviceInfo: {
          platform: 'react-native',
          osVersion: 'unknown'
        },
        analysisDate: new Date().toISOString(),
        confidence: {
          overall: 0.85,
          imageLabeling: 0.80,
          objectDetection: 0.75,
          faceDetection: 0.90,
          textRecognition: 0.70
        }
      };

      // Compile comprehensive analysis result
      const analysisResult: MLKitAnalysisResult = {
        imageId,
        imagePath,
        analysis: {
          labels: labelResults,
          objects: [], // Will be populated when object detection is implemented
          faces: faceResults,
          text: textResults,
          quality: qualityResults || {
            overall: 0.5,
            brightness: 0.5,
            blur: 0.5,
            aesthetic: 0.5,
            sharpness: 0.5,
            contrast: 0.5,
            saturation: 0.5,
            exposure: 0.5
          },
          scene: sceneResults,
          metadata
        }
      };

      // Update database with results (only if not skipped)
      if (!options.skipDatabaseUpdate) {
        await this.updateVirtualImageDatabase(imageId, analysisResult, userId);
      }

      // Clean up cache if configured
      if (this.config.clearCacheAfterProcessing && this.config.cachingEnabled) {
        await this.cache.clearImage(imageId);
      }

      return analysisResult;

    } catch (error) {
      console.error(`❌ Error processing image ${imageId}:`, error);
      
      // Run diagnostics if it's a file path issue
      if (error && error.toString().includes('FileNotFoundException')) {
        console.log(`🔍 Running diagnostics for file path issue...`);
        try {
          const diagnostic = await MLKitDiagnostics.diagnoseImagePath(imagePath);
          console.error(`📊 Diagnostic report:`, diagnostic);
          
          if (diagnostic.errors.length > 0) {
            console.error(`🔴 Specific issues found:`);
            diagnostic.errors.forEach(err => console.error(`  - ${err}`));
          }
        } catch (diagError) {
          console.warn(`⚠️ Diagnostic check failed:`, diagError);
        }
      }
      
      throw error;
    } finally {
      this.activeProcessing.delete(imageId);
    }
  }

  /**
   * Process multiple images in batch
   */
  public async processBatch(request: BatchProcessingRequest): Promise<BatchProcessingResult> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const successful: MLKitAnalysisResult[] = [];
    const failed: { imageId: string; error: string }[] = [];

    // Process in batches to avoid overwhelming the system
    const batches = this.chunkArray(request.imageIds, this.config.batchSize);
    let processedCount = 0;

    for (const batch of batches) {
      // Limit concurrent processing
      const concurrent = Math.min(batch.length, this.config.maxConcurrentProcessing);
      const chunks = this.chunkArray(batch, concurrent);

      for (const chunk of chunks) {
        const promises = chunk.map(async (imageId, index) => {
          const imagePath = request.imagePaths[request.imageIds.indexOf(imageId)];
          
          try {
            const result = await this.processImage(imageId, imagePath, 'batch-user');
            successful.push(result);
          } catch (error) {
            failed.push({ 
              imageId, 
              error: error instanceof Error ? error.message : String(error) 
            });
          }

          processedCount++;
          
          // Update progress
          if (request.onProgress) {
            request.onProgress({
              status: 'processing',
              progress: (processedCount / request.imageIds.length) * 100,
              currentStep: `Processed ${processedCount} of ${request.imageIds.length} images`,
              estimatedTimeRemaining: ((request.imageIds.length - processedCount) * 1000)
            });
          }
        });

        await Promise.all(promises);
      }
    }

    const totalTime = Date.now() - startTime;
    
    const result: BatchProcessingResult = {
      successful,
      failed,
      totalProcessed: processedCount,
      processingTime: totalTime
    };

    // Notify completion
    if (request.onComplete) {
      request.onComplete(successful);
    }

    console.log(`📊 Batch processing complete: ${successful.length} successful, ${failed.length} failed in ${totalTime}ms`);
    return result;
  }

  /**
   * Update virtual_image table with ML Kit analysis
   */
  private async updateVirtualImageDatabase(
    imageId: string, 
    analysisResult: MLKitAnalysisResult,
    userId: string
  ): Promise<void> {
    try {
      // Map analysis to database fields
      const update: VirtualImageMLUpdate = {
        virtual_tags: analysisResult.analysis.labels.map(label => label.text),
        detected_objects: analysisResult.analysis.objects.map(obj => obj.labels.map(l => l.text)).flat(),
        emotion_detected: analysisResult.analysis.faces.emotions,
        activity_detected: analysisResult.analysis.scene.activities,
        detected_faces_count: analysisResult.analysis.faces.count,
        quality_score: analysisResult.analysis.quality.overall,
        brightness_score: analysisResult.analysis.quality.brightness,
        blur_score: analysisResult.analysis.quality.blur,
        aesthetic_score: analysisResult.analysis.quality.aesthetic,
        scene_type: analysisResult.analysis.scene.primaryScene,
        image_orientation: analysisResult.analysis.scene.orientation,
        caption: this.generateCaption(analysisResult),
        vision_summary: this.generateSummary(analysisResult),
        metadata: {
          mlkit_analysis: analysisResult.analysis,
          processing_info: analysisResult.analysis.metadata
        },
        has_text: analysisResult.analysis.text.hasText
      };

      // Update the virtual_image record
      const { error } = await supabase
        .from('virtual_image')
        .update(update)
        .eq('id', imageId)
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Failed to update virtual_image:', error);
        throw error;
      }

    } catch (error) {
      console.error(`❌ Error updating database for image ${imageId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a descriptive caption from analysis
   */
  private generateCaption(analysisResult: MLKitAnalysisResult): string {
    const { labels, faces, scene, text } = analysisResult.analysis;
    
    let caption = '';
    
    // Scene and environment
    if (scene.environment !== 'unknown') {
      caption += `${scene.environment} `;
    }
    
    // Primary objects/labels
    const topLabels = labels.slice(0, 3).map(l => l.text);
    if (topLabels.length > 0) {
      caption += `showing ${topLabels.join(', ')} `;
    }
    
    // Faces
    if (faces.count > 0) {
      caption += `with ${faces.count} ${faces.count === 1 ? 'person' : 'people'} `;
      if (faces.emotions.length > 0) {
        caption += `appearing ${faces.emotions[0]} `;
      }
    }
    
    // Time/setting
    if (scene.timeOfDay !== 'unknown') {
      caption += `during ${scene.timeOfDay} `;
    }
    
    // Text content
    if (text.hasText && text.fullText.length > 0) {
      caption += `containing text "${text.fullText.substring(0, 30)}${text.fullText.length > 30 ? '...' : ''}" `;
    }

    return caption.trim() || 'Image processed with ML Kit analysis';
  }

  /**
   * Generate a comprehensive summary
   */
  private generateSummary(analysisResult: MLKitAnalysisResult): string {
    const { labels, faces, scene, quality, text } = analysisResult.analysis;
    
    let summary = `ML Kit Analysis Summary:\n`;
    summary += `Scene: ${scene.primaryScene} ${scene.environment} setting\n`;
    summary += `Quality: ${(quality.overall * 100).toFixed(1)}% overall\n`;
    summary += `Labels: ${labels.map(l => `${l.text} (${(l.confidence * 100).toFixed(1)}%)`).join(', ')}\n`;
    
    if (faces.count > 0) {
      summary += `Faces: ${faces.count} detected with emotions: ${faces.emotions.join(', ')}\n`;
    }
    
    if (text.hasText) {
      summary += `Text: "${text.fullText}"\n`;
    }
    
    return summary;
  }

  // Utility methods

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get processing statistics
   */
  public getStats(): {
    activeProcessing: number;
    cacheStats: Promise<any>;
  } {
    return {
      activeProcessing: this.activeProcessing.size,
      cacheStats: this.cache.getStats()
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<MLKitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update virtual_image database with cached ML Kit analysis
   * Used for post-processing updates after AWS moderation completes
   */
  public async updateImageWithAnalysis(
    virtualImageId: string,
    analysisResult: MLKitAnalysisResult,
    userId: string
  ): Promise<void> {
    await this.updateVirtualImageDatabase(virtualImageId, analysisResult, userId);
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    await this.cache.clearAll();
    this.activeProcessing.clear();
    console.log('🧹 ML Kit Manager cleaned up');
  }
}
