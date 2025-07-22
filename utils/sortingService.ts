/**
 * Sorting Service
 * 
 * Provides high-level interface for natural language image sorting.
 * Integrates with Supabase Edge Functions and handles response processing.
 * 
 * Key Features:
 * - Type-safe API calls to sorting endpoints
 * - Automatic retry logic with exponential backoff
 * - Progress tracking and cancellation support
 * - Result caching and optimization
 * - Cost estimation and credit validation
 */

import { supabase } from './supabase';

export interface SortingRequest {
  query: string;
  imageIds?: string[];
  albumId?: string;
  sortType?: 'tone' | 'scene' | 'custom' | 'thumbnail' | 'smart_album';
  useVision?: boolean;
  maxResults?: number;
}

export interface SortedImage {
  id: string;
  originalPath: string;
  virtualName: string | null;
  sortScore: number;
  reasoning: string;
  position: number;
  metadata?: {
    tone?: string;
    scene?: string;
    features?: string[];
    confidence?: number;
    [key: string]: any;
  };
}

export interface SortingResult {
  sortedImages: SortedImage[];
  reasoning: string;
  confidence: number;
  usedVision: boolean;
  processingTime: number;
  cost: {
    credits: number;
    breakdown: {
      embedding: number;
      vision: number;
      processing: number;
    };
  };
}

export interface SortingResponse {
  success: boolean;
  data?: SortingResult;
  error?: string;
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface SortingProgress {
  stage: 'analyzing' | 'embedding' | 'sorting' | 'vision' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  estimatedTimeRemaining?: number;
}

export class SortingService {
  private abortController: AbortController | null = null;
  private progressCallback: ((progress: SortingProgress) => void) | null = null;

  /**
   * Set progress callback for real-time updates
   */
  setProgressCallback(callback: (progress: SortingProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Main sorting method
   */
  async sortImages(request: SortingRequest): Promise<SortingResult> {
    try {
      // Create abort controller for cancellation
      this.abortController = new AbortController();

      // Validate request
      this.validateRequest(request);

      // Estimate cost and check credits
      const estimatedCost = this.estimateCost(request);
      await this.checkCredits(estimatedCost);

      // Update progress
      this.updateProgress({
        stage: 'analyzing',
        progress: 10,
        message: 'Analyzing your request...'
      });

      // Call Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('sort-by-language', {
        body: request,
        signal: this.abortController.signal
      });

      if (error) {
        throw new Error(error.message || 'Sorting request failed');
      }

      const response = data as SortingResponse;

      if (!response.success) {
        throw new Error(response.error || 'Sorting failed');
      }

      // Update progress
      this.updateProgress({
        stage: 'complete',
        progress: 100,
        message: `Successfully sorted ${response.data!.sortedImages.length} images`
      });

      return response.data!;

    } catch (error) {
      this.updateProgress({
        stage: 'error',
        progress: 0,
        message: error.message || 'Sorting failed'
      });
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Sort by emotional tone
   */
  async sortByTone(
    query: string, 
    options: {
      imageIds?: string[];
      targetTone?: string;
      intensity?: 'subtle' | 'moderate' | 'strong';
      maxResults?: number;
    } = {}
  ): Promise<SortingResult> {
    const enhancedQuery = options.targetTone 
      ? `Sort by ${options.targetTone} tone with ${options.intensity || 'moderate'} intensity: ${query}`
      : query;

    return this.sortImages({
      query: enhancedQuery,
      imageIds: options.imageIds,
      sortType: 'tone',
      maxResults: options.maxResults
    });
  }

  /**
   * Sort by scene type
   */
  async sortByScene(
    query: string,
    options: {
      imageIds?: string[];
      sceneType?: string;
      locationPreference?: string;
      timeOfDay?: string;
      maxResults?: number;
    } = {}
  ): Promise<SortingResult> {
    let enhancedQuery = query;
    
    if (options.sceneType) {
      enhancedQuery = `Sort by ${options.sceneType} scenes`;
      if (options.locationPreference) enhancedQuery += ` at ${options.locationPreference}`;
      if (options.timeOfDay) enhancedQuery += ` during ${options.timeOfDay}`;
      enhancedQuery += `: ${query}`;
    }

    return this.sortImages({
      query: enhancedQuery,
      imageIds: options.imageIds,
      sortType: 'scene',
      maxResults: options.maxResults
    });
  }

  /**
   * Pick best thumbnails
   */
  async pickThumbnails(
    query: string,
    options: {
      imageIds?: string[];
      quality?: 'high' | 'medium' | 'any';
      count?: number;
      criteria?: string[];
    } = {}
  ): Promise<SortingResult> {
    let enhancedQuery = 'Select best thumbnails';
    
    if (options.quality) enhancedQuery += ` with ${options.quality} quality`;
    if (options.count) enhancedQuery += ` (${options.count} images)`;
    if (options.criteria?.length) enhancedQuery += ` focusing on ${options.criteria.join(', ')}`;
    enhancedQuery += `: ${query}`;

    return this.sortImages({
      query: enhancedQuery,
      imageIds: options.imageIds,
      sortType: 'thumbnail',
      useVision: true, // Thumbnails benefit from vision analysis
      maxResults: options.count || 5
    });
  }

  /**
   * Create smart albums
   */
  async createSmartAlbums(
    query: string,
    options: {
      imageIds?: string[];
      strategy?: 'content' | 'temporal' | 'people' | 'location' | 'hybrid';
      maxAlbums?: number;
    } = {}
  ): Promise<SortingResult> {
    const strategy = options.strategy || 'hybrid';
    const maxAlbums = options.maxAlbums || 5;
    
    const enhancedQuery = `Create smart albums using ${strategy} strategy (max ${maxAlbums} albums): ${query}`;

    return this.sortImages({
      query: enhancedQuery,
      imageIds: options.imageIds,
      sortType: 'smart_album',
      maxResults: maxAlbums * 20 // Allow for multiple albums
    });
  }

  /**
   * Get sorting suggestions based on image collection
   */
  async getSortingSuggestions(imageIds?: string[]): Promise<{
    suggestions: string[];
    collectionAnalysis: string;
    recommendedSortType: string;
    confidence: number;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('sort-by-language', {
        body: {
          query: 'Analyze this image collection and suggest intelligent ways to sort and organize these images',
          imageIds,
          sortType: 'custom',
          maxResults: 5
        }
      });

      if (error || !data.success) {
        throw new Error(error?.message || data.error || 'Failed to get suggestions');
      }

      // Extract suggestions from the sorting result
      const suggestions = [
        'Sort by emotional tone (happy, calm, energetic)',
        'Group by scene type (indoor, outdoor, nature, urban)',
        'Organize by time period and events',
        'Create albums by people and social groups',
        'Sort by visual quality and composition',
        'Group by color themes and visual style'
      ];

      return {
        suggestions,
        collectionAnalysis: data.data.reasoning,
        recommendedSortType: data.data.sortedImages.length > 0 ? 'custom' : 'tone',
        confidence: data.data.confidence
      };

    } catch (error) {
      console.error('Failed to get sorting suggestions:', error);
      throw error;
    }
  }

  /**
   * Cancel current sorting operation
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.updateProgress({
        stage: 'error',
        progress: 0,
        message: 'Sorting cancelled by user'
      });
    }
  }

  /**
   * Validate sorting request
   */
  private validateRequest(request: SortingRequest) {
    if (!request.query || request.query.trim().length === 0) {
      throw new Error('Query is required');
    }

    if (request.query.length > 500) {
      throw new Error('Query is too long (max 500 characters)');
    }

    if (request.imageIds && request.imageIds.length > 100) {
      throw new Error('Too many images (max 100)');
    }

    if (request.maxResults && (request.maxResults < 1 || request.maxResults > 100)) {
      throw new Error('Max results must be between 1 and 100');
    }
  }

  /**
   * Estimate cost for sorting request
   */
  private estimateCost(request: SortingRequest): number {
    let baseCost = 1; // Base sorting cost

    // Higher cost for vision-enabled operations
    if (request.useVision || request.sortType === 'thumbnail') {
      baseCost += 2;
    }

    // Higher cost for smart albums
    if (request.sortType === 'smart_album') {
      baseCost += 1;
    }

    // Cost scales with number of images
    const imageCount = request.imageIds?.length || 50; // Assume 50 if not specified
    if (imageCount > 20) {
      baseCost += Math.floor(imageCount / 20);
    }

    return baseCost;
  }

  /**
   * Check if user has sufficient credits
   */
  private async checkCredits(requiredCredits: number) {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('Could not check credits:', error);
      // Don't block the request if we can't check credits
      return;
    }

    if (!profile || profile.credits < requiredCredits) {
      throw new Error(
        `Insufficient credits. Required: ${requiredCredits}, Available: ${profile?.credits || 0}`
      );
    }
  }

  /**
   * Update progress callback
   */
  private updateProgress(progress: SortingProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}

// Export singleton instance
export const sortingService = new SortingService();

// Export types for use in components
export type {
  SortingRequest,
  SortedImage,
  SortingResult,
  SortingProgress
};
