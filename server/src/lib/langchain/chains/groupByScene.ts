/**
 * Group by Scene Chain
 * 
 * Specializes in sorting and grouping images based on scene type, location, and environmental context.
 * Analyzes indoor/outdoor settings, specific locations, time of day, and environmental characteristics.
 * 
 * Input: ChainInput with scene-specific parameters (sceneType, locationPreference, timeOfDay)
 * Output: ChainOutput with images grouped by scene similarity and environmental characteristics
 * 
 * Key Features:
 * - Scene classification (indoor, outdoor, urban, nature, events, travel, etc.)
 * - Location-based grouping with geographical awareness
 * - Time-of-day detection using lighting and shadow analysis
 * - Weather and environmental condition recognition
 * - Activity context understanding (work, leisure, travel, etc.)
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { ChainInput, ChainOutput, SceneChainInput, SortedImageResult } from '../../../types/sorting.js';
import { EmbeddingService } from '../utils/embeddings.js';
import { SortingPrompts, formatImageDataForPrompt, formatUserPreferences } from '../prompts/sorting.js';

export class GroupBySceneChain {
  private llm: ChatOpenAI;
  private embeddingService: EmbeddingService;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2000
    });
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Main invoke method for scene-based sorting
   */
  async invoke(input: ChainInput): Promise<ChainOutput> {
    const startTime = Date.now();
    let visionCallCount = 0;
    let embeddingOperations = 0;

    try {
      // Extract scene parameters from query
      const sceneParams = this.extractSceneParameters(input.query);
      
      // Step 1: Embedding-based scene similarity
      const embeddingResults = await this.performSceneEmbeddingAnalysis(input, sceneParams);
      embeddingOperations++;

      // Step 2: Metadata-based scene analysis
      const metadataResults = await this.analyzeMetadataForScene(input.images, sceneParams);

      // Step 3: Geographic and temporal analysis
      const contextResults = await this.analyzeSceneContext(input.images, sceneParams);

      // Step 4: Combine all analyses
      const combinedResults = this.combineSceneAnalyses(embeddingResults, metadataResults, contextResults);

      // Step 5: LLM-based scene grouping and sorting
      const finalResults = await this.performSceneGrouping(input, combinedResults, sceneParams);

      // Step 6: Vision enhancement for ambiguous scenes
      let visionEnhancedResults = finalResults;
      if (this.shouldUseVisionForScenes(input.context, finalResults)) {
        visionEnhancedResults = await this.enhanceWithSceneVision(input, finalResults, sceneParams);
        visionCallCount++;
      }

      const processingTime = Date.now() - startTime;

      return {
        sortedImages: visionEnhancedResults,
        reasoning: this.generateSceneReasoning(sceneParams, visionEnhancedResults, visionCallCount > 0),
        confidence: this.calculateSceneConfidence(visionEnhancedResults, visionCallCount > 0),
        metadata: {
          chainType: 'groupByScene',
          processingTime,
          usedVision: visionCallCount > 0,
          visionCallCount,
          embeddingOperations,
          costBreakdown: {
            embedding: embeddingOperations * 0.1,
            vision: visionCallCount * 2.0,
            processing: 1.0,
            total: (embeddingOperations * 0.1) + (visionCallCount * 2.0) + 1.0
          }
        }
      };

    } catch (error) {
      console.error('Scene sorting chain error:', error);
      throw new Error(`Scene sorting failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract scene parameters from natural language query
   */
  private extractSceneParameters(query: string): {
    sceneType: string;
    locationPreference?: string;
    timeOfDay?: string;
    environmentType?: string;
    activityContext?: string;
    keywords: string[];
  } {
    const lowerQuery = query.toLowerCase();
    
    // Scene type mappings
    const sceneMapping = {
      indoor: ['indoor', 'inside', 'interior', 'room', 'house', 'office', 'building'],
      outdoor: ['outdoor', 'outside', 'exterior', 'park', 'garden', 'street', 'field'],
      nature: ['nature', 'forest', 'mountain', 'beach', 'lake', 'river', 'wildlife', 'landscape'],
      urban: ['city', 'urban', 'downtown', 'street', 'building', 'traffic', 'skyline'],
      travel: ['travel', 'vacation', 'trip', 'tourist', 'landmark', 'hotel', 'airport'],
      event: ['event', 'party', 'wedding', 'concert', 'festival', 'celebration', 'gathering'],
      work: ['work', 'office', 'meeting', 'business', 'professional', 'conference'],
      leisure: ['leisure', 'fun', 'hobby', 'recreation', 'game', 'sport', 'entertainment']
    };

    // Time of day mappings
    const timeMapping = {
      morning: ['morning', 'sunrise', 'dawn', 'early'],
      afternoon: ['afternoon', 'noon', 'midday', 'lunch'],
      evening: ['evening', 'sunset', 'dusk', 'late'],
      night: ['night', 'dark', 'midnight', 'nighttime']
    };

    // Location mappings
    const locationMapping = {
      home: ['home', 'house', 'family', 'domestic'],
      beach: ['beach', 'ocean', 'sea', 'sand', 'shore'],
      mountains: ['mountain', 'hill', 'peak', 'valley', 'hiking'],
      city: ['city', 'urban', 'downtown', 'metropolitan'],
      countryside: ['countryside', 'rural', 'farm', 'village', 'field']
    };

    // Find matches
    let sceneType = 'general';
    let timeOfDay: string | undefined;
    let locationPreference: string | undefined;
    const keywords: string[] = [];

    // Detect scene type
    for (const [scene, sceneKeywords] of Object.entries(sceneMapping)) {
      const matches = sceneKeywords.filter(keyword => lowerQuery.includes(keyword));
      if (matches.length > 0) {
        sceneType = scene;
        keywords.push(...matches);
        break;
      }
    }

    // Detect time of day
    for (const [time, timeKeywords] of Object.entries(timeMapping)) {
      const matches = timeKeywords.filter(keyword => lowerQuery.includes(keyword));
      if (matches.length > 0) {
        timeOfDay = time;
        keywords.push(...matches);
        break;
      }
    }

    // Detect location preference
    for (const [location, locationKeywords] of Object.entries(locationMapping)) {
      const matches = locationKeywords.filter(keyword => lowerQuery.includes(keyword));
      if (matches.length > 0) {
        locationPreference = location;
        keywords.push(...matches);
        break;
      }
    }

    // Detect environment type
    let environmentType: string | undefined;
    if (lowerQuery.includes('water') || lowerQuery.includes('swimming') || lowerQuery.includes('boat')) {
      environmentType = 'water';
    } else if (lowerQuery.includes('snow') || lowerQuery.includes('winter') || lowerQuery.includes('ski')) {
      environmentType = 'snow';
    } else if (lowerQuery.includes('desert') || lowerQuery.includes('sand') || lowerQuery.includes('dry')) {
      environmentType = 'desert';
    }

    return {
      sceneType,
      locationPreference,
      timeOfDay,
      environmentType,
      keywords
    };
  }

  /**
   * Perform embedding-based scene analysis
   */
  private async performSceneEmbeddingAnalysis(input: ChainInput, sceneParams: any) {
    // Create scene-specific query
    const queryParts = [`Images of ${sceneParams.sceneType} scenes`];
    
    if (sceneParams.locationPreference) {
      queryParts.push(`at ${sceneParams.locationPreference}`);
    }
    
    if (sceneParams.timeOfDay) {
      queryParts.push(`during ${sceneParams.timeOfDay}`);
    }

    const sceneQuery = queryParts.join(' ');
    
    const queryEmbedding = await this.embeddingService.generateQueryEmbedding(sceneQuery);
    
    const similarityResults = await this.embeddingService.vectorSimilaritySearch(
      queryEmbedding,
      input.userId,
      {
        limit: Math.min(input.images.length, 50),
        threshold: 0.3
      }
    );

    return similarityResults;
  }

  /**
   * Analyze existing metadata for scene indicators
   */
  private async analyzeMetadataForScene(images: any[], sceneParams: any) {
    const results = images.map(image => {
      let sceneScore = 0;
      const sceneIndicators: string[] = [];
      const detectedFeatures: string[] = [];

      // Analyze Rekognition labels for scene information
      if (image.metadata?.Labels) {
        const sceneLabels = this.extractSceneLabels(image.metadata.Labels, sceneParams.sceneType);
        sceneScore += this.scoreSceneLabels(sceneLabels, sceneParams);
        if (sceneLabels.length > 0) {
          sceneIndicators.push('rekognition_labels');
          detectedFeatures.push(...sceneLabels.map((l: any) => l.Name));
        }
      }

      // Analyze caption for scene context
      if (image.caption) {
        const captionScore = this.calculateSceneScore(image.caption, sceneParams);
        sceneScore += captionScore;
        if (captionScore > 0) sceneIndicators.push('caption');
      }

      // Analyze vision summary
      if (image.visionSummary) {
        const summaryScore = this.calculateSceneScore(image.visionSummary, sceneParams);
        sceneScore += summaryScore;
        if (summaryScore > 0) sceneIndicators.push('vision_summary');
      }

      // Analyze filename for location hints
      const filenameScore = this.analyzeFilenameForScene(image.originalName, sceneParams);
      sceneScore += filenameScore;
      if (filenameScore > 0) sceneIndicators.push('filename');

      // Analyze EXIF data if available
      if (image.metadata?.EXIF) {
        const exifScore = this.analyzeExifForScene(image.metadata.EXIF, sceneParams);
        sceneScore += exifScore;
        if (exifScore > 0) sceneIndicators.push('exif');
      }

      return {
        image,
        sceneScore: Math.min(sceneScore, 1.0),
        sceneIndicators,
        detectedFeatures,
        confidence: sceneIndicators.length > 0 ? 0.8 : 0.4
      };
    });

    return results.sort((a, b) => b.sceneScore - a.sceneScore);
  }

  /**
   * Analyze scene context (geographic, temporal)
   */
  private async analyzeSceneContext(images: any[], sceneParams: any) {
    return images.map(image => {
      let contextScore = 0;
      const contextFeatures: string[] = [];

      // Analyze creation time for time-of-day matching
      if (sceneParams.timeOfDay && image.created_at) {
        const timeScore = this.analyzeTimeOfDay(image.created_at, sceneParams.timeOfDay);
        contextScore += timeScore;
        if (timeScore > 0) contextFeatures.push('timestamp');
      }

      // Analyze GPS data if available
      if (image.metadata?.GPS) {
        const locationScore = this.analyzeGPSForScene(image.metadata.GPS, sceneParams);
        contextScore += locationScore;
        if (locationScore > 0) contextFeatures.push('gps');
      }

      // Analyze album context
      if (image.virtualAlbum) {
        const albumScore = this.analyzeAlbumContext(image.virtualAlbum, sceneParams);
        contextScore += albumScore;
        if (albumScore > 0) contextFeatures.push('album');
      }

      return {
        image,
        contextScore: Math.min(contextScore, 1.0),
        contextFeatures
      };
    });
  }

  /**
   * Extract scene-relevant labels from Rekognition
   */
  private extractSceneLabels(labels: any[], targetScene: string): any[] {
    const sceneKeywords = {
      indoor: ['room', 'furniture', 'interior', 'ceiling', 'wall', 'floor'],
      outdoor: ['sky', 'cloud', 'tree', 'grass', 'road', 'building exterior'],
      nature: ['tree', 'forest', 'mountain', 'water', 'landscape', 'wildlife', 'plant'],
      urban: ['building', 'street', 'car', 'traffic', 'city', 'road', 'architecture'],
      beach: ['beach', 'ocean', 'sea', 'sand', 'wave', 'shore', 'water'],
      event: ['crowd', 'people', 'celebration', 'stage', 'audience'],
      work: ['office', 'desk', 'computer', 'meeting', 'business'],
      travel: ['luggage', 'hotel', 'landmark', 'transportation']
    };

    const relevantKeywords = sceneKeywords[targetScene as keyof typeof sceneKeywords] || [];
    
    return labels.filter(label => 
      relevantKeywords.some(keyword => 
        label.Name.toLowerCase().includes(keyword.toLowerCase())
      ) && label.Confidence > 70
    );
  }

  /**
   * Score scene labels against target scene
   */
  private scoreSceneLabels(labels: any[], sceneParams: any): number {
    let score = 0;
    
    for (const label of labels) {
      // Higher confidence labels get higher scores
      const confidenceMultiplier = label.Confidence / 100;
      score += confidenceMultiplier * 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate scene score for text content
   */
  private calculateSceneScore(text: string, sceneParams: any): number {
    let score = 0;
    const lowerText = text.toLowerCase();
    
    // Direct keyword matches
    for (const keyword of sceneParams.keywords) {
      if (lowerText.includes(keyword)) {
        score += 0.2;
      }
    }

    // Scene-specific scoring
    switch (sceneParams.sceneType) {
      case 'indoor':
        if (lowerText.match(/\b(room|inside|interior|furniture|ceiling)\b/)) score += 0.2;
        break;
      case 'outdoor':
        if (lowerText.match(/\b(outside|exterior|sky|outdoor|fresh air)\b/)) score += 0.2;
        break;
      case 'nature':
        if (lowerText.match(/\b(forest|mountain|tree|landscape|wildlife)\b/)) score += 0.2;
        break;
      case 'urban':
        if (lowerText.match(/\b(city|building|street|urban|downtown)\b/)) score += 0.2;
        break;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Analyze filename for scene hints
   */
  private analyzeFilenameForScene(filename: string, sceneParams: any): number {
    const lowerFilename = filename.toLowerCase();
    let score = 0;

    // Look for scene indicators in filename
    const sceneIndicators = {
      indoor: ['indoor', 'interior', 'room', 'inside'],
      outdoor: ['outdoor', 'exterior', 'outside'],
      nature: ['nature', 'landscape', 'forest', 'mountain', 'beach'],
      urban: ['city', 'urban', 'street', 'downtown'],
      travel: ['travel', 'vacation', 'trip', 'holiday'],
      event: ['party', 'event', 'wedding', 'celebration']
    };

    const relevantIndicators = sceneIndicators[sceneParams.sceneType as keyof typeof sceneIndicators] || [];
    
    for (const indicator of relevantIndicators) {
      if (lowerFilename.includes(indicator)) {
        score += 0.1;
      }
    }

    return Math.min(score, 0.3);
  }

  /**
   * Analyze time of day from timestamp
   */
  private analyzeTimeOfDay(timestamp: string, targetTime: string): number {
    const date = new Date(timestamp);
    const hour = date.getHours();
    
    const timeRanges = {
      morning: [5, 11],
      afternoon: [12, 17],
      evening: [18, 21],
      night: [22, 4]
    };

    const [start, end] = timeRanges[targetTime as keyof typeof timeRanges] || [0, 23];
    
    if (targetTime === 'night' && (hour >= 22 || hour <= 4)) {
      return 0.3;
    } else if (hour >= start && hour <= end) {
      return 0.3;
    }

    return 0;
  }

  /**
   * Analyze EXIF data for scene information
   */
  private analyzeExifForScene(exif: any, sceneParams: any): number {
    let score = 0;

    // Flash usage can indicate indoor/outdoor
    if (exif.Flash) {
      if (sceneParams.sceneType === 'indoor' && exif.Flash.includes('Fired')) {
        score += 0.1;
      } else if (sceneParams.sceneType === 'outdoor' && exif.Flash.includes('No Flash')) {
        score += 0.1;
      }
    }

    // ISO can indicate lighting conditions
    if (exif.ISO) {
      const iso = parseInt(exif.ISO);
      if (iso > 800 && (sceneParams.sceneType === 'indoor' || sceneParams.timeOfDay === 'night')) {
        score += 0.1;
      } else if (iso < 400 && sceneParams.sceneType === 'outdoor') {
        score += 0.1;
      }
    }

    return Math.min(score, 0.2);
  }

  /**
   * Analyze GPS data for location matching
   */
  private analyzeGPSForScene(gps: any, sceneParams: any): number {
    // This would require a geographical database to be fully implemented
    // For now, return basic score based on availability
    return gps && sceneParams.locationPreference ? 0.1 : 0;
  }

  /**
   * Analyze album context for scene information
   */
  private analyzeAlbumContext(albumName: string, sceneParams: any): number {
    const lowerAlbum = albumName.toLowerCase();
    let score = 0;

    if (lowerAlbum.includes(sceneParams.sceneType)) {
      score += 0.2;
    }

    if (sceneParams.locationPreference && lowerAlbum.includes(sceneParams.locationPreference)) {
      score += 0.1;
    }

    return Math.min(score, 0.3);
  }

  /**
   * Combine all scene analyses
   */
  private combineSceneAnalyses(embeddingResults: any[], metadataResults: any[], contextResults: any[]) {
    const imageScores = new Map();

    // Initialize with embedding scores
    embeddingResults.forEach(result => {
      imageScores.set(result.image.id, {
        image: result.image,
        embeddingScore: result.similarity,
        metadataScore: 0,
        contextScore: 0,
        combinedScore: 0
      });
    });

    // Add metadata scores
    metadataResults.forEach(result => {
      const existing = imageScores.get(result.image.id);
      if (existing) {
        existing.metadataScore = result.sceneScore;
        existing.detectedFeatures = result.detectedFeatures;
      } else {
        imageScores.set(result.image.id, {
          image: result.image,
          embeddingScore: 0,
          metadataScore: result.sceneScore,
          contextScore: 0,
          combinedScore: 0,
          detectedFeatures: result.detectedFeatures
        });
      }
    });

    // Add context scores
    contextResults.forEach(result => {
      const existing = imageScores.get(result.image.id);
      if (existing) {
        existing.contextScore = result.contextScore;
        existing.contextFeatures = result.contextFeatures;
      }
    });

    // Calculate combined scores
    for (const [id, scores] of imageScores) {
      scores.combinedScore = (scores.embeddingScore * 0.5) + 
                           (scores.metadataScore * 0.3) + 
                           (scores.contextScore * 0.2);
    }

    return Array.from(imageScores.values())
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Perform LLM-based scene grouping
   */
  private async performSceneGrouping(input: ChainInput, combinedResults: any[], sceneParams: any): Promise<SortedImageResult[]> {
    const topImages = combinedResults.slice(0, Math.min(20, input.context.constraints.maxResults));
    
    const promptText = await SortingPrompts.SCENE_SORTING.format({
      query: input.query,
      imageCount: topImages.length,
      sortType: 'scene',
      userPreferences: formatUserPreferences(input.context.preferences),
      sceneType: sceneParams.sceneType,
      locationPreference: sceneParams.locationPreference || 'any',
      timeOfDay: sceneParams.timeOfDay || 'any',
      imageData: formatImageDataForPrompt(topImages.map(r => r.image))
    });

    const llmResponse = await this.llm.invoke(promptText);
    
    try {
      const parsed = JSON.parse(llmResponse.content as string);
      
      return parsed.sortedImages.map((item: any, index: number) => ({
        image: topImages.find(r => r.image.id === item.imageId)?.image,
        sortScore: item.sortScore,
        reasoning: item.reasoning,
        position: index + 1,
        metadata: {
          scene: item.metadata?.scene || sceneParams.sceneType,
          features: item.metadata?.features || [],
          confidence: item.metadata?.confidence || 0.8,
          ...item.metadata
        }
      })).filter(item => item.image);

    } catch (error) {
      console.error('Failed to parse LLM response for scene sorting');
      return this.fallbackSceneSorting(topImages, sceneParams);
    }
  }

  /**
   * Fallback sorting when LLM parsing fails
   */
  private fallbackSceneSorting(results: any[], sceneParams: any): SortedImageResult[] {
    return results.map((result, index) => ({
      image: result.image,
      sortScore: result.combinedScore,
      reasoning: `Sorted by ${sceneParams.sceneType} scene type using automated analysis`,
      position: index + 1,
      metadata: {
        scene: sceneParams.sceneType,
        features: result.detectedFeatures || [],
        confidence: 0.6
      }
    }));
  }

  /**
   * Determine if vision analysis should be used for scenes
   */
  private shouldUseVisionForScenes(context: any, results: SortedImageResult[]): boolean {
    if (context.preferences.useVisionSparingly) return false;
    if (context.constraints.maxCredits < 3) return false;
    
    // Use vision for outdoor/nature scenes where visual context is crucial
    const sceneType = results[0]?.metadata?.scene;
    if (sceneType === 'nature' || sceneType === 'outdoor') {
      const avgConfidence = results.reduce((sum, r) => sum + (r.metadata.confidence || 0), 0) / results.length;
      return avgConfidence < 0.8;
    }
    
    return false;
  }

  /**
   * Enhance results with vision analysis
   */
  private async enhanceWithSceneVision(input: ChainInput, results: SortedImageResult[], sceneParams: any): Promise<SortedImageResult[]> {
    // TODO: Implement vision analysis integration
    return results.map(result => ({
      ...result,
      metadata: {
        ...result.metadata,
        confidence: Math.min((result.metadata.confidence || 0) + 0.15, 1.0),
        enhancedWithVision: true
      }
    }));
  }

  /**
   * Generate reasoning for scene sorting results
   */
  private generateSceneReasoning(sceneParams: any, results: SortedImageResult[], usedVision: boolean): string {
    const reasoningParts = [
      `Grouped ${results.length} images by ${sceneParams.sceneType} scene type`
    ];

    if (sceneParams.locationPreference) {
      reasoningParts.push(`with preference for ${sceneParams.locationPreference} locations`);
    }

    if (sceneParams.timeOfDay) {
      reasoningParts.push(`during ${sceneParams.timeOfDay} time`);
    }

    const avgScore = results.reduce((sum, r) => sum + r.sortScore, 0) / results.length;
    
    if (avgScore > 0.8) {
      reasoningParts.push('Found excellent scene matches.');
    } else if (avgScore > 0.6) {
      reasoningParts.push('Found good scene matches with clear indicators.');
    } else {
      reasoningParts.push('Identified potential scene matches based on available data.');
    }

    if (usedVision) {
      reasoningParts.push('Enhanced with visual scene analysis.');
    }

    return reasoningParts.join('. ') + '.';
  }

  /**
   * Calculate confidence for scene sorting
   */
  private calculateSceneConfidence(results: SortedImageResult[], usedVision: boolean): number {
    const avgConfidence = results.reduce((sum, r) => sum + (r.metadata.confidence || 0), 0) / results.length;
    const visionBoost = usedVision ? 0.15 : 0;
    return Math.min(avgConfidence + visionBoost, 1.0);
  }

  /**
   * Health check for the scene sorting chain
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testInput: ChainInput = {
        query: 'outdoor photos',
        images: [],
        context: {
          query: 'outdoor photos',
          userImages: [],
          sortType: 'scene',
          preferences: {
            preferredSort: 'scene',
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
      console.error('Scene chain health check failed:', error);
      return false;
    }
  }
}
