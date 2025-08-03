/**
 * ML Kit Types - Comprehensive type definitions for Google ML Kit analysis
 * Maps directly to virtual_image table schema for optimal database storage
 */

// Core ML Kit Analysis Result
export interface MLKitAnalysisResult {
  imageId: string;
  imagePath: string;
  analysis: {
    // Image Labeling Results
    labels: ImageLabel[];
    
    // Object Detection Results  
    objects: DetectedObject[];
    
    // Face Detection Results
    faces: FaceAnalysis;
    
    // Text Recognition Results
    text: TextAnalysis;
    
    // Quality Assessment
    quality: QualityScores;
    
    // Scene Analysis
    scene: SceneAnalysis;
    
    // Processing metadata
    metadata: AnalysisMetadata;
  };
}

// Image Labels (for virtual_tags and detected_objects)
export interface ImageLabel {
  text: string;
  confidence: number;
  index?: number;
}

// Object Detection
export interface DetectedObject {
  labels: ImageLabel[];
  boundingBox: BoundingBox;
  trackingId?: number;
}

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

// Face Analysis (maps to detected_faces_count, emotion_detected)
export interface FaceAnalysis {
  faces: DetectedFace[];
  count: number;
  emotions: string[];
  averageAge?: number;
  genderDistribution?: { male: number; female: number };
}

export interface DetectedFace {
  boundingBox: BoundingBox;
  landmarks?: FaceLandmark[];
  headEulerAngleY?: number;
  headEulerAngleZ?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  trackingId?: number;
  emotions?: EmotionClassification[];
}

export interface FaceLandmark {
  type: string;
  position: { x: number; y: number };
}

export interface EmotionClassification {
  emotion: 'happy' | 'sad' | 'angry' | 'surprised' | 'disgusted' | 'fearful' | 'neutral';
  confidence: number;
}

// Text Recognition
export interface TextAnalysis {
  fullText: string;
  blocks: TextBlock[];
  hasText: boolean;
  languages: string[];
}

export interface TextBlock {
  text: string;
  confidence?: number;
  boundingBox: BoundingBox;
  lines: TextLine[];
}

export interface TextLine {
  text: string;
  confidence?: number;
  boundingBox: BoundingBox;
  elements: TextElement[];
}

export interface TextElement {
  text: string;
  confidence?: number;
  boundingBox: BoundingBox;
}

// Quality Scores (maps to quality_score, brightness_score, blur_score, aesthetic_score)
export interface QualityScores {
  overall: number;        // quality_score
  brightness: number;     // brightness_score
  blur: number;          // blur_score
  aesthetic: number;     // aesthetic_score
  sharpness: number;
  contrast: number;
  saturation: number;
  exposure: number;
}

// Scene Analysis (maps to scene_type, activity_detected, image_orientation)
export interface SceneAnalysis {
  primaryScene: string;           // scene_type
  activities: string[];           // activity_detected  
  orientation: 'portrait' | 'landscape' | 'square';  // image_orientation
  environment: 'indoor' | 'outdoor' | 'unknown';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown';
  weather?: string;
  setting: string[];
}

// Processing Metadata
export interface AnalysisMetadata {
  processingTime: number;
  modelVersions: {
    imageLabeling?: string;
    objectDetection?: string;
    faceDetection?: string;
    textRecognition?: string;
  };
  deviceInfo: {
    platform: string;
    model?: string;
    osVersion?: string;
  };
  analysisDate: string;
  confidence: {
    overall: number;
    imageLabeling: number;
    objectDetection: number;
    faceDetection: number;
    textRecognition: number;
  };
}

// Database mapping interfaces
export interface VirtualImageMLUpdate {
  // Text arrays
  virtual_tags: string[];           // From labels
  detected_objects: string[];       // From object detection
  emotion_detected: string[];       // From face analysis
  activity_detected: string[];      // From scene analysis
  
  // Counts
  detected_faces_count: number;     // From face analysis
  
  // Scores (0.0 - 1.0) - nullable for database compatibility
  quality_score: number | null;           
  brightness_score: number | null;        
  blur_score: number | null;             
  aesthetic_score: number | null;        
  
  // Scene info - nullable for database compatibility
  scene_type: string | null;              // Primary scene
  image_orientation: string | null;       // Orientation
  
  // Text detection
  has_text: boolean;                      // Whether text was detected
  
  // Optional text content
  caption?: string;                // Generated from analysis
  vision_summary?: string;         // Comprehensive summary
  
  // Metadata storage
  metadata: {
    mlkit_analysis: MLKitAnalysisResult['analysis'];
    processing_info: AnalysisMetadata;
    mapping_version?: string;
    mapped_at?: string;
  };
}

// Processing configuration
export interface MLKitConfig {
  // Image preprocessing
  maxImageSize: number;
  compressionQuality: number;
  
  // Feature toggles
  enableImageLabeling: boolean;
  enableObjectDetection: boolean;
  enableFaceDetection: boolean;
  enableTextRecognition: boolean;
  enableQualityAssessment: boolean;
  
  // Confidence thresholds
  labelConfidenceThreshold: number;
  objectConfidenceThreshold: number;
  faceConfidenceThreshold: number;
  
  // Performance settings
  batchSize: number;
  maxConcurrentProcessing: number;
  cachingEnabled: boolean;
  
  // Security settings
  secureProcessing: boolean;
  clearCacheAfterProcessing: boolean;
}

// Processing status
export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  error?: string;
}

// Batch processing
export interface BatchProcessingRequest {
  imageIds: string[];
  imagePaths: string[];
  config: MLKitConfig;
  onProgress?: (status: ProcessingStatus) => void;
  onComplete?: (results: MLKitAnalysisResult[]) => void;
  onError?: (error: Error) => void;
}

export interface BatchProcessingResult {
  successful: MLKitAnalysisResult[];
  failed: { imageId: string; error: string }[];
  totalProcessed: number;
  processingTime: number;
}
