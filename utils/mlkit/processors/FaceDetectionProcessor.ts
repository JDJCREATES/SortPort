/**
 * Face Detection Processor for ML Kit
 * Handles Google ML Kit face detection and emotion analysis
 */

import FaceDetection from '@react-native-ml-kit/face-detection';
import { 
  FaceAnalysis, 
  DetectedFace, 
  EmotionClassification, 
  ProcessingStatus 
} from '../types/MLKitTypes';
import { ImagePathHelper } from '../helpers/imagePathHelper';

export interface FaceDetectionConfig {
  minFaceSize: number;
  enableClassification: boolean;
  enableLandmarks: boolean;
  enableContours: boolean;
  enableTracking: boolean;
}

export class FaceDetectionProcessor {
  private config: FaceDetectionConfig;

  constructor(config: FaceDetectionConfig = {
    minFaceSize: 0.1,
    enableClassification: true,
    enableLandmarks: true,
    enableContours: false,
    enableTracking: false
  }) {
    this.config = config;
  }

  /**
   * Process image for faces using ML Kit
   */
  public async processImage(imagePath: string): Promise<FaceAnalysis> {
    try {
      console.log(`😊 Processing image for faces: ${imagePath}`);
      
      // Validate input
      if (!imagePath || typeof imagePath !== 'string' || imagePath.trim().length === 0) {
        console.warn('⚠️ Invalid image path provided for face detection');
        return this.getFallbackFaceAnalysis();
      }
      
      if (!FaceDetection) {
        console.warn('⚠️ ML Kit Face Detection not available, using fallback');
        return this.getFallbackFaceAnalysis();
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
          console.error(`❌ Path conversion failed for face detection:`, pathError);
          return this.getFallbackFaceAnalysis();
        }

        // Use the official ML Kit API
        // console.log(`🔍 Calling ML Kit face detection with: ${mlkitPath}`);
        const results = await FaceDetection.detect(mlkitPath, {
          performanceMode: 'accurate',
          landmarkMode: this.config.enableLandmarks ? 'all' : 'none',
          classificationMode: this.config.enableClassification ? 'all' : 'none',
          minFaceSize: this.config.minFaceSize
        });

        if (!results || !Array.isArray(results)) {
          console.log('✅ No faces detected in image');
          return {
            faces: [],
            count: 0,
            emotions: [],
            averageAge: undefined,
            genderDistribution: undefined
          };
        }

        // Convert ML Kit results to our format with FULL data extraction
        const detectedFaces: DetectedFace[] = results.map((face: any) => {
          const emotions: EmotionClassification[] = [];
          
          // Extract emotions based on ML Kit probabilities
          if (face.smilingProbability !== undefined && face.smilingProbability > 0.3) {
            emotions.push({ emotion: 'happy', confidence: Math.max(0, Math.min(1, face.smilingProbability)) });
          }
          if (face.leftEyeOpenProbability !== undefined && face.rightEyeOpenProbability !== undefined) {
            const avgEyeOpen = (face.leftEyeOpenProbability + face.rightEyeOpenProbability) / 2;
            if (avgEyeOpen < 0.3) {
              emotions.push({ emotion: 'sad', confidence: Math.max(0, Math.min(1, 1 - avgEyeOpen)) });
            }
          }
          if (emotions.length === 0) {
            emotions.push({ emotion: 'neutral', confidence: 0.7 });
          }

          // 🆕 Extract landmarks (if available)
          const landmarks: any[] = [];
          if (face.landmarks && Array.isArray(face.landmarks)) {
            face.landmarks.forEach((landmark: any) => {
              landmarks.push({
                type: landmark.type || 'unknown',
                position: {
                  x: landmark.position?.x || 0,
                  y: landmark.position?.y || 0
                }
              });
            });
          }

          return {
            boundingBox: face.boundingBox || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
            // 🆕 Add head pose data
            headEulerAngleY: face.headEulerAngleY || 0,
            headEulerAngleZ: face.headEulerAngleZ || 0,
            // 🆕 Add landmarks
            landmarks: landmarks.length > 0 ? landmarks : undefined,
            leftEyeOpenProbability: Math.max(0, Math.min(1, face.leftEyeOpenProbability || 0.5)),
            rightEyeOpenProbability: Math.max(0, Math.min(1, face.rightEyeOpenProbability || 0.5)),
            smilingProbability: Math.max(0, Math.min(1, face.smilingProbability || 0.5)),
            emotions
          };
        });

        // Extract unique emotions
        const allEmotions = new Set<string>();
        let totalAge = 0;
        let maleCount = 0;
        let femaleCount = 0;
        let ageCount = 0;

        for (const face of detectedFaces) {
          if (face.emotions) {
            for (const emotion of face.emotions) {
              if (emotion.confidence > 0.5) {
                allEmotions.add(emotion.emotion);
              }
            }
          }
          
          // Note: Gender and age detection would require additional ML Kit features
          // For now, we'll leave these undefined
        }

        const faceAnalysis: FaceAnalysis = {
          faces: detectedFaces,
          count: detectedFaces.length,
          emotions: Array.from(allEmotions),
          averageAge: ageCount > 0 ? totalAge / ageCount : undefined,
          genderDistribution: (maleCount > 0 || femaleCount > 0) ? { male: maleCount, female: femaleCount } : undefined
        };

        console.log(`✅ ML Kit found ${detectedFaces.length} faces with ${allEmotions.size} distinct emotions`);
        if (detectedFaces.length > 0) {
          console.log(`📊 Emotions detected: ${Array.from(allEmotions).join(', ')}`);
        }
        return faceAnalysis;

      } catch (mlError) {
        console.warn('⚠️ ML Kit face detection failed, using fallback:', mlError);
        
        // Use the new corruption detection
        if (mlError && mlError.toString().includes('FileNotFoundException')) {
          console.error(`🔍 File path issue detected for face detection: ${imagePath}`);
          console.error(`Error details:`, mlError);
          
          // Analyze the corruption
          const corruptionAnalysis = ImagePathHelper.detectPathCorruption(imagePath, mlError.toString());
          if (corruptionAnalysis.isCorrupted) {
            console.error(`💥 Face detection path corruption detected: ${corruptionAnalysis.corruptionType}`);
            console.error(`💡 Suggested fix: ${corruptionAnalysis.suggestedFix}`);
          }
        }
        
        return this.getFallbackFaceAnalysis();
      }

    } catch (error) {
      console.error('❌ Error processing faces:', error);
      return this.getFallbackFaceAnalysis();
    }
  }

  /**
   * Fallback face analysis when ML Kit is not available
   */
  private getFallbackFaceAnalysis(): FaceAnalysis {
    return {
      faces: [],
      count: 0,
      emotions: [],
      averageAge: undefined,
      genderDistribution: undefined
    };
  }

  /**
   * Process multiple images in batch
   */
  public async processBatch(
    imagePaths: string[],
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<{ path: string; faces: FaceAnalysis }[]> {
    const results: { path: string; faces: FaceAnalysis }[] = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      
      try {
        // Update progress
        if (onProgress) {
          onProgress({
            status: 'processing',
            progress: (i / imagePaths.length) * 100,
            currentStep: `Detecting faces in image ${i + 1} of ${imagePaths.length}`,
            estimatedTimeRemaining: ((imagePaths.length - i) * 800) // Rough estimate
          });
        }

        const faces = await this.processImage(imagePath);
        results.push({ path: imagePath, faces });

      } catch (error) {
        console.error(`❌ Error processing faces in image ${imagePath}:`, error);
        results.push({ 
          path: imagePath, 
          faces: { faces: [], count: 0, emotions: [] }
        });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 100,
        currentStep: 'Face detection complete'
      });
    }

    return results;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<FaceDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): FaceDetectionConfig {
    return { ...this.config };
  }
}
