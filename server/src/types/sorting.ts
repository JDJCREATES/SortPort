// Core sorting types for LangChain operations

export interface VirtualImage {
  id: string;
  user_id: string;
  originalPath: string;
  originalName: string;
  hash: string;
  thumbnail: string | null;
  virtualName: string | null;
  virtualTags: string[] | null;
  virtualAlbum: string | null;
  virtual_description: string | null;
  nsfwScore: number | null;
  isFlagged: boolean | null;
  caption: string | null;
  visionSummary: string | null;
  vision_sorted: boolean | null;
  metadata: Record<string, any> | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
  sortOrder: number;
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
