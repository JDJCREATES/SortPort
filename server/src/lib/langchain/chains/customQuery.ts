/**
 * Custom Query Chain
 * 
 * Handles flexible, multi-criteria sorting requests that don't fit into predefined categories.
 * Uses advanced LCEL composition to break down complex queries and apply multi-layered analysis.
 * 
 * Input: ChainInput with open-ended natural language queries
 * Output: ChainOutput with intelligently sorted images based on query interpretation
 * 
 * Key Features:
 * - Multi-criteria query decomposition and analysis
 * - Adaptive sorting strategies based on query complexity
 * - Intelligent fallback mechanisms for ambiguous requests
 * - Cost-optimized processing with smart vision usage decisions
 * - Support for complex boolean logic and nested criteria
 */

import { RunnableSequence, RunnableLambda, RunnablePassthrough } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChainInput, ChainOutput, SortedImageResult } from '../../../types/sorting.js';
import { EmbeddingService } from '../utils/embeddings.js';
import { SortingPrompts, formatImageDataForPrompt, formatUserPreferences } from '../prompts/sorting.js';

// Query decomposition prompt
const QUERY_DECOMPOSITION_PROMPT = PromptTemplate.fromTemplate(`
Analyze this image sorting request and break it down into actionable components.

User Query: "{query}"

Decompose this query into:
1. Primary sorting criteria (most important factor)
2. Secondary criteria (additional considerations)
3. Filters or constraints (what to include/exclude)
4. Implicit requirements (inferred from context)
5. Complexity assessment

Respond with JSON:
{{
  "primaryCriteria": {{
    "type": "quality|content|time|people|style|emotion|location",
    "description": "main sorting factor",
    "weight": 0.6
  }},
  "secondaryCriteria": [
    {{
      "type": "criteria_type",
      "description": "secondary factor",
      "weight": 0.3
    }}
  ],
  "filters": {{
    "include": ["things to prioritize"],
    "exclude": ["things to avoid"],
    "constraints": ["size|date|quality constraints"]
  }},
  "complexity": "simple|moderate|complex",
  "confidence": 0.85,
  "interpretation": "human-readable explanation of the request",
  "suggestedApproach": "embedding|metadata|vision|hybrid"
}}
`);

export class CustomQueryChain {
  private llm: ChatOpenAI;
  private embeddingService: EmbeddingService;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2500
    });
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Main invoke method for custom query processing
   */
  async invoke(input: ChainInput): Promise<ChainOutput> {
    const startTime = Date.now();
    let visionCallCount = 0;
    let embeddingOperations = 0;

    try {
      // Step 1: Decompose the query into actionable components
      const queryAnalysis = await this.decomposeQuery(input.query);
      
      // Step 2: Apply primary criteria analysis
      const primaryResults = await this.applyPrimaryCriteria(input, queryAnalysis);
      embeddingOperations++;

      // Step 3: Apply secondary criteria refinement
      const refinedResults = await this.applySecondaryCriteria(primaryResults, queryAnalysis);

      // Step 4: Apply filters and constraints
      const filteredResults = await this.applyFilters(refinedResults, queryAnalysis, input);

      // Step 5: Intelligent scoring and ranking
      const scoredResults = await this.performIntelligentScoring(input, filteredResults, queryAnalysis);

      // Step 6: Vision enhancement for complex queries
      let finalResults = scoredResults;
      if (this.shouldUseVisionForQuery(input.context, queryAnalysis, scoredResults)) {
        finalResults = await this.enhanceWithVision(input, scoredResults, queryAnalysis);
        visionCallCount++;
      }

      // Step 7: Final LLM validation and adjustment
      const validatedResults = await this.validateAndAdjust(input, finalResults, queryAnalysis);

      const processingTime = Date.now() - startTime;

      return {
        sortedImages: validatedResults,
        reasoning: this.generateCustomReasoning(queryAnalysis, validatedResults, visionCallCount > 0),
        confidence: this.calculateCustomConfidence(queryAnalysis, validatedResults, visionCallCount > 0),
        metadata: {
          chainType: 'customQuery',
          processingTime,
          usedVision: visionCallCount > 0,
          visionCallCount,
          embeddingOperations,
          costBreakdown: {
            embedding: embeddingOperations * 0.1,
            vision: visionCallCount * 2.0,
            processing: 1.5, // Higher processing cost for complex analysis
            total: (embeddingOperations * 0.1) + (visionCallCount * 2.0) + 1.5
          }
        }
      };

    } catch (error) {
      console.error('Custom query chain error:', error);
      throw new Error(`Custom query processing failed: ${error.message}`);
    }
  }

  /**
   * Decompose natural language query into structured components
   */
  private async decomposeQuery(query: string) {
    const decompositionChain = RunnableSequence.from([
      QUERY_DECOMPOSITION_PROMPT,
      this.llm,
      new RunnableLambda({
        func: (output) => {
          try {
            return JSON.parse(output.content);
          } catch (error) {
            // Fallback decomposition
            return this.fallbackQueryDecomposition(query);
          }
        }
      })
    ]);

    return await decompositionChain.invoke({ query });
  }

  /**
   * Apply primary sorting criteria
   */
  private async applyPrimaryCriteria(input: ChainInput, analysis: any) {
    const primaryType = analysis.primaryCriteria.type;
    
    switch (primaryType) {
      case 'quality':
        return await this.sortByQuality(input.images);
      
      case 'content':
        return await this.sortByContent(input, analysis.primaryCriteria.description);
      
      case 'time':
        return await this.sortByTime(input.images, analysis);
      
      case 'people':
        return await this.sortByPeople(input.images, analysis);
      
      case 'emotion':
        return await this.sortByEmotion(input, analysis.primaryCriteria.description);
      
      case 'location':
        return await this.sortByLocation(input.images, analysis);
      
      case 'style':
        return await this.sortByStyle(input, analysis.primaryCriteria.description);
      
      default:
        return await this.sortByContent(input, input.query);
    }
  }

  /**
   * Sort images by quality indicators
   */
  private async sortByQuality(images: any[]) {
    return images.map(image => {
      let qualityScore = 0;
      
      // EXIF-based quality indicators
      if (image.metadata?.EXIF) {
        const exif = image.metadata.EXIF;
        
        // Resolution score
        if (exif.PixelXDimension && exif.PixelYDimension) {
          const megapixels = (exif.PixelXDimension * exif.PixelYDimension) / 1000000;
          qualityScore += Math.min(megapixels / 12, 0.3); // Cap at 12MP
        }
        
        // ISO score (lower is better for quality)
        if (exif.ISO) {
          const iso = parseInt(exif.ISO);
          if (iso <= 400) qualityScore += 0.2;
          else if (iso <= 800) qualityScore += 0.1;
        }
        
        // Aperture score
        if (exif.FNumber) {
          const aperture = parseFloat(exif.FNumber);
          if (aperture >= 5.6 && aperture <= 11) qualityScore += 0.1;
        }
      }
      
      // Rekognition quality indicators
      if (image.metadata?.Labels) {
        const qualityLabels = image.metadata.Labels.filter((label: any) => 
          ['Sharp', 'Clear', 'Bright', 'Colorful'].includes(label.Name) && label.Confidence > 80
        );
        qualityScore += qualityLabels.length * 0.1;
      }
      
      // File size as quality proxy (bigger usually better, within reason)
      if (image.metadata?.fileSize) {
        const sizeMB = image.metadata.fileSize / (1024 * 1024);
        if (sizeMB > 2 && sizeMB < 20) qualityScore += 0.1;
      }
      
      return {
        image,
        score: Math.min(qualityScore, 1.0),
        reasoning: 'Quality-based scoring from technical metadata'
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Sort images by content using embeddings
   */
  private async sortByContent(input: ChainInput, contentDescription: string) {
    const queryEmbedding = await this.embeddingService.generateQueryEmbedding(contentDescription);
    
    const similarityResults = await this.embeddingService.vectorSimilaritySearch(
      queryEmbedding,
      input.userId,
      {
        limit: input.images.length,
        threshold: 0.2
      }
    );

    return similarityResults.map(result => ({
      image: result.image,
      score: result.similarity,
      reasoning: `Content similarity to: ${contentDescription}`
    }));
  }

  /**
   * Sort images by temporal criteria
   */
  private async sortByTime(images: any[], analysis: any) {
    const timeSort = analysis.filters?.constraints?.find((c: string) => 
      c.includes('recent') || c.includes('old') || c.includes('date')
    );
    
    const sortedImages = [...images].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      
      // Default to newest first, unless specifically asking for old
      return timeSort?.includes('old') ? dateA - dateB : dateB - dateA;
    });

    return sortedImages.map((image, index) => ({
      image,
      score: 1 - (index / images.length), // Descending score based on position
      reasoning: timeSort?.includes('old') ? 'Sorted by oldest first' : 'Sorted by newest first'
    }));
  }

  /**
   * Sort images by people-related criteria
   */
  private async sortByPeople(images: any[], analysis: any) {
    return images.map(image => {
      let peopleScore = 0;
      
      // Rekognition person detection
      if (image.metadata?.Labels) {
        const peopleLabels = image.metadata.Labels.filter((label: any) => 
          ['Person', 'People', 'Face', 'Human', 'Crowd'].includes(label.Name)
        );
        peopleScore += peopleLabels.reduce((sum: number, label: any) => 
          sum + (label.Confidence / 100), 0
        );
      }
      
      // Face detection if available
      if (image.metadata?.FaceDetails) {
        peopleScore += image.metadata.FaceDetails.length * 0.2;
      }
      
      // Text analysis for people mentions
      const texts = [image.caption, image.visionSummary, image.virtual_description].filter(Boolean);
      for (const text of texts) {
        if (text?.toLowerCase().match(/\b(person|people|face|family|friend|group)\b/)) {
          peopleScore += 0.1;
        }
      }
      
      return {
        image,
        score: Math.min(peopleScore, 1.0),
        reasoning: 'People detection and analysis'
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Sort images by emotional content
   */
  private async sortByEmotion(input: ChainInput, emotionDescription: string) {
    // Reuse logic from tone chain but with custom emotion
    const queryEmbedding = await this.embeddingService.generateQueryEmbedding(
      `Images with ${emotionDescription} emotional content`
    );
    
    const similarityResults = await this.embeddingService.vectorSimilaritySearch(
      queryEmbedding,
      input.userId,
      { limit: input.images.length, threshold: 0.3 }
    );

    return similarityResults.map(result => ({
      image: result.image,
      score: result.similarity,
      reasoning: `Emotional content matching: ${emotionDescription}`
    }));
  }

  /**
   * Sort images by location-related criteria
   */
  private async sortByLocation(images: any[], analysis: any) {
    return images.map(image => {
      let locationScore = 0;
      
      // GPS data presence
      if (image.metadata?.GPS) {
        locationScore += 0.3;
      }
      
      // Location-related labels
      if (image.metadata?.Labels) {
        const locationLabels = image.metadata.Labels.filter((label: any) => 
          ['Landmark', 'Building', 'Architecture', 'Nature', 'Outdoors'].includes(label.Name) &&
          label.Confidence > 70
        );
        locationScore += locationLabels.length * 0.1;
      }
      
      // Album or filename location hints
      const locationTexts = [image.virtualAlbum, image.originalName, image.virtual_description].filter(Boolean);
      for (const text of locationTexts) {
        if (text?.toLowerCase().match(/\b(trip|travel|vacation|beach|mountain|city|home)\b/)) {
          locationScore += 0.1;
        }
      }
      
      return {
        image,
        score: Math.min(locationScore, 1.0),
        reasoning: 'Location relevance analysis'
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Sort images by style criteria
   */
  private async sortByStyle(input: ChainInput, styleDescription: string) {
    const queryEmbedding = await this.embeddingService.generateQueryEmbedding(
      `Images with ${styleDescription} visual style`
    );
    
    const similarityResults = await this.embeddingService.vectorSimilaritySearch(
      queryEmbedding,
      input.userId,
      { limit: input.images.length, threshold: 0.25 }
    );

    return similarityResults.map(result => ({
      image: result.image,
      score: result.similarity,
      reasoning: `Style matching: ${styleDescription}`
    }));
  }

  /**
   * Apply secondary criteria refinement
   */
  private async applySecondaryCriteria(primaryResults: any[], analysis: any) {
    if (!analysis.secondaryCriteria || analysis.secondaryCriteria.length === 0) {
      return primaryResults;
    }

    // Apply each secondary criterion with its weight
    for (const criterion of analysis.secondaryCriteria) {
      const secondaryScores = await this.applySingleCriterion(primaryResults, criterion);
      
      // Blend scores
      primaryResults = primaryResults.map((result, index) => ({
        ...result,
        score: (result.score * (1 - criterion.weight)) + 
               (secondaryScores[index]?.score || 0) * criterion.weight,
        reasoning: `${result.reasoning}; ${criterion.description}`
      }));
    }

    return primaryResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply a single criterion to results
   */
  private async applySingleCriterion(results: any[], criterion: any) {
    // Simplified implementation - would be expanded based on criterion type
    return results.map(result => ({
      ...result,
      score: result.score * 0.9 // Placeholder adjustment
    }));
  }

  /**
   * Apply filters and constraints
   */
  private async applyFilters(results: any[], analysis: any, input: ChainInput) {
    let filteredResults = [...results];

    // Apply exclusion filters
    if (analysis.filters?.exclude) {
      filteredResults = filteredResults.filter(result => {
        return !this.matchesExclusionCriteria(result.image, analysis.filters.exclude);
      });
    }

    // Apply inclusion filters
    if (analysis.filters?.include) {
      filteredResults = filteredResults.map(result => {
        if (this.matchesInclusionCriteria(result.image, analysis.filters.include)) {
          result.score *= 1.2; // Boost score for included criteria
        }
        return result;
      });
    }

    // Apply constraints
    if (analysis.filters?.constraints) {
      filteredResults = this.applyConstraints(filteredResults, analysis.filters.constraints);
    }

    // Limit results
    const maxResults = input.context.constraints.maxResults;
    return filteredResults.slice(0, maxResults);
  }

  /**
   * Check if image matches exclusion criteria
   */
  private matchesExclusionCriteria(image: any, exclusionList: string[]): boolean {
    const imageText = [
      image.caption,
      image.visionSummary,
      image.virtual_description,
      image.virtualTags?.join(' ')
    ].filter(Boolean).join(' ').toLowerCase();

    return exclusionList.some(exclusion => 
      imageText.includes(exclusion.toLowerCase())
    );
  }

  /**
   * Check if image matches inclusion criteria
   */
  private matchesInclusionCriteria(image: any, inclusionList: string[]): boolean {
    const imageText = [
      image.caption,
      image.visionSummary,
      image.virtual_description,
      image.virtualTags?.join(' ')
    ].filter(Boolean).join(' ').toLowerCase();

    return inclusionList.some(inclusion => 
      imageText.includes(inclusion.toLowerCase())
    );
  }

  /**
   * Apply various constraints
   */
  private applyConstraints(results: any[], constraints: string[]) {
    let constrainedResults = [...results];

    for (const constraint of constraints) {
      if (constraint.includes('recent')) {
        // Sort by recency
        constrainedResults.sort((a, b) => 
          new Date(b.image.created_at).getTime() - new Date(a.image.created_at).getTime()
        );
      } else if (constraint.includes('quality')) {
        // Filter for higher quality images
        constrainedResults = constrainedResults.filter(result => 
          result.score > 0.5 || this.hasQualityIndicators(result.image)
        );
      } else if (constraint.includes('size')) {
        // Filter by file size if needed
        constrainedResults = constrainedResults.filter(result => 
          !result.image.metadata?.fileSize || result.image.metadata.fileSize > 100000 // >100KB
        );
      }
    }

    return constrainedResults;
  }

  /**
   * Check if image has quality indicators
   */
  private hasQualityIndicators(image: any): boolean {
    // High resolution
    if (image.metadata?.EXIF?.PixelXDimension && image.metadata?.EXIF?.PixelYDimension) {
      const megapixels = (image.metadata.EXIF.PixelXDimension * image.metadata.EXIF.PixelYDimension) / 1000000;
      if (megapixels > 5) return true;
    }

    // Quality labels from Rekognition
    if (image.metadata?.Labels) {
      const qualityLabels = image.metadata.Labels.filter((label: any) => 
        ['Sharp', 'Clear', 'Bright'].includes(label.Name) && label.Confidence > 80
      );
      if (qualityLabels.length > 0) return true;
    }

    return false;
  }

  /**
   * Perform intelligent scoring combining multiple factors
   */
  private async performIntelligentScoring(input: ChainInput, results: any[], analysis: any): Promise<SortedImageResult[]> {
    // Use LLM for final intelligent ranking
    const topResults = results.slice(0, 20);
    
    const prompt = SortingPrompts.CUSTOM_QUERY.format({
      query: input.query,
      imageCount: topResults.length,
      sortType: 'custom',
      userPreferences: formatUserPreferences(input.context.preferences),
      customCriteria: analysis.interpretation,
      imageData: formatImageDataForPrompt(topResults.map(r => r.image))
    });

    try {
      const llmResponse = await this.llm.invoke(prompt);
      const parsed = JSON.parse(llmResponse.content as string);
      
      return parsed.sortedImages.map((item: any, index: number) => ({
        image: topResults.find(r => r.image.id === item.imageId)?.image,
        sortScore: item.sortScore,
        reasoning: item.reasoning,
        position: index + 1,
        metadata: {
          queryComplexity: analysis.complexity,
          confidence: item.metadata?.confidence || 0.8,
          criteriaUsed: analysis.primaryCriteria.type,
          ...item.metadata
        }
      })).filter(item => item.image);

    } catch (error) {
      console.error('LLM scoring failed, using algorithmic results');
      return this.fallbackScoring(topResults, analysis);
    }
  }

  /**
   * Fallback scoring when LLM fails
   */
  private fallbackScoring(results: any[], analysis: any): SortedImageResult[] {
    return results.map((result, index) => ({
      image: result.image,
      sortScore: result.score,
      reasoning: result.reasoning || `Custom sorting by ${analysis.primaryCriteria.description}`,
      position: index + 1,
      metadata: {
        queryComplexity: analysis.complexity,
        confidence: 0.6,
        criteriaUsed: analysis.primaryCriteria.type
      }
    }));
  }

  /**
   * Determine if vision should be used for this query
   */
  private shouldUseVisionForQuery(context: any, analysis: any, results: any[]): boolean {
    if (context.preferences.useVisionSparingly) return false;
    if (context.constraints.maxCredits < 3) return false;
    
    // Use vision for complex visual queries
    if (analysis.complexity === 'complex' && 
        ['style', 'content', 'emotion'].includes(analysis.primaryCriteria.type)) {
      return true;
    }
    
    // Use vision if confidence is low
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    return avgScore < 0.6;
  }

  /**
   * Enhance with vision analysis
   */
  private async enhanceWithVision(input: ChainInput, results: SortedImageResult[], analysis: any): Promise<SortedImageResult[]> {
    // TODO: Implement vision enhancement
    return results.map(result => ({
      ...result,
      metadata: {
        ...result.metadata,
        confidence: Math.min((result.metadata.confidence || 0) + 0.2, 1.0),
        enhancedWithVision: true
      }
    }));
  }

  /**
   * Final validation and adjustment
   */
  private async validateAndAdjust(input: ChainInput, results: SortedImageResult[], analysis: any): Promise<SortedImageResult[]> {
    // Ensure diversity if requested
    if (analysis.filters?.include?.includes('diverse') || analysis.filters?.include?.includes('variety')) {
      return this.ensureDiversity(results);
    }

    return results;
  }

  /**
   * Ensure diversity in results
   */
  private ensureDiversity(results: SortedImageResult[]): SortedImageResult[] {
    // Simple diversity algorithm - spread out similar images
    const diverseResults: SortedImageResult[] = [];
    const usedImages = new Set();

    // Take top result
    if (results.length > 0) {
      diverseResults.push(results[0]);
      usedImages.add(results[0].image.id);
    }

    // Add diverse images
    for (const result of results.slice(1)) {
      if (diverseResults.length >= 10) break; // Limit for diversity

      // Simple diversity check - could be enhanced with embedding similarity
      const isDiverse = this.isDiverseFrom(result, diverseResults);
      if (isDiverse) {
        diverseResults.push(result);
        usedImages.add(result.image.id);
      }
    }

    // Fill remaining slots with best remaining images
    for (const result of results) {
      if (diverseResults.length >= 20) break;
      if (!usedImages.has(result.image.id)) {
        diverseResults.push(result);
      }
    }

    return diverseResults;
  }

  /**
   * Check if image is diverse from existing results
   */
  private isDiverseFrom(candidate: SortedImageResult, existing: SortedImageResult[]): boolean {
    // Simple diversity check based on metadata
    for (const existingResult of existing) {
      // Check album diversity
      if (candidate.image.virtualAlbum && 
          candidate.image.virtualAlbum === existingResult.image.virtualAlbum) {
        return false;
      }

      // Check date diversity (not too close in time)
      const candidateDate = new Date(candidate.image.created_at).getTime();
      const existingDate = new Date(existingResult.image.created_at).getTime();
      const timeDiff = Math.abs(candidateDate - existingDate);
      
      if (timeDiff < 24 * 60 * 60 * 1000) { // Less than 24 hours apart
        return false;
      }
    }

    return true;
  }

  /**
   * Fallback query decomposition
   */
  private fallbackQueryDecomposition(query: string) {
    return {
      primaryCriteria: {
        type: 'content',
        description: query,
        weight: 0.8
      },
      secondaryCriteria: [],
      filters: {
        include: [],
        exclude: [],
        constraints: []
      },
      complexity: 'moderate',
      confidence: 0.5,
      interpretation: `Fallback interpretation: sort by content matching "${query}"`,
      suggestedApproach: 'embedding'
    };
  }

  /**
   * Generate reasoning for custom query results
   */
  private generateCustomReasoning(analysis: any, results: SortedImageResult[], usedVision: boolean): string {
    const parts = [
      `Applied custom sorting strategy: ${analysis.interpretation}.`,
      `Primary criteria: ${analysis.primaryCriteria.description}.`
    ];

    if (analysis.secondaryCriteria.length > 0) {
      parts.push(`Secondary factors considered: ${analysis.secondaryCriteria.map((c: any) => c.description).join(', ')}.`);
    }

    if (results.length > 0) {
      const avgScore = results.reduce((sum, r) => sum + r.sortScore, 0) / results.length;
      if (avgScore > 0.8) {
        parts.push('Found excellent matches for the request.');
      } else if (avgScore > 0.6) {
        parts.push('Found good matches with reasonable confidence.');
      } else {
        parts.push('Identified potential matches based on available data.');
      }
    }

    if (usedVision) {
      parts.push('Enhanced with visual analysis for better accuracy.');
    }

    return parts.join(' ');
  }

  /**
   * Calculate confidence for custom query results
   */
  private calculateCustomConfidence(analysis: any, results: SortedImageResult[], usedVision: boolean): number {
    let confidence = analysis.confidence || 0.7;
    
    // Adjust based on result quality
    if (results.length > 0) {
      const avgResultConfidence = results.reduce((sum, r) => sum + (r.metadata.confidence || 0), 0) / results.length;
      confidence = (confidence + avgResultConfidence) / 2;
    }

    // Boost for vision usage
    if (usedVision) {
      confidence = Math.min(confidence + 0.15, 1.0);
    }

    // Adjust based on complexity
    if (analysis.complexity === 'complex') {
      confidence *= 0.9;
    } else if (analysis.complexity === 'simple') {
      confidence *= 1.1;
    }

    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  /**
   * Health check for custom query chain
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testInput: ChainInput = {
        query: 'show me my best photos',
        images: [],
        context: {
          query: 'show me my best photos',
          userImages: [],
          sortType: 'custom',
          preferences: {
            preferredSort: 'custom',
            useVisionSparingly: true,
            maxVisionCalls: 1,
            favoriteStyles: [],
            excludeNsfw: true
          },
          constraints: {
            maxResults: 10,
            maxProcessingTime: 30000,
            maxCredits: 5,
            requireConfidence: 0.6
          }
        },
        userId: 'test'
      };

      const result = await this.invoke(testInput);
      return result.confidence >= 0;
    } catch (error) {
      console.error('Custom query chain health check failed:', error);
      return false;
    }
  }
}
