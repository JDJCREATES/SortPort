/**
 * LCEL API Bridge
 * 
 * Bridges the new LCEL-based components with existing API endpoints.
 * Provides a clean integration layer for migrating to the new system.
 */

import { Request, Response } from 'express';
import { QueryChains } from '../agents/query/query_chains.js';
import { QueryProcessor } from '../agents/query/query_processor.js';
import { TaskAgent } from '../agents/task/task_agent.js';
import { ToolAgent } from '../agents/tool/tool_agent.js';
import { VisionAggregator, VisionResult } from '../tools/vision/vision_aggregator.js';
import { SearchRanker, RankingCriteria } from '../tools/search/search_ranker.js';
import { ContentAggregator, ContentSource } from '../tools/content/content_aggregator.js';

export interface SortRequest {
  query: string;
  images: Array<{
    id: string;
    url: string;
    metadata?: any;
  }>;
  options?: {
    maxResults?: number;
    sortCriteria?: string[];
    includeAnalysis?: boolean;
    userContext?: any;
  };
}

export interface SortResponse {
  success: boolean;
  results?: Array<{
    image: any;
    sortScore: number;
    reasoning: string;
    position: number;
    metadata: any;
  }>;
  metadata?: {
    processingTime: number;
    confidence: number;
    methodUsed: string;
    queryAnalysis: any;
  };
  error?: string;
}

export class LCELApiBridge {
  private queryProcessor: QueryProcessor;
  private queryChains: QueryChains;
  private taskAgent: TaskAgent;
  private toolAgent: ToolAgent;
  private visionAggregator: VisionAggregator;
  private searchRanker: SearchRanker;
  private contentAggregator: ContentAggregator;

  constructor() {
    this.queryProcessor = new QueryProcessor();
    this.queryChains = new QueryChains();
    this.taskAgent = new TaskAgent();
    this.toolAgent = new ToolAgent();
    this.visionAggregator = new VisionAggregator();
    this.searchRanker = new SearchRanker();
    this.contentAggregator = new ContentAggregator();
  }

  /**
   * Main sort endpoint using LCEL pipeline
   */
  async handleSort(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const sortRequest: SortRequest = req.body;
      
      if (!sortRequest.query || !sortRequest.images || sortRequest.images.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Query and images are required'
        });
        return;
      }

      // Step 1: Process the query using LCEL
      const processedQuery = await this.queryProcessor.processQuery({
        query: sortRequest.query,
        context: {
          userId: sortRequest.options?.userContext?.id || 'anonymous',
          images: sortRequest.images,
          preferences: sortRequest.options?.userContext?.preferences
        }
      });

      // Step 2: Determine execution strategy
      const strategy = this.determineExecutionStrategy(processedQuery, sortRequest);

      // Step 3: Execute based on strategy
      let results: any[];
      let metadata: any;

      switch (strategy.method) {
        case 'vision_analysis':
          ({ results, metadata } = await this.executeVisionAnalysisStrategy(sortRequest, processedQuery));
          break;
        case 'metadata_based':
          ({ results, metadata } = await this.executeMetadataBasedStrategy(sortRequest, processedQuery));
          break;
        case 'hybrid':
          ({ results, metadata } = await this.executeHybridStrategy(sortRequest, processedQuery));
          break;
        default:
          ({ results, metadata } = await this.executeSimpleStrategy(sortRequest, processedQuery));
      }

      const response: SortResponse = {
        success: true,
        results,
        metadata: {
          ...metadata,
          processingTime: Date.now() - startTime,
          methodUsed: strategy.method,
          queryAnalysis: {
            intent: processedQuery.intent,
            parameters: processedQuery.parameters,
            confidence: processedQuery.confidence
          }
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Sort request failed:', error);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        metadata: {
          processingTime: Date.now() - startTime
        }
      });
    }
  }

  /**
   * Determine the best execution strategy based on query and data
   */
  private determineExecutionStrategy(processedQuery: any, sortRequest: SortRequest): { method: string; confidence: number } {
    const hasVisionQuery = this.hasVisionRelatedTerms(processedQuery.query.original);
    const hasMetadata = sortRequest.images.some(img => img.metadata);
    const imageCount = sortRequest.images.length;

    // Vision analysis for visual queries and sufficient images
    if (hasVisionQuery && imageCount <= 50) {
      return { method: 'vision_analysis', confidence: 0.8 };
    }

    // Metadata-based for large collections with good metadata
    if (hasMetadata && imageCount > 20) {
      return { method: 'metadata_based', confidence: 0.7 };
    }

    // Hybrid for medium collections
    if (imageCount > 10 && imageCount <= 100) {
      return { method: 'hybrid', confidence: 0.6 };
    }

    // Simple strategy as fallback
    return { method: 'simple', confidence: 0.5 };
  }

  /**
   * Execute vision analysis strategy using LCEL components
   */
  private async executeVisionAnalysisStrategy(sortRequest: SortRequest, processedQuery: any): Promise<{ results: any[]; metadata: any }> {
    // Step 1: Analyze images with vision tools
    const visionPromises = sortRequest.images.map(async (image) => {
      const toolResult = await this.toolAgent.executeSingleAction({
        id: `vision_${image.id}`,
        toolName: 'vision_analyzer',
        parameters: {
          imageUrl: image.url,
          analysisType: 'comprehensive'
        }
      });

      return {
        imageId: image.id,
        analysis: toolResult.output,
        confidence: toolResult.success ? 0.8 : 0.3
      };
    });

    const visionResults = await Promise.all(visionPromises);

    // Step 2: Create vision aggregation results for ranking
    const enrichedImages = await Promise.all(sortRequest.images.map(async (image, index) => {
      const visionData = visionResults[index];
      
      return {
        ...image,
        visionAnalysis: visionData.analysis,
        analysisConfidence: visionData.confidence,
        // Add derived features for ranking
        qualityScore: this.calculateQualityScore(visionData.analysis),
        relevanceFeatures: this.extractRelevanceFeatures(visionData.analysis, processedQuery)
      };
    }));

    // Step 3: Rank using SearchRanker
    const rankingCriteria: Partial<RankingCriteria> = {
      relevance: 0.5,
      quality: 0.3,
      recency: 0.1,
      popularity: 0.05,
      personalization: 0.05
    };

    const rankedResults = await this.searchRanker.rankResults(enrichedImages, rankingCriteria);

    // Step 4: Format results
    const results = rankedResults.map((ranked, index) => ({
      image: ranked.item,
      sortScore: ranked.finalScore,
      reasoning: this.generateReasoning(ranked, processedQuery),
      position: index + 1,
      metadata: {
        visionAnalysis: ranked.item.visionAnalysis,
        qualityScore: ranked.item.qualityScore,
        relevanceScore: ranked.scores.relevance,
        confidence: ranked.item.analysisConfidence
      }
    }));

    return {
      results,
      metadata: {
        strategy: 'vision_analysis',
        imagesAnalyzed: sortRequest.images.length,
        avgConfidence: visionResults.reduce((sum, r) => sum + r.confidence, 0) / visionResults.length,
        rankingCriteria
      }
    };
  }

  /**
   * Execute metadata-based strategy
   */
  private async executeMetadataBasedStrategy(sortRequest: SortRequest, processedQuery: any): Promise<{ results: any[]; metadata: any }> {
    // Step 1: Aggregate metadata from all sources
    const contentSources: ContentSource[] = sortRequest.images
      .filter(img => img.metadata)
      .map(img => ({
        tool: 'metadata_extractor',
        data: img.metadata,
        confidence: 0.9,
        timestamp: new Date()
      }));

    if (contentSources.length === 0) {
      // Fallback to simple strategy
      return this.executeSimpleStrategy(sortRequest, processedQuery);
    }

    // Step 2: Use content aggregator to understand patterns
    const aggregated = await this.contentAggregator.aggregateContent(contentSources);

    // Step 3: Rank based on metadata relevance
    const rankedResults = await this.searchRanker.rankResults(sortRequest.images, {
      relevance: 0.6,
      quality: 0.2,
      recency: 0.15,
      popularity: 0.05
    });

    const results = rankedResults.map((ranked, index) => ({
      image: ranked.item,
      sortScore: ranked.finalScore,
      reasoning: `Ranked by metadata relevance: ${ranked.scores.relevance.toFixed(3)}`,
      position: index + 1,
      metadata: {
        metadataQuality: this.assessMetadataQuality(ranked.item.metadata),
        relevanceScore: ranked.scores.relevance,
        aggregatedInsights: aggregated.mergedData
      }
    }));

    return {
      results,
      metadata: {
        strategy: 'metadata_based',
        metadataSourcesUsed: contentSources.length,
        aggregationConfidence: aggregated.confidence,
        conflictsResolved: aggregated.conflicts.length
      }
    };
  }

  /**
   * Execute hybrid strategy combining vision and metadata
   */
  private async executeHybridStrategy(sortRequest: SortRequest, processedQuery: any): Promise<{ results: any[]; metadata: any }> {
    // Sample subset for vision analysis to save resources
    const visionSampleSize = Math.min(20, Math.ceil(sortRequest.images.length * 0.3));
    const visionSample = sortRequest.images.slice(0, visionSampleSize);

    // Execute vision analysis on sample
    const { results: visionResults, metadata: visionMeta } = await this.executeVisionAnalysisStrategy(
      { ...sortRequest, images: visionSample },
      processedQuery
    );

    // Execute metadata analysis on full set
    const { results: metadataResults, metadata: metadataMeta } = await this.executeMetadataBasedStrategy(
      sortRequest,
      processedQuery
    );

    // Combine and rank results
    const combinedResults = await this.combineHybridResults(visionResults, metadataResults, sortRequest.images);

    return {
      results: combinedResults,
      metadata: {
        strategy: 'hybrid',
        visionSampleSize,
        visionMetadata: visionMeta,
        metadataMetadata: metadataMeta
      }
    };
  }

  /**
   * Execute simple fallback strategy
   */
  private async executeSimpleStrategy(sortRequest: SortRequest, processedQuery: any): Promise<{ results: any[]; metadata: any }> {
    // Simple ranking based on basic features
    const results = sortRequest.images.map((image, index) => ({
      image,
      sortScore: 1 - (index / sortRequest.images.length), // Simple position-based score
      reasoning: 'Simple ordering based on input position',
      position: index + 1,
      metadata: {
        strategy: 'simple',
        originalPosition: index
      }
    }));

    return {
      results,
      metadata: {
        strategy: 'simple',
        note: 'Used fallback strategy due to limited data or query complexity'
      }
    };
  }

  // Helper methods
  private hasVisionRelatedTerms(query: string): boolean {
    const visionTerms = ['color', 'bright', 'dark', 'beautiful', 'quality', 'sharp', 'blurry', 'composition', 'lighting', 'scene', 'object', 'person', 'animal', 'landscape', 'portrait'];
    const lowerQuery = query.toLowerCase();
    return visionTerms.some(term => lowerQuery.includes(term));
  }

  private calculateQualityScore(analysis: any): number {
    if (!analysis) return 0.5;
    
    let score = 0.5;
    
    // Add points for detected features
    if (analysis.technical_quality) score += 0.2;
    if (analysis.aesthetic_quality) score += 0.2;
    if (analysis.composition) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private extractRelevanceFeatures(analysis: any, processedQuery: any): any {
    return {
      objects: analysis.objects || [],
      scenes: analysis.scenes || [],
      colors: analysis.colors || [],
      queryMatch: this.calculateQueryMatch(analysis, processedQuery.query.original)
    };
  }

  private calculateQueryMatch(analysis: any, query: string): number {
    if (!analysis) return 0;
    
    const queryTerms = query.toLowerCase().split(/\s+/);
    const analysisText = JSON.stringify(analysis).toLowerCase();
    
    const matches = queryTerms.filter(term => analysisText.includes(term));
    return matches.length / queryTerms.length;
  }

  private generateReasoning(ranked: any, processedQuery: any): string {
    const scores = ranked.scores;
    const topScoreType = Object.entries(scores)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0][0];
    
    return `Ranked primarily by ${topScoreType} (${(scores as any)[topScoreType].toFixed(3)}) matching query "${processedQuery.query.original}"`;
  }

  private assessMetadataQuality(metadata: any): number {
    if (!metadata) return 0;
    
    const fields = Object.keys(metadata);
    const importantFields = ['title', 'description', 'tags', 'category', 'date'];
    const presentFields = importantFields.filter(field => fields.includes(field));
    
    return presentFields.length / importantFields.length;
  }

  private async combineHybridResults(visionResults: any[], metadataResults: any[], allImages: any[]): Promise<any[]> {
    // Create a map of vision scores for images that were analyzed
    const visionScoreMap = new Map();
    visionResults.forEach(result => {
      visionScoreMap.set(result.image.id, result.sortScore);
    });

    // Create a map of metadata scores
    const metadataScoreMap = new Map();
    metadataResults.forEach(result => {
      metadataScoreMap.set(result.image.id, result.sortScore);
    });

    // Combine scores for all images
    const combinedResults = allImages.map((image, index) => {
      const visionScore = visionScoreMap.get(image.id) || 0.5;
      const metadataScore = metadataScoreMap.get(image.id) || 0.5;
      
      // Weight vision and metadata scores
      const combinedScore = (visionScore * 0.6) + (metadataScore * 0.4);
      
      return {
        image,
        sortScore: combinedScore,
        reasoning: `Hybrid score: Vision(${visionScore.toFixed(3)}) + Metadata(${metadataScore.toFixed(3)})`,
        position: index + 1,
        metadata: {
          visionScore,
          metadataScore,
          combinedScore,
          strategy: 'hybrid'
        }
      };
    });

    // Sort by combined score
    combinedResults.sort((a, b) => b.sortScore - a.sortScore);
    
    // Update positions
    combinedResults.forEach((result, index) => {
      result.position = index + 1;
    });

    return combinedResults;
  }
}
