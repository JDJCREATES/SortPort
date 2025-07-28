/**
 * Search Ranker
 * 
 * NEW: Multi-factor ranking, score aggregation, and result fusion.
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';

export interface RankingCriteria {
  relevance: number;
  quality: number;
  recency: number;
  popularity: number;
  personalization: number;
}

export interface RankedResult {
  item: any;
  scores: RankingCriteria;
  finalScore: number;
  ranking: number;
}

export class SearchRanker {
  private rankingChain!: RunnableSequence;
  
  constructor() {
    this.setupRankingChain();
  }

  async rankResults(results: any[], criteria: Partial<RankingCriteria> = {}): Promise<RankedResult[]> {
    if (!results || results.length === 0) {
      return [];
    }

    try {
      const defaultCriteria: RankingCriteria = {
        relevance: 0.4,
        quality: 0.3,
        recency: 0.1,
        popularity: 0.1,
        personalization: 0.1
      };

      const weights = { ...defaultCriteria, ...criteria };
      const rankedResults: RankedResult[] = [];

      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        const chainResult = await this.rankingChain.invoke({
          item,
          weights,
          context: {
            index: i,
            totalItems: results.length,
            allItems: results
          }
        });

        rankedResults.push({
          item,
          scores: chainResult.scores,
          finalScore: chainResult.finalScore,
          ranking: 0 // Will be set after sorting
        });
      }

      // Sort by final score (descending)
      rankedResults.sort((a, b) => b.finalScore - a.finalScore);

      // Assign rankings
      rankedResults.forEach((result, index) => {
        result.ranking = index + 1;
      });

      return rankedResults;
    } catch (error) {
      throw new Error(`Ranking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async aggregateScores(scores: RankingCriteria, weights?: Partial<RankingCriteria>): Promise<number> {
    const defaultWeights: RankingCriteria = {
      relevance: 0.4,
      quality: 0.3,
      recency: 0.1,
      popularity: 0.1,
      personalization: 0.1
    };

    const finalWeights = { ...defaultWeights, ...weights };

    return (
      scores.relevance * finalWeights.relevance +
      scores.quality * finalWeights.quality +
      scores.recency * finalWeights.recency +
      scores.popularity * finalWeights.popularity +
      scores.personalization * finalWeights.personalization
    );
  }

  private setupRankingChain(): void {
    this.rankingChain = RunnableSequence.from([
      RunnableLambda.from((input: any) => this.calculateRelevanceScore(input)),
      RunnableLambda.from((input: any) => this.calculateQualityScore(input)),
      RunnableLambda.from((input: any) => this.calculateRecencyScore(input)),
      RunnableLambda.from((input: any) => this.calculatePopularityScore(input)),
      RunnableLambda.from((input: any) => this.calculatePersonalizationScore(input)),
      RunnableLambda.from((input: any) => this.aggregateFinalScore(input))
    ]);
  }

  private calculateRelevanceScore(input: any): any {
    const { item, weights } = input;
    let relevanceScore = 0;

    // Text relevance (if item has text content)
    if (item.description || item.title || item.keywords) {
      relevanceScore += this.calculateTextRelevance(item, input.context?.query);
    }

    // Metadata relevance (if item has metadata)
    if (item.metadata) {
      relevanceScore += this.calculateMetadataRelevance(item.metadata, input.context?.criteria);
    }

    // Content type relevance
    if (item.contentType) {
      relevanceScore += this.calculateContentTypeRelevance(item.contentType, input.context?.preferredTypes);
    }

    // Visual relevance (for images)
    if (item.visionAnalysis) {
      relevanceScore += this.calculateVisualRelevance(item.visionAnalysis, input.context?.visualCriteria);
    }

    return {
      ...input,
      scores: {
        ...input.scores,
        relevance: Math.min(Math.max(relevanceScore / 4, 0), 1) // Normalize to 0-1
      }
    };
  }

  private calculateQualityScore(input: any): any {
    const { item } = input;
    let qualityScore = 0;

    // Technical quality (resolution, file size, etc.)
    if (item.technicalMetrics) {
      qualityScore += this.calculateTechnicalQuality(item.technicalMetrics);
    }

    // Content quality (AI-assessed)
    if (item.qualityAssessment) {
      qualityScore += item.qualityAssessment.score || 0;
    }

    // User ratings
    if (item.userRating) {
      qualityScore += item.userRating / 5; // Normalize 5-star to 0-1
    }

    // Completeness (metadata richness)
    if (item.metadata) {
      qualityScore += this.calculateMetadataCompleteness(item.metadata);
    }

    return {
      ...input,
      scores: {
        ...input.scores,
        quality: Math.min(Math.max(qualityScore / 4, 0), 1)
      }
    };
  }

  private calculateRecencyScore(input: any): any {
    const { item } = input;
    let recencyScore = 0;

    if (item.createdAt || item.dateAdded || item.lastModified) {
      const date = new Date(item.createdAt || item.dateAdded || item.lastModified);
      const now = new Date();
      const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

      // More recent = higher score
      if (daysDiff <= 1) recencyScore = 1.0;
      else if (daysDiff <= 7) recencyScore = 0.8;
      else if (daysDiff <= 30) recencyScore = 0.6;
      else if (daysDiff <= 90) recencyScore = 0.4;
      else if (daysDiff <= 365) recencyScore = 0.2;
      else recencyScore = 0.1;
    } else {
      recencyScore = 0.5; // Default for items without date
    }

    return {
      ...input,
      scores: {
        ...input.scores,
        recency: recencyScore
      }
    };
  }

  private calculatePopularityScore(input: any): any {
    const { item, context } = input;
    let popularityScore = 0;

    // View count
    if (item.viewCount) {
      const maxViews = Math.max(...(context.allItems?.map((i: any) => i.viewCount || 0) || [1]));
      popularityScore += (item.viewCount / maxViews) * 0.4;
    }

    // Download count
    if (item.downloadCount) {
      const maxDownloads = Math.max(...(context.allItems?.map((i: any) => i.downloadCount || 0) || [1]));
      popularityScore += (item.downloadCount / maxDownloads) * 0.3;
    }

    // Like/favorite count
    if (item.likes || item.favorites) {
      const count = (item.likes || 0) + (item.favorites || 0);
      const maxLikes = Math.max(...(context.allItems?.map((i: any) => (i.likes || 0) + (i.favorites || 0)) || [1]));
      popularityScore += (count / maxLikes) * 0.3;
    }

    return {
      ...input,
      scores: {
        ...input.scores,
        popularity: Math.min(popularityScore, 1)
      }
    };
  }

  private calculatePersonalizationScore(input: any): any {
    const { item, context } = input;
    let personalizationScore = 0.5; // Default neutral score

    // User preference matching
    if (context?.userPreferences) {
      personalizationScore += this.matchUserPreferences(item, context.userPreferences);
    }

    // Historical interaction
    if (context?.userHistory && item.id) {
      personalizationScore += this.calculateHistoricalRelevance(item.id, context.userHistory);
    }

    // Similarity to liked items
    if (context?.likedItems) {
      personalizationScore += this.calculateSimilarityToLiked(item, context.likedItems);
    }

    return {
      ...input,
      scores: {
        ...input.scores,
        personalization: Math.min(Math.max(personalizationScore / 3, 0), 1)
      }
    };
  }

  private aggregateFinalScore(input: any): any {
    const { scores, weights } = input;
    
    const finalScore = (
      scores.relevance * weights.relevance +
      scores.quality * weights.quality +
      scores.recency * weights.recency +
      scores.popularity * weights.popularity +
      scores.personalization * weights.personalization
    );

    return {
      ...input,
      finalScore: Math.min(Math.max(finalScore, 0), 1),
      metadata: {
        scoreBreakdown: scores,
        weights: weights,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Helper methods for scoring
  private calculateTextRelevance(item: any, query?: string): number {
    if (!query) return 0.5;

    const text = [
      item.title,
      item.description,
      item.keywords?.join(' '),
      item.tags?.join(' ')
    ].filter(Boolean).join(' ').toLowerCase();

    if (!text) return 0;

    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.split(/\s+/);
    
    const matchCount = queryWords.filter(word => 
      textWords.some(textWord => textWord.includes(word) || word.includes(textWord))
    ).length;

    return matchCount / Math.max(queryWords.length, 1);
  }

  private calculateMetadataRelevance(metadata: any, criteria?: any): number {
    if (!criteria) return 0.5;

    let relevance = 0;
    let factors = 0;

    Object.keys(criteria).forEach(key => {
      if (metadata[key] !== undefined) {
        const criteriaValue = criteria[key];
        const metadataValue = metadata[key];

        if (typeof criteriaValue === 'string' && typeof metadataValue === 'string') {
          relevance += metadataValue.toLowerCase().includes(criteriaValue.toLowerCase()) ? 1 : 0;
        } else if (typeof criteriaValue === 'number' && typeof metadataValue === 'number') {
          const diff = Math.abs(criteriaValue - metadataValue) / Math.max(criteriaValue, metadataValue, 1);
          relevance += Math.max(0, 1 - diff);
        } else {
          relevance += criteriaValue === metadataValue ? 1 : 0;
        }
        factors++;
      }
    });

    return factors > 0 ? relevance / factors : 0.5;
  }

  private calculateContentTypeRelevance(contentType: string, preferredTypes?: string[]): number {
    if (!preferredTypes || preferredTypes.length === 0) return 0.5;

    const normalizedType = contentType.toLowerCase();
    const match = preferredTypes.some(type => 
      normalizedType.includes(type.toLowerCase()) || type.toLowerCase().includes(normalizedType)
    );

    return match ? 1 : 0.2;
  }

  private calculateVisualRelevance(visionAnalysis: any, visualCriteria?: any): number {
    if (!visualCriteria) return 0.5;

    let relevance = 0;
    let factors = 0;

    // Object matching
    if (visualCriteria.objects && visionAnalysis.objects) {
      const matchedObjects = visualCriteria.objects.filter((obj: string) =>
        visionAnalysis.objects.some((visionObj: any) => 
          visionObj.name?.toLowerCase().includes(obj.toLowerCase())
        )
      );
      relevance += matchedObjects.length / Math.max(visualCriteria.objects.length, 1);
      factors++;
    }

    // Scene matching
    if (visualCriteria.scenes && visionAnalysis.scenes) {
      const matchedScenes = visualCriteria.scenes.filter((scene: string) =>
        visionAnalysis.scenes.some((visionScene: any) =>
          visionScene.name?.toLowerCase().includes(scene.toLowerCase())
        )
      );
      relevance += matchedScenes.length / Math.max(visualCriteria.scenes.length, 1);
      factors++;
    }

    // Color matching
    if (visualCriteria.colors && visionAnalysis.colors) {
      relevance += this.calculateColorSimilarity(visualCriteria.colors, visionAnalysis.colors);
      factors++;
    }

    return factors > 0 ? relevance / factors : 0.5;
  }

  private calculateTechnicalQuality(metrics: any): number {
    let quality = 0;
    let factors = 0;

    // Resolution quality
    if (metrics.width && metrics.height) {
      const totalPixels = metrics.width * metrics.height;
      if (totalPixels >= 2073600) quality += 1; // 1920x1080 or better
      else if (totalPixels >= 921600) quality += 0.8; // 1280x720 or better
      else if (totalPixels >= 307200) quality += 0.6; // 640x480 or better
      else quality += 0.3;
      factors++;
    }

    // File size appropriateness
    if (metrics.fileSize && metrics.width && metrics.height) {
      const pixelCount = metrics.width * metrics.height;
      const ratio = metrics.fileSize / pixelCount;
      
      // Good compression ratio indicates quality
      if (ratio >= 0.5 && ratio <= 3) quality += 1;
      else if (ratio >= 0.2 && ratio <= 5) quality += 0.7;
      else quality += 0.4;
      factors++;
    }

    // Format quality
    if (metrics.format) {
      const highQualityFormats = ['png', 'tiff', 'raw', 'bmp'];
      const mediumQualityFormats = ['jpg', 'jpeg', 'webp'];
      
      if (highQualityFormats.includes(metrics.format.toLowerCase())) quality += 1;
      else if (mediumQualityFormats.includes(metrics.format.toLowerCase())) quality += 0.7;
      else quality += 0.4;
      factors++;
    }

    return factors > 0 ? quality / factors : 0.5;
  }

  private calculateMetadataCompleteness(metadata: any): number {
    const importantFields = ['title', 'description', 'tags', 'category', 'createdAt', 'author'];
    const presentFields = importantFields.filter(field => metadata[field] && metadata[field] !== '');
    
    return presentFields.length / importantFields.length;
  }

  private matchUserPreferences(item: any, preferences: any): number {
    let score = 0;
    let factors = 0;

    // Category preferences
    if (preferences.categories && item.category) {
      score += preferences.categories.includes(item.category) ? 1 : 0;
      factors++;
    }

    // Style preferences
    if (preferences.styles && item.style) {
      score += preferences.styles.includes(item.style) ? 1 : 0;
      factors++;
    }

    // Color preferences
    if (preferences.colors && item.dominantColors) {
      score += this.calculateColorSimilarity(preferences.colors, item.dominantColors);
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  private calculateHistoricalRelevance(itemId: string, userHistory: any[]): number {
    const interactions = userHistory.filter(h => h.itemId === itemId);
    
    if (interactions.length === 0) return 0;

    let score = 0;
    interactions.forEach(interaction => {
      switch (interaction.type) {
        case 'view': score += 0.1; break;
        case 'like': score += 0.3; break;
        case 'download': score += 0.5; break;
        case 'share': score += 0.4; break;
      }
    });

    return Math.min(score, 1);
  }

  private calculateSimilarityToLiked(item: any, likedItems: any[]): number {
    if (likedItems.length === 0) return 0;

    let totalSimilarity = 0;
    
    likedItems.forEach(likedItem => {
      let similarity = 0;
      let factors = 0;

      // Category similarity
      if (item.category && likedItem.category) {
        similarity += item.category === likedItem.category ? 1 : 0;
        factors++;
      }

      // Style similarity
      if (item.style && likedItem.style) {
        similarity += item.style === likedItem.style ? 1 : 0;
        factors++;
      }

      // Visual similarity (if available)
      if (item.visionAnalysis && likedItem.visionAnalysis) {
        similarity += this.calculateVisualSimilarity(item.visionAnalysis, likedItem.visionAnalysis);
        factors++;
      }

      totalSimilarity += factors > 0 ? similarity / factors : 0;
    });

    return totalSimilarity / likedItems.length;
  }

  private calculateColorSimilarity(colors1: string[], colors2: string[]): number {
    if (!colors1 || !colors2 || colors1.length === 0 || colors2.length === 0) return 0;

    const matches = colors1.filter(color1 => 
      colors2.some(color2 => this.areColorsSimilar(color1, color2))
    );

    return matches.length / Math.max(colors1.length, colors2.length);
  }

  private calculateVisualSimilarity(analysis1: any, analysis2: any): number {
    let similarity = 0;
    let factors = 0;

    // Object similarity
    if (analysis1.objects && analysis2.objects) {
      const objects1 = analysis1.objects.map((o: any) => o.name || o).map((n: string) => n.toLowerCase());
      const objects2 = analysis2.objects.map((o: any) => o.name || o).map((n: string) => n.toLowerCase());
      
      const commonObjects = objects1.filter((obj: string) => objects2.includes(obj));
      similarity += commonObjects.length / Math.max(objects1.length, objects2.length, 1);
      factors++;
    }

    // Scene similarity
    if (analysis1.scenes && analysis2.scenes) {
      const scenes1 = analysis1.scenes.map((s: any) => s.name || s).map((n: string) => n.toLowerCase());
      const scenes2 = analysis2.scenes.map((s: any) => s.name || s).map((n: string) => n.toLowerCase());
      
      const commonScenes = scenes1.filter((scene: string) => scenes2.includes(scene));
      similarity += commonScenes.length / Math.max(scenes1.length, scenes2.length, 1);
      factors++;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  private areColorsSimilar(color1: string, color2: string): boolean {
    // Simple color similarity - in a real implementation, you'd use color distance
    return color1.toLowerCase() === color2.toLowerCase();
  }
}
