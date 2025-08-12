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
  
  // Enhanced Quality Analysis - NEW
  contrast_score?: number | null;
  exposure_score?: number | null;
  saturation_score?: number | null;
  sharpness_score?: number | null;
  
  // Scene info - nullable for database compatibility
  scene_type: string | null;              // Primary scene
  image_orientation: string | null;       // Orientation
  
  // Enhanced Scene Analysis - NEW
  scene_setting?: string[] | null;
  scene_weather?: string | null;
  scene_time_of_day?: string | null;
  scene_environment?: string | null;
  
  // Text detection
  has_text: boolean;                      // Whether text was detected
  
  // Enhanced Text Analysis - NEW
  text_full_content?: string | null;
  text_languages?: string[] | null;
  text_block_count?: number;
  
  // Enhanced Face Analysis - NEW
  face_landmarks?: Array<{
    type: string;
    position: { x: number; y: number };
  }> | null;
  face_head_poses?: Array<{
    yaw: number;
    roll: number;
  }> | null;
  face_eye_states?: Array<{
    leftOpen: number;
    rightOpen: number;
  }> | null;
  face_expressions?: Array<{
    smiling: number;
  }> | null;
  
  // ML Kit Processing Metadata - NEW
  mlkit_processing_time?: number | null;
  mlkit_confidence_overall?: number | null;
  mlkit_confidence_face?: number | null;
  mlkit_confidence_object?: number | null;
  mlkit_confidence_text?: number | null;
  mlkit_analysis_date?: Date | null;
  mlkit_mapping_version?: string | null;
  mlkit_device_platform?: string | null;
  
  // Optional text content
  caption?: string;                // Generated from analysis
  vision_summary?: string;         // Comprehensive summary
  
  // Enhanced spatial data storage - NEW
  object_coordinates?: Array<{
    label: string;
    confidence: number;
    boundingBox: BoundingBox;
    category?: string;
    trackingId?: number;
  }> | null;
  
  // Face coordinates and details - NEW
  face_coordinates?: Array<{
    boundingBox: BoundingBox;
    landmarks?: FaceLandmark[];
    emotions: EmotionClassification[];
    headPose?: {
      yaw: number;
      roll: number;
    };
    eyeState?: {
      leftOpen: number;
      rightOpen: number;
    };
    expressions?: {
      smiling: number;
    };
  }> | null;
  
  // Text regions with spatial data - NEW
  text_regions?: Array<{
    text: string;
    boundingBox: BoundingBox;
    confidence: number;
    language?: string;
  }> | null;
  
  // Enhanced scene composition analysis - NEW
  composition_analysis?: {
    dominantColors: Array<{
      color: string;
      percentage: number;
    }>;
    spatialLayout: {
      topObjects: string[];
      centerObjects: string[];
      bottomObjects: string[];
      leftObjects: string[];
      rightObjects: string[];
    };
    visualBalance: number;
    ruleOfThirds: boolean;
    symmetry: number;
  } | null;
  
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
