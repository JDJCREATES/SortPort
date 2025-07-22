/**
 * LangChain Router and Dispatcher
 * 
 * This is the main entry point for all LangChain-powered image sorting operations.
 * It analyzes incoming requests and routes them to the appropriate specialized chains.
 * 
 * Input: SortRequest with query, user context, and sorting preferences
 * Output: ChainOutput with sorted images, reasoning, and metadata
 * 
 * Key Features:
 * - Intelligent query analysis to determine best sorting approach
 * - Cost-aware routing (prefers embedding-based over vision when possible)
 * - Chain composition using LCEL for complex multi-step operations
 * - Comprehensive error handling and fallback mechanisms
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { SortRequest, SortResponse, RequestContext } from '../../types/api.js';
import { ChainInput, ChainOutput, SortingContext, SortType } from '../../types/sorting.js';
import { VirtualImageQueries } from '../supabase/queries.js';

// Import specialized chains
import { SortByToneChain } from './chains/sortByTone.js';
import { GroupBySceneChain } from './chains/groupByScene.js';
import { PickThumbnailsChain } from './chains/pickThumbnails.js';
import { CustomQueryChain } from './chains/customQuery.js';
import { SmartAlbumsChain } from './chains/smartAlbums.js';

// Import utilities
import { EmbeddingService } from './utils/embeddings.js';
import { CacheService } from './utils/cache.js';

const llm = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0.1,
  maxTokens: 1000
});

// Query analysis prompt to determine sorting strategy
const QUERY_ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
You are an expert at analyzing natural language requests for image sorting.
Your job is to determine the best sorting approach and extract key parameters.

User Query: "{query}"

Analyze this query and respond with JSON in this exact format:
{{
  "sortType": "tone|scene|thumbnail|custom|smart_album",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this approach was chosen",
  "parameters": {{
    "targetTone": "extracted emotional tone if applicable",
    "sceneType": "extracted scene/location if applicable", 
    "thumbnailCriteria": "quality requirements if thumbnail selection",
    "customCriteria": "any specific requirements not covered above"
  }},
  "useVision": true/false,
  "estimatedComplexity": "low|medium|high"
}}

Guidelines:
- Use "tone" for emotional/mood-based sorting (happy, sad, energetic, calm)
- Use "scene" for location/setting-based sorting (indoor, outdoor, beach, city)
- Use "thumbnail" for selecting best representative images
- Use "smart_album" for creating themed collections
- Use "custom" for complex or multi-criteria requests
- Set useVision=true only when existing metadata is insufficient
- Consider user's cost preferences and available credits
`);

export class SortingDispatcher {
  private toneChain: SortByToneChain;
  private sceneChain: GroupBySceneChain;
  private thumbnailChain: PickThumbnailsChain;
  private customChain: CustomQueryChain;
  private albumChain: SmartAlbumsChain;
  private embeddingService: EmbeddingService;
  private cacheService: CacheService;

  constructor() {
    this.toneChain = new SortByToneChain();
    this.sceneChain = new GroupBySceneChain();
    this.thumbnailChain = new PickThumbnailsChain();
    this.customChain = new CustomQueryChain();
    this.albumChain = new SmartAlbumsChain();
    this.embeddingService = new EmbeddingService();
    this.cacheService = new CacheService();
  }

  /**
   * Main dispatch method - routes requests to appropriate chains
   */
  async dispatch(request: SortRequest, context: RequestContext): Promise<SortResponse> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        return this.formatCachedResponse(cachedResult, context);
      }

      // Load user's images
      const userImages = await this.loadUserImages(request);
      
      // Analyze query to determine routing strategy
      const analysis = await this.analyzeQuery(request.query);
      
      // Build sorting context
      const sortingContext = this.buildSortingContext(request, userImages, analysis);
      
      // Route to appropriate chain
      const chainOutput = await this.routeToChain(analysis.sortType, {
        query: request.query,
        images: userImages,
        context: sortingContext,
        userId: request.userId
      });

      // Cache result if successful
      if (chainOutput.confidence > 0.7) {
        await this.cacheService.set(cacheKey, chainOutput, 3600); // 1 hour TTL
      }

      // Format final response
      const response = this.formatResponse(chainOutput, analysis, startTime, context);
      
      return response;

    } catch (error) {
      console.error('Sorting dispatch error:', error);
      throw new Error(`Sorting failed: ${error.message}`);
    }
  }

  /**
   * Analyze query using LLM to determine optimal sorting strategy
   */
  private async analyzeQuery(query: string) {
    const analysisChain = RunnableSequence.from([
      QUERY_ANALYSIS_PROMPT,
      llm,
      new RunnableLambda({
        func: (output) => {
          try {
            return JSON.parse(output.content);
          } catch {
            // Fallback to custom chain if parsing fails
            return {
              sortType: 'custom',
              confidence: 0.5,
              reasoning: 'Could not parse query, using flexible custom approach',
              parameters: { customCriteria: query },
              useVision: false,
              estimatedComplexity: 'medium'
            };
          }
        }
      })
    ]);

    return await analysisChain.invoke({ query });
  }

  /**
   * Route to the appropriate specialized chain based on analysis
   */
  private async routeToChain(sortType: SortType, input: ChainInput): Promise<ChainOutput> {
    switch (sortType) {
      case 'tone':
        return await this.toneChain.invoke(input);
      
      case 'scene':
        return await this.sceneChain.invoke(input);
      
      case 'thumbnail':
        return await this.thumbnailChain.invoke(input);
      
      case 'smart_album':
        return await this.albumChain.invoke(input);
      
      case 'custom':
      default:
        return await this.customChain.invoke(input);
    }
  }

  /**
   * Load user's images based on request parameters
   */
  private async loadUserImages(request: SortRequest) {
    if (request.imageIds && request.imageIds.length > 0) {
      // Load specific images
      return await VirtualImageQueries.getByIds(request.imageIds, request.userId);
    } else if (request.albumId) {
      // Load album images
      return await VirtualImageQueries.getByUserId(request.userId, {
        albumId: request.albumId,
        limit: request.maxResults,
        includeEmbeddings: true
      });
    } else {
      // Load recent images
      return await VirtualImageQueries.getByUserId(request.userId, {
        limit: request.maxResults,
        includeEmbeddings: true,
        sortBy: 'created_at',
        sortOrder: 'desc'
      });
    }
  }

  /**
   * Build sorting context with user preferences and constraints
   */
  private buildSortingContext(request: SortRequest, userImages: any[], analysis: any): SortingContext {
    return {
      query: request.query,
      userImages,
      sortType: analysis.sortType,
      preferences: {
        preferredSort: request.sortType || analysis.sortType,
        useVisionSparingly: !request.useVision,
        maxVisionCalls: request.useVision ? 5 : 1,
        favoriteStyles: [], // TODO: Get from user profile
        excludeNsfw: true
      },
      constraints: {
        maxResults: request.maxResults,
        maxProcessingTime: 30000, // 30 seconds
        maxCredits: 10, // TODO: Get from user context
        requireConfidence: 0.6
      }
    };
  }

  /**
   * Format chain output into API response
   */
  private formatResponse(
    chainOutput: ChainOutput,
    analysis: any,
    startTime: number,
    context: RequestContext
  ): SortResponse {
    const processingTime = Date.now() - startTime;
    
    return {
      sortedImages: chainOutput.sortedImages.map(result => ({
        id: result.image.id,
        originalPath: result.image.originalPath,
        virtualName: result.image.virtualName,
        sortScore: result.sortScore,
        reasoning: result.reasoning,
        position: result.position,
        metadata: result.metadata
      })),
      reasoning: `${analysis.reasoning}. ${chainOutput.reasoning}`,
      confidence: chainOutput.confidence,
      usedVision: chainOutput.metadata.usedVision,
      processingTime,
      cost: {
        credits: chainOutput.metadata.costBreakdown.total,
        breakdown: {
          embedding: chainOutput.metadata.costBreakdown.embedding,
          vision: chainOutput.metadata.costBreakdown.vision,
          processing: chainOutput.metadata.costBreakdown.processing
        }
      }
    };
  }

  /**
   * Format cached response
   */
  private formatCachedResponse(cachedOutput: ChainOutput, context: RequestContext): SortResponse {
    return {
      sortedImages: cachedOutput.sortedImages.map(result => ({
        id: result.image.id,
        originalPath: result.image.originalPath,
        virtualName: result.image.virtualName,
        sortScore: result.sortScore,
        reasoning: result.reasoning + ' (cached)',
        position: result.position,
        metadata: result.metadata
      })),
      reasoning: cachedOutput.reasoning + ' (from cache)',
      confidence: cachedOutput.confidence,
      usedVision: false, // Cached results don't use vision
      processingTime: 50, // Minimal cache retrieval time
      cost: {
        credits: 0, // No cost for cached results
        breakdown: {
          embedding: 0,
          vision: 0,
          processing: 0
        }
      }
    };
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: SortRequest): string {
    const keyData = {
      query: request.query.toLowerCase(),
      userId: request.userId,
      sortType: request.sortType,
      maxResults: request.maxResults,
      imageIds: request.imageIds?.sort()
    };
    
    return `sort:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  /**
   * Health check for all chains
   */
  async healthCheck(): Promise<{ [chainType: string]: boolean }> {
    const checks = await Promise.allSettled([
      this.toneChain.healthCheck(),
      this.sceneChain.healthCheck(),
      this.thumbnailChain.healthCheck(),
      this.customChain.healthCheck(),
      this.albumChain.healthCheck(),
      this.embeddingService.healthCheck()
    ]);

    return {
      tone: checks[0].status === 'fulfilled',
      scene: checks[1].status === 'fulfilled',
      thumbnail: checks[2].status === 'fulfilled',
      custom: checks[3].status === 'fulfilled',
      album: checks[4].status === 'fulfilled',
      embedding: checks[5].status === 'fulfilled'
    };
  }
}

// Export singleton instance
export const sortingDispatcher = new SortingDispatcher();
