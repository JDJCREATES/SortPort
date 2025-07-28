// Core sorting types for LangChain operations

export interface VirtualImage {
  id: string;
  user_id: string;
  original_path: string | null;
  original_name: string | null;
  hash: string | null;
  thumbnail: string | null;
  virtual_name: string | null;
  virtual_tags: string[] | null;
  virtual_albums: string[] | undefined;
  virtual_description: string | null;
  nsfw_score: number | null;
  isflagged: boolean | null;
  caption: string | null;
  vision_summary: string | null;
  vision_sorted: boolean | null;
  metadata: Record<string, any> | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
  sortorder: number | null;
  date_taken?: string | null;
  date_modified?: string | null;
  date_imported?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_name?: string | null;
  location_country?: string | null;
  location_city?: string | null;
  dominant_colors?: string[] | null;
  detected_objects?: string[] | null;
  detected_faces_count?: number | null;
  scene_type?: string | null;
  brightness_score?: number | null;
  blur_score?: number | null;
  quality_score?: number | null;
  aesthetic_score?: number | null;
  emotion_detected?: string[] | null;
  activity_detected?: string[] | null;
  image_orientation?: string | null;
}

export interface SortingContext {
  query: string;
  userImages: VirtualImage[];
  sortType: SortType;
  preferences: UserSortingPreferences;
  constraints: SortingConstraints;
}

export type SortType = 'tone' | 'scene' | 'custom' | 'thumbnail' | 'chronological' | 'smart_album';

export interface UserSortingPreferences {
  preferredSort: SortType;
  useVisionSparingly: boolean;
  maxVisionCalls: number;
  favoriteStyles: string[];
  excludeNsfw: boolean;
}

export interface SortingConstraints {
  maxResults: number;
  maxProcessingTime: number; // milliseconds
  maxCredits: number;
  requireConfidence: number; // 0-1
}

// Chain input/output types
export interface ChainInput {
  query: string;
  images: VirtualImage[];
  context: SortingContext;
  userId: string;
}

export interface ChainOutput {
  sortedImages: SortedImageResult[];
  reasoning: string;
  confidence: number;
  metadata: ChainMetadata;
}

export interface SortedImageResult {
  image: VirtualImage;
  sortScore: number;
  reasoning: string;
  position: number;
  metadata: {
    tone?: string;
    scene?: string;
    features?: string[];
    emotions?: string[];
    primaryColor?: string;
    composition?: string;
    confidence?: number;
    thumbnailPurpose?: "album" | "collection" | "showcase" | "preview";
    qualityLevel?: "high" | "medium" | "any";
    technicalScore?: number;
    visualScore?: number;
    representativenessScore?: number;
    factors?: any;
    queryComplexity?: any;
    criteriaUsed?: any;
    albumInfo?: any;
    albumName?: string;
    isAlbumHeader?: boolean;
    albumTheme?: string;
    inAlbum?: string;
    // Added for relevance-based sorting
    componentScores?: {
      content?: number;
      temporal?: number;
      quality?: number;
      similarity?: number;
      semantic?: number;
      custom?: number;
    };
    sortingMethod?: string;
  };
}

export interface ChainMetadata {
  chainType: string;
  processingTime: number;
  usedVision: boolean;
  visionCallCount: number;
  embeddingOperations: number;
  costBreakdown: {
    embedding: number;
    vision: number;
    processing: number;
    total: number;
  };
  // Additional placeholder properties for chain adapter compatibility
  isPlaceholder?: boolean;
  groupCount?: number;
  thumbnailCount?: number;
  successRate?: number;
  qualityScore?: number;
}

// Embedding and vector operations
export interface EmbeddingQuery {
  text: string;
  type: 'query' | 'description' | 'caption';
}

export interface VectorSearchResult {
  image: VirtualImage;
  similarity: number;
  distance: number;
}

// Vision analysis types
export interface VisionAnalysisRequest {
  atlasUrl: string;
  imageMap: Record<string, { imageId: string; bounds: any }>;
  analysisType: 'sorting' | 'thumbnail' | 'description';
  query?: string;
}

export interface VisionAnalysisResult {
  imageAnalyses: Record<string, ImageVisionAnalysis>;
  overallAnalysis: string;
  confidence: number;
}

export interface ImageVisionAnalysis {
  imageId: string;
  description: string;
  tone: string;
  scene: string;
  features: string[];
  emotions: string[];
  composition: string;
  suitabilityScore: number; // for the given query
  reasoning: string;
}

// Atlas generation
export interface AtlasGeneration {
  images: VirtualImage[];
  gridSize: [number, number]; // e.g., [3, 3]
  imageSize: [number, number]; // e.g., [300, 300]
  padding: number;
  labels: boolean;
}

export interface AtlasResult {
  atlasBuffer: Buffer;
  imageMap: Record<string, {
    imageId: string;
    originalPath: string;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  metadata: {
    totalImages: number;
    gridSize: [number, number];
    generatedAt: string;
  };
}

// Chain-specific types
export interface ToneChainInput extends ChainInput {
  targetTone: string;
  toneIntensity: 'subtle' | 'moderate' | 'strong';
}

export interface SceneChainInput extends ChainInput {
  sceneType: string;
  locationPreference?: string;
  timeOfDay?: string;
}

export interface ThumbnailChainInput extends ChainInput {
  thumbnailCriteria: {
    composition: string[];
    quality: 'high' | 'medium' | 'any';
    representativeness: number; // 0-1
  };
}
