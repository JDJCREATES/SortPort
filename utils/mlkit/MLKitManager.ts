/**
 * ML Kit Manager - Main orchestrator for all ML Kit processing
 * Handles comprehensive image analysis and database updates
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from '../supabase';
import { SecureImageCache } from './cache/SecureImageCache';
import { ImageLabelingProcessor } from './processors/ImageLabelingProcessor';
import { FaceDetectionProcessor } from './processors/FaceDetectionProcessor';
import { TextRecognitionProcessor } from './processors/TextRecognitionProcessor';
import { QualityAssessmentProcessor } from './processors/QualityAssessmentProcessor';
import { SceneAnalysisProcessor } from './processors/SceneAnalysisProcessor';
import { MLKitDiagnostics } from './diagnostics/MLKitDiagnostics';
import { VirtualImageIdService } from '../shared/VirtualImageIdService';

import {
  MLKitAnalysisResult,
  MLKitConfig,
  VirtualImageMLUpdate,
  ProcessingStatus,
  BatchProcessingRequest,
  BatchProcessingResult,
  AnalysisMetadata
} from './types/MLKitTypes';

// Import centralized logging system
import { 
  logError, 
  logWarn, 
  logInfo, 
  logDebug, 
  LogLevel,
  loggingConfig
} from '../shared/LoggingConfig';

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
      logInfo('Initializing ML Kit Manager', {
        component: 'MLKitManager',
        cachingEnabled: this.config.cachingEnabled,
        maxImageSize: this.config.maxImageSize,
        batchSize: this.config.batchSize
      });
      
      if (this.config.cachingEnabled) {
        await this.cache.initialize();
      }
      
      this.isInitialized = true;
      logInfo('ML Kit Manager initialized successfully', {
        component: 'MLKitManager',
        processorCount: 5
      });
    } catch (error) {
      logError('Failed to initialize ML Kit Manager', {
        component: 'MLKitManager',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
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

    const startTime = Date.now();

    try {
      // Basic file existence check only
      const stats = await FileSystem.getInfoAsync(imagePath);
      if (!stats.exists) {
        throw new Error(`Image file not found: ${imagePath}`);
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
      logError('Image processing failed', {
        component: 'MLKitManager',
        imageId,
        imagePath,
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Run diagnostics if it's a file path issue
      if (error && error.toString().includes('FileNotFoundException')) {
        try {
          const diagnostic = await MLKitDiagnostics.diagnoseImagePath(imagePath);
          logDebug('File path diagnostic completed', {
            component: 'MLKitManager',
            imageId,
            diagnostic,
            errorCount: diagnostic.errors?.length || 0
          });
          
          if (diagnostic.errors && diagnostic.errors.length > 0) {
            logWarn('Specific path issues detected', {
              component: 'MLKitManager',
              imageId,
              issues: diagnostic.errors
            });
          }
        } catch (diagError) {
          logWarn('Diagnostic check failed', {
            component: 'MLKitManager',
            imageId,
            diagnosticError: diagError instanceof Error ? diagError.message : String(diagError)
          });
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

    logInfo('Batch processing completed', {
      component: 'MLKitManager',
      successful: successful.length,
      failed: failed.length,
      totalProcessed: processedCount,
      processingTime: totalTime,
      averageTimePerImage: totalTime / processedCount
    });
    
    return result;
  }

  /**
   * Update virtual_image table with ML Kit analysis using ID-based service
   */
  private async updateVirtualImageDatabase(
    imageId: string, 
    analysisResult: MLKitAnalysisResult,
    userId: string
  ): Promise<void> {
    try {
      // Prepare ML Kit data for storage
      const mlkitData = {
        labels: analysisResult.analysis.labels,
        objects: analysisResult.analysis.objects,
        faces: analysisResult.analysis.faces,
        text: analysisResult.analysis.text,
        quality: analysisResult.analysis.quality,
        scene: analysisResult.analysis.scene,
        metadata: analysisResult.analysis.metadata,
        caption: this.generateCaption(analysisResult),
        summary: this.generateSummary(analysisResult),
        processedAt: new Date().toISOString()
      };

      // Use ID-based service for clean updates
      await VirtualImageIdService.updateVirtualImage({
        virtualImageId: imageId,
        mlkitData,
        tags: analysisResult.analysis.labels.map(label => label.text)
      });

      logDebug('Updated virtual image with ML Kit analysis', {
        component: 'MLKitManager',
        imageId,
        userId,
        labelsCount: analysisResult.analysis.labels.length,
        facesCount: analysisResult.analysis.faces.count,
        hasText: analysisResult.analysis.text.hasText
      });

    } catch (error) {
      logError('Failed to update virtual_image database', {
        component: 'MLKitManager',
        imageId,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
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
    logDebug('ML Kit Manager cleaned up', {
      component: 'MLKitManager',
      timestamp: new Date().toISOString()
    });
  }
}
