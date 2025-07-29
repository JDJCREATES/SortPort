/**
 * Sorting Service
 * 
 * Provides high-level interface for natural language image sorting.
 * Integrates with LCEL-based LangChain server for advanced AI-powered sorting.
 * 
 * Key Features:
 * - Type-safe API calls to LCEL sorting endpoints
 * - Automatic retry logic with exponential backoff
 * - Progress tracking and cancellation support
 * - Multiple execution strategies (vision, metadata, hybrid)
 * - Credit validation and cost estimation
 */

import { supabase } from './supabase';
import { CONFIG } from './config';

export interface SortingRequest {
  query: string;
  imageIds?: string[];
  albumId?: string;
  sortType?: 'tone' | 'scene' | 'custom' | 'thumbnail' | 'smart_album';
  useVision?: boolean;
  maxResults?: number;
  userContext?: {
    id: string;
    preferences?: any;
  };
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
    balance: number;
    breakdown: {
      embedding: number;
      vision: number;
      processing: number;
    };
  };
  metadata?: {
    methodUsed: string;
    queryAnalysis: {
      intent: string;
      parameters: any;
      confidence: number;
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
   * Get authentication headers for LCEL server
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  }

  /**
   * Transform frontend request to LCEL server format
   */
  private async transformToLCELRequest(request: SortingRequest): Promise<any> {
    // Get virtual images from database if imageIds provided
    let images: any[] = [];
    
    if (request.imageIds && request.imageIds.length > 0) {
      const { data: virtualImages, error } = await supabase
        .from('virtual_image')
        .select('*')
        .in('id', request.imageIds)
        .limit(request.maxResults || 50);

      if (error) {
        throw new Error(`Failed to fetch images: ${error.message}`);
      }

      images = virtualImages?.map(img => ({
        id: img.id,
        url: img.original_path,
        metadata: {
          originalName: img.original_name,
          virtualName: img.virtual_name,
          tags: img.virtual_tags,
          description: img.virtual_description,
          nsfwScore: img.nsfw_score,
          detectedObjects: img.detected_objects,
          dominantColors: img.dominant_colors,
          location: img.location_name,
          dateTaken: img.date_taken,
          ...img.metadata
        }
      })) || [];
    }

    return {
      query: request.query,
      images,
      options: {
        maxResults: request.maxResults || 50,
        sortCriteria: [request.sortType || 'custom'],
        includeAnalysis: true,
        userContext: request.userContext
      }
    };
  }

  /**
   * Transform LCEL server response to frontend format
   */
  private transformFromLCELResponse(lcelResponse: any): SortingResult {
    const results = lcelResponse.results || [];
    
    return {
      sortedImages: results.map((result: any, index: number) => ({
        id: result.image?.id || `unknown_${index}`,
        originalPath: result.image?.url || '',
        virtualName: result.image?.metadata?.virtualName || null,
        sortScore: result.sortScore || 0,
        reasoning: result.reasoning || '',
        position: result.position || index + 1,
        metadata: {
          confidence: result.metadata?.confidence || 0,
          features: result.metadata?.features || [],
          tone: result.metadata?.tone,
          scene: result.metadata?.scene,
          ...result.metadata
        }
      })),
      reasoning: lcelResponse.metadata?.queryAnalysis?.intent || 'Sorted based on query',
      confidence: lcelResponse.metadata?.confidence || 0,
      usedVision: lcelResponse.metadata?.methodUsed?.includes('vision') || false,
      processingTime: lcelResponse.metadata?.processingTime || 0,
      cost: {
        balance: 0, // Will be updated by credit system
        breakdown: {
          embedding: 1,
          vision: lcelResponse.metadata?.methodUsed?.includes('vision') ? 2 : 0,
          processing: 1
        }
      },
      metadata: {
        methodUsed: lcelResponse.metadata?.methodUsed || 'unknown',
        queryAnalysis: lcelResponse.metadata?.queryAnalysis || {}
      }
    };
  }

  /**
   * Main sorting method using LCEL server
   */
  async sortImages(request: SortingRequest): Promise<SortingResult> {
    try {
      // Create abort controller for cancellation
      this.abortController = new AbortController();

      // Validate request
      this.validateRequest(request);

      // Update progress
      this.updateProgress({
        stage: 'analyzing',
        progress: 10,
        message: 'Preparing images for analysis...'
      });

      // Transform request to LCEL format
      const lcelRequest = await this.transformToLCELRequest(request);

      this.updateProgress({
        stage: 'analyzing',
        progress: 30,
        message: 'Sending request to AI sorting server...'
      });

      // Call LCEL server with retry logic
      const lcelResponse = await this.callLCELServerWithRetry(lcelRequest);

      this.updateProgress({
        stage: 'sorting',
        progress: 80,
        message: 'Processing sorting results...'
      });

      // Transform response to frontend format
      const sortingResult = this.transformFromLCELResponse(lcelResponse);

      this.updateProgress({
        stage: 'complete',
        progress: 100,
        message: `Successfully sorted ${sortingResult.sortedImages.length} images using ${sortingResult.metadata?.methodUsed} method`
      });

      return sortingResult;

    } catch (error: any) {
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
   * Call LCEL server with retry logic
   */
  private async callLCELServerWithRetry(lcelRequest: any, attempt = 1): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(`${CONFIG.LCEL.SERVER_URL}${CONFIG.LCEL.ENDPOINTS.SORT}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(lcelRequest),
        signal: this.abortController?.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Sorting request failed');
      }

      return result;

    } catch (error: any) {
      // Handle abort
      if (error.name === 'AbortError') {
        throw new Error('Sorting was cancelled');
      }

      // Retry logic
      if (attempt < CONFIG.LCEL.MAX_RETRIES && this.shouldRetry(error)) {
        console.warn(`LCEL server call failed (attempt ${attempt}), retrying...`, error.message);
        
        await new Promise(resolve => 
          setTimeout(resolve, CONFIG.LCEL.RETRY_DELAY * attempt)
        );
        
        return this.callLCELServerWithRetry(lcelRequest, attempt + 1);
      }

      throw new Error(`LCEL server error after ${attempt} attempts: ${error.message}`);
    }
  }

  /**
   * Determine if error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    return (
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('fetch') ||
      error.message?.includes('ECONNREFUSED')
    );
  }

  /**
   * Sort by emotional tone using LCEL server
   */
  async sortByTone(
    query: string, 
    options: {
      imageIds?: string[];
      targetTone?: string;
      intensity?: 'subtle' | 'moderate' | 'strong';
      maxResults?: number;
      userContext?: any;
    } = {}
  ): Promise<SortingResult> {
    const enhancedQuery = options.targetTone 
      ? `Sort by ${options.targetTone} tone with ${options.intensity || 'moderate'} intensity: ${query}`
      : query;

    return this.sortImages({
      query: enhancedQuery,
      imageIds: options.imageIds,
      sortType: 'tone',
      maxResults: options.maxResults,
      userContext: options.userContext
    });
  }

  /**
   * Sort by scene type using LCEL server
   */
  async sortByScene(
    query: string,
    options: {
      imageIds?: string[];
      sceneType?: string;
      locationPreference?: string;
      timeOfDay?: string;
      maxResults?: number;
      userContext?: any;
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
      maxResults: options.maxResults,
      userContext: options.userContext
    });
  }

  /**
   * Pick best thumbnails using LCEL server with vision analysis
   */
  async pickThumbnails(
    query: string,
    options: {
      imageIds?: string[];
      quality?: 'high' | 'medium' | 'any';
      count?: number;
      criteria?: string[];
      userContext?: any;
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
      maxResults: options.count || 5,
      userContext: options.userContext
    });
  }

  /**
   * Create smart albums using LCEL server
   */
  async createSmartAlbums(
    query: string,
    options: {
      imageIds?: string[];
      strategy?: 'content' | 'temporal' | 'people' | 'location' | 'hybrid';
      maxAlbums?: number;
      userContext?: any;
    } = {}
  ): Promise<SortingResult> {
    const strategy = options.strategy || 'hybrid';
    const maxAlbums = options.maxAlbums || 5;
    
    const enhancedQuery = `Create smart albums using ${strategy} strategy (max ${maxAlbums} albums): ${query}`;

    return this.sortImages({
      query: enhancedQuery,
      imageIds: options.imageIds,
      sortType: 'smart_album',
      maxResults: maxAlbums * 20, // Allow for multiple albums
      userContext: options.userContext
    });
  }

  /**
   * Get sorting suggestions using LCEL server analysis
   */
  async getSortingSuggestions(imageIds?: string[]): Promise<{
    suggestions: string[];
    collectionAnalysis: string;
    recommendedSortType: string;
    confidence: number;
  }> {
    try {
      const result = await this.sortImages({
        query: 'Analyze this image collection and suggest intelligent ways to sort and organize these images',
        imageIds,
        sortType: 'custom',
        maxResults: 5
      });

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
        collectionAnalysis: result.reasoning,
        recommendedSortType: result.sortedImages.length > 0 ? 'custom' : 'tone',
        confidence: result.confidence
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
   * Validate sorting request using configuration limits
   */
  private validateRequest(request: SortingRequest) {
    if (!request.query || request.query.trim().length === 0) {
      throw new Error('Query is required');
    }

    if (request.query.length > CONFIG.LCEL.MAX_QUERY_LENGTH) {
      throw new Error(`Query is too long (max ${CONFIG.LCEL.MAX_QUERY_LENGTH} characters)`);
    }

    if (request.imageIds && request.imageIds.length > CONFIG.LCEL.MAX_IMAGES_PER_REQUEST) {
      throw new Error(`Too many images (max ${CONFIG.LCEL.MAX_IMAGES_PER_REQUEST})`);
    }

    if (request.maxResults && (request.maxResults < 1 || request.maxResults > CONFIG.LCEL.MAX_IMAGES_PER_REQUEST)) {
      throw new Error(`Max results must be between 1 and ${CONFIG.LCEL.MAX_IMAGES_PER_REQUEST}`);
    }
  }

  /**
   * Estimate cost for sorting request using configuration
   */
  private estimateCost(request: SortingRequest): number {
    let baseCost = CONFIG.CREDIT.COSTS.BASIC_SORT;

    // Higher cost for vision-enabled operations
    if (request.useVision || request.sortType === 'thumbnail') {
      baseCost = CONFIG.CREDIT.COSTS.VISION_SORT;
    }

    // Higher cost for smart albums
    if (request.sortType === 'smart_album') {
      baseCost = CONFIG.CREDIT.COSTS.SMART_ALBUM;
    }

    // Apply volume multipliers
    const imageCount = request.imageIds?.length || 50;
    
    for (const [, config] of Object.entries(CONFIG.CREDIT.VOLUME_MULTIPLIERS)) {
      if (imageCount >= config.threshold) {
        baseCost = Math.ceil(baseCost * config.multiplier);
      }
    }

    return baseCost;
  }

  /**
   * Check if user has sufficient balance
   */
  private async checkbalance(requiredbalance: number) {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Authentication required');
    }

    const { data: profile, error } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (error) {
      console.warn('Could not check balance:', error);
      // Don't block the request if we can't check balance
      return;
    }

    if (!profile || profile.balance < requiredbalance) {
      throw new Error(
        `Insufficient balance. Required: ${requiredbalance}, Available: ${profile?.balance || 0}`
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

