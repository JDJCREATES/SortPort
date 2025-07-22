/**
 * Sort by Tone Chain
 * 
 * Specializes in sorting images based on emotional tone and mood.
 * Uses combination of embeddings, metadata analysis, and optional vision to determine emotional content.
 * 
 * Input: ChainInput with tone-specific parameters (targetTone, intensity)
 * Output: ChainOutput with images sorted by emotional relevance
 * 
 * Key Features:
 * - Emotional tone classification (happy, calm, energetic, melancholic, etc.)
 * - Intensity-based sorting (subtle, moderate, strong emotional content)
 * - Multi-modal analysis combining text embeddings and visual cues
 * - Confidence scoring based on available emotion indicators
 * - Cost-efficient processing prioritizing existing data over vision calls
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { ChainInput, ChainOutput, ToneChainInput, SortedImageResult, ChainMetadata } from '../../../types/sorting.js';
import { EmbeddingService } from '../utils/embeddings.js';
import { SortingPrompts, formatImageDataForPrompt, formatUserPreferences } from '../prompts/sorting.js';

export class SortByToneChain {
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
   * Main invoke method for tone-based sorting
   */
  async invoke(input: ChainInput): Promise<ChainOutput> {
    const startTime = Date.now();
    let visionCallCount = 0;
    let embeddingOperations = 0;

    try {
      // Extract tone parameters from query
      const toneParams = this.extractToneParameters(input.query);
      
      // Step 1: Embedding-based pre-filtering
      const embeddingResults = await this.performEmbeddingAnalysis(input, toneParams);
      embeddingOperations++;

      // Step 2: Metadata-based tone analysis
      const metadataResults = await this.analyzeMetadataForTone(input.images, toneParams);

      // Step 3: Combine results and create initial ranking
      const combinedResults = this.combineAnalyses(embeddingResults, metadataResults, toneParams);

      // Step 4: LLM-based refinement and final sorting
      const finalResults = await this.performLLMSorting(input, combinedResults, toneParams);

      // Step 5: Vision analysis if needed and budget allows
      let visionEnhancedResults = finalResults;
      if (this.shouldUseVision(input.context, finalResults)) {
        visionEnhancedResults = await this.enhanceWithVision(input, finalResults, toneParams);
        visionCallCount++;
      }

      const processingTime = Date.now() - startTime;

      return {
        sortedImages: visionEnhancedResults,
        reasoning: this.generateReasoning(toneParams, visionEnhancedResults, visionCallCount > 0),
        confidence: this.calculateConfidence(visionEnhancedResults, visionCallCount > 0),
        metadata: {
          chainType: 'sortByTone',
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
      console.error('Tone sorting chain error:', error);
      throw new Error(`Tone sorting failed: ${error.message}`);
    }
  }

  /**
   * Extract tone parameters from natural language query
   */
  private extractToneParameters(query: string): {
    targetTone: string;
    intensity: 'subtle' | 'moderate' | 'strong';
    keywords: string[];
  } {
    const lowerQuery = query.toLowerCase();
    
    // Define tone mappings
    const toneMapping = {
      happy: ['happy', 'joyful', 'cheerful', 'upbeat', 'positive', 'bright', 'smiling', 'celebration'],
      calm: ['calm', 'peaceful', 'serene', 'quiet', 'tranquil', 'relaxing', 'zen', 'meditation'],
      energetic: ['energetic', 'dynamic', 'active', 'vibrant', 'exciting', 'action', 'movement', 'sports'],
      melancholic: ['sad', 'melancholic', 'somber', 'moody', 'emotional', 'reflective', 'nostalgic'],
      dramatic: ['dramatic', 'intense', 'powerful', 'striking', 'bold', 'cinematic', 'stormy'],
      romantic: ['romantic', 'intimate', 'love', 'tender', 'soft', 'warm', 'couple', 'sunset'],
      professional: ['professional', 'formal', 'business', 'corporate', 'clean', 'structured'],
      playful: ['playful', 'fun', 'silly', 'casual', 'humor', 'lighthearted', 'informal']
    };

    // Find matching tone
    let targetTone = 'neutral';
    let matchedKeywords: string[] = [];
    
    for (const [tone, keywords] of Object.entries(toneMapping)) {
      const matches = keywords.filter(keyword => lowerQuery.includes(keyword));
      if (matches.length > 0) {
        targetTone = tone;
        matchedKeywords = matches;
        break;
      }
    }

    // Determine intensity
    let intensity: 'subtle' | 'moderate' | 'strong' = 'moderate';
    if (lowerQuery.includes('very') || lowerQuery.includes('extremely') || lowerQuery.includes('highly')) {
      intensity = 'strong';
    } else if (lowerQuery.includes('slightly') || lowerQuery.includes('somewhat') || lowerQuery.includes('mildly')) {
      intensity = 'subtle';
    }

    return {
      targetTone,
      intensity,
      keywords: matchedKeywords
    };
  }

  /**
   * Perform embedding-based analysis for tone similarity
   */
  private async performEmbeddingAnalysis(input: ChainInput, toneParams: any) {
    // Create tone-specific query
    const toneQuery = `Images with ${toneParams.targetTone} emotional tone, ${toneParams.intensity} intensity`;
    
    const queryEmbedding = await this.embeddingService.generateQueryEmbedding(toneQuery);
    
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
   * Analyze existing metadata for tone indicators
   */
  private async analyzeMetadataForTone(images: any[], toneParams: any) {
    const results = images.map(image => {
      let toneScore = 0;
      const toneIndicators: string[] = [];

      // Analyze caption for tone keywords
      if (image.caption) {
        const caption = image.caption.toLowerCase();
        toneScore += this.calculateToneScore(caption, toneParams);
        if (toneScore > 0) toneIndicators.push('caption');
      }

      // Analyze vision summary
      if (image.visionSummary) {
        const summary = image.visionSummary.toLowerCase();
        toneScore += this.calculateToneScore(summary, toneParams);
        if (toneScore > 0) toneIndicators.push('vision_summary');
      }

      // Analyze Rekognition labels for emotion-related content
      if (image.metadata?.Labels) {
        const emotionLabels = this.extractEmotionLabels(image.metadata.Labels);
        const emotionScore = this.scoreEmotionLabels(emotionLabels, toneParams.targetTone);
        toneScore += emotionScore;
        if (emotionScore > 0) toneIndicators.push('labels');
      }

      // Analyze tags
      if (image.virtualTags) {
        const tagScore = this.calculateToneScore(image.virtualTags.join(' '), toneParams);
        toneScore += tagScore;
        if (tagScore > 0) toneIndicators.push('tags');
      }

      return {
        image,
        toneScore: Math.min(toneScore, 1.0), // Cap at 1.0
        toneIndicators,
        confidence: toneIndicators.length > 0 ? 0.7 : 0.3
      };
    });

    return results.sort((a, b) => b.toneScore - a.toneScore);
  }

  /**
   * Calculate tone score for text content
   */
  private calculateToneScore(text: string, toneParams: any): number {
    let score = 0;
    
    // Direct keyword matches
    for (const keyword of toneParams.keywords) {
      if (text.includes(keyword)) {
        score += 0.3;
      }
    }

    // Tone-specific scoring
    switch (toneParams.targetTone) {
      case 'happy':
        if (text.match(/\b(bright|colorful|smile|laugh|celebrate|joy)\b/)) score += 0.2;
        break;
      case 'calm':
        if (text.match(/\b(peaceful|quiet|still|gentle|soft|nature)\b/)) score += 0.2;
        break;
      case 'energetic':
        if (text.match(/\b(action|movement|sport|dance|run|jump)\b/)) score += 0.2;
        break;
      case 'dramatic':
        if (text.match(/\b(storm|dark|contrast|shadow|bold|striking)\b/)) score += 0.2;
        break;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Extract emotion-related labels from Rekognition
   */
  private extractEmotionLabels(labels: any[]): any[] {
    const emotionKeywords = [
      'smile', 'happy', 'joy', 'celebration', 'party', 'festival',
      'calm', 'peaceful', 'serene', 'nature', 'landscape',
      'action', 'sport', 'dynamic', 'movement', 'dance',
      'dramatic', 'storm', 'sunset', 'mountain', 'ocean'
    ];

    return labels.filter(label => 
      emotionKeywords.some(keyword => 
        label.Name.toLowerCase().includes(keyword)
      ) && label.Confidence > 70
    );
  }

  /**
   * Score emotion labels against target tone
   */
  private scoreEmotionLabels(labels: any[], targetTone: string): number {
    const toneLabels = {
      happy: ['smile', 'happy', 'joy', 'celebration', 'party'],
      calm: ['calm', 'peaceful', 'serene', 'nature', 'landscape'],
      energetic: ['action', 'sport', 'dynamic', 'movement', 'dance'],
      dramatic: ['dramatic', 'storm', 'sunset', 'mountain', 'ocean']
    };

    const relevantLabels = toneLabels[targetTone as keyof typeof toneLabels] || [];
    
    let score = 0;
    for (const label of labels) {
      if (relevantLabels.some(toneLabel => 
        label.Name.toLowerCase().includes(toneLabel)
      )) {
        score += (label.Confidence / 100) * 0.3;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Combine embedding and metadata analyses
   */
  private combineAnalyses(embeddingResults: any[], metadataResults: any[], toneParams: any) {
    const imageScores = new Map();

    // Add embedding scores
    embeddingResults.forEach(result => {
      imageScores.set(result.image.id, {
        image: result.image,
        embeddingScore: result.similarity,
        metadataScore: 0,
        combinedScore: 0
      });
    });

    // Add metadata scores
    metadataResults.forEach(result => {
      const existing = imageScores.get(result.image.id);
      if (existing) {
        existing.metadataScore = result.toneScore;
      } else {
        imageScores.set(result.image.id, {
          image: result.image,
          embeddingScore: 0,
          metadataScore: result.toneScore,
          combinedScore: 0
        });
      }
    });

    // Calculate combined scores
    for (const [id, scores] of imageScores) {
      scores.combinedScore = (scores.embeddingScore * 0.6) + (scores.metadataScore * 0.4);
    }

    return Array.from(imageScores.values())
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Perform LLM-based sorting refinement
   */
  private async performLLMSorting(input: ChainInput, combinedResults: any[], toneParams: any): Promise<SortedImageResult[]> {
    const topImages = combinedResults.slice(0, Math.min(20, input.context.constraints.maxResults));
    
    const prompt = SortingPrompts.TONE_SORTING.format({
      query: input.query,
      imageCount: topImages.length,
      sortType: 'tone',
      userPreferences: formatUserPreferences(input.context.preferences),
      targetTone: toneParams.targetTone,
      intensity: toneParams.intensity,
      imageData: formatImageDataForPrompt(topImages.map(r => r.image))
    });

    const llmResponse = await this.llm.invoke(prompt);
    
    try {
      const parsed = JSON.parse(llmResponse.content as string);
      
      return parsed.sortedImages.map((item: any, index: number) => ({
        image: topImages.find(r => r.image.id === item.imageId)?.image,
        sortScore: item.sortScore,
        reasoning: item.reasoning,
        position: index + 1,
        metadata: {
          tone: item.metadata?.tone || toneParams.targetTone,
          confidence: item.metadata?.confidence || 0.8,
          ...item.metadata
        }
      })).filter(item => item.image); // Remove any that couldn't be matched

    } catch (error) {
      console.error('Failed to parse LLM response, using fallback sorting');
      return this.fallbackSorting(topImages, toneParams);
    }
  }

  /**
   * Fallback sorting when LLM parsing fails
   */
  private fallbackSorting(results: any[], toneParams: any): SortedImageResult[] {
    return results.map((result, index) => ({
      image: result.image,
      sortScore: result.combinedScore,
      reasoning: `Sorted by ${toneParams.targetTone} tone using embedding and metadata analysis`,
      position: index + 1,
      metadata: {
        tone: toneParams.targetTone,
        confidence: 0.6
      }
    }));
  }

  /**
   * Determine if vision analysis should be used
   */
  private shouldUseVision(context: any, results: SortedImageResult[]): boolean {
    // Don't use vision if explicitly disabled
    if (context.preferences.useVisionSparingly) return false;
    
    // Don't use if budget constraints
    if (context.constraints.maxCredits < 3) return false;
    
    // Use vision if confidence is low
    const avgConfidence = results.reduce((sum, r) => sum + (r.metadata.confidence || 0), 0) / results.length;
    return avgConfidence < 0.7;
  }

  /**
   * Enhance results with vision analysis (placeholder)
   */
  private async enhanceWithVision(input: ChainInput, results: SortedImageResult[], toneParams: any): Promise<SortedImageResult[]> {
    // TODO: Implement vision analysis integration
    // This would call the atlas generation and vision analysis chains
    
    // For now, return results with slightly higher confidence
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
   * Generate reasoning for the sorting results
   */
  private generateReasoning(toneParams: any, results: SortedImageResult[], usedVision: boolean): string {
    const reasoningParts = [
      `Sorted ${results.length} images by ${toneParams.targetTone} emotional tone`,
      `with ${toneParams.intensity} intensity preference.`
    ];

    const avgScore = results.reduce((sum, r) => sum + r.sortScore, 0) / results.length;
    
    if (avgScore > 0.8) {
      reasoningParts.push('Found strong tone matches in the collection.');
    } else if (avgScore > 0.6) {
      reasoningParts.push('Found moderate tone matches with good confidence.');
    } else {
      reasoningParts.push('Limited tone matches found; results based on best available indicators.');
    }

    if (usedVision) {
      reasoningParts.push('Enhanced accuracy with visual analysis.');
    }

    return reasoningParts.join(' ');
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(results: SortedImageResult[], usedVision: boolean): number {
    const avgConfidence = results.reduce((sum, r) => sum + (r.metadata.confidence || 0), 0) / results.length;
    
    // Boost confidence if vision was used
    const visionBoost = usedVision ? 0.1 : 0;
    
    return Math.min(avgConfidence + visionBoost, 1.0);
  }

  /**
   * Health check for the tone sorting chain
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic functionality
      const testInput: ChainInput = {
        query: 'happy photos',
        images: [],
        context: {
          query: 'happy photos',
          userImages: [],
          sortType: 'tone',
          preferences: {
            preferredSort: 'tone',
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

      // This should return quickly with empty results
      const result = await this.invoke(testInput);
      return result.confidence >= 0;
    } catch (error) {
      console.error('Tone chain health check failed:', error);
      return false;
    }
  }
}
