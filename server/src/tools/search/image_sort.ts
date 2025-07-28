/**
 * Image Sorting Tool
 * 
 * Core image sorting engine with relevance scoring, multi-criteria ranking,
 * and intelligent result ordering based on query requirements.
 * 
 * Input: Images array with sorting criteria and preferences
 * Output: Sorted images with relevance scores and reasoning
 * 
 * Key Methods:
 * - sortByRelevance(images, criteria): Sort images by relevance to criteria
 * - calculateScores(images, criteria): Calculate relevance scores
 * - rankBySimilarity(images, reference): Rank by similarity to reference
 * - sortByTemporal(images, order): Sort by temporal patterns
 * - sortByQuality(images): Sort by technical/aesthetic quality
 * - sortBySemantic(images, concept): Sort by semantic relevance
 * - mergeMultiCriteria(scores): Merge multiple scoring criteria
 */


import { SortedImageResult, ChainInput, ChainOutput } from '../../types/sorting.js';

export interface SortingCriteria {
  type: SortType;
  direction: 'asc' | 'desc';
  weight: number;
  parameters?: any;
}

export interface SortingConfig {
  criteria?: SortingCriteria[];
  maxResults?: number;
  qualityThreshold?: number;
  diversityFactor?: number;
  boostRecent?: boolean;
  preserveGroups?: boolean;
}

export interface RelevanceScore {
  imageId: string;
  totalScore: number;
  componentScores: {
    content?: number;
    temporal?: number;
    quality?: number;
    similarity?: number;
    semantic?: number;
    custom?: number;
  };
  reasoning: string;
  confidence: number;
}

export enum SortType {
  CONTENT_SIMILARITY = 'content_similarity',
  TEMPORAL_RELEVANCE = 'temporal_relevance',
  QUALITY_SCORE = 'quality_score',
  SEMANTIC_MATCH = 'semantic_match',
  VISUAL_SIMILARITY = 'visual_similarity',
  PEOPLE_RELEVANCE = 'people_relevance',
  LOCATION_RELEVANCE = 'location_relevance',
  EMOTION_RELEVANCE = 'emotion_relevance',
  CUSTOM_CRITERIA = 'custom_criteria'
}

export interface SimilarityConfig {
  referenceImages?: any[];
  referenceEmbeddings?: number[][];
  threshold?: number;
  useVisualFeatures?: boolean;
  useSemanticFeatures?: boolean;
  useMetadata?: boolean;
}

export interface TemporalConfig {
  sortOrder: 'chronological' | 'reverse_chronological' | 'relevance_to_date';
  referenceDate?: Date;
  groupByPeriod?: 'day' | 'week' | 'month' | 'year' | 'event';
  boostRecent?: boolean;
}

export interface QualityConfig {
  technical: {
    resolution: number;
    sharpness: number;
    exposure: number;
    composition: number;
  };
  aesthetic: {
    colorHarmony: number;
    composition: number;
    subject: number;
    lighting: number;
  };
  contextual: {
    uniqueness: number;
    relevance: number;
    completeness: number;
  };
}

export class ImageSortingTool {
  private embeddingService: any; // Will be injected
  private qualityAnalyzer: any; // Will be injected
  private similarityEngine: any; // Will be injected
  
  constructor(dependencies: {
    embeddingService: any;
    qualityAnalyzer: any;
    similarityEngine: any;
  }) {
    this.embeddingService = dependencies.embeddingService;
    this.qualityAnalyzer = dependencies.qualityAnalyzer;
    this.similarityEngine = dependencies.similarityEngine;
  }

  /**
   * Sort images by relevance to specified criteria
   */
  async sortByRelevance(
    images: any[],
    criteria: SortingCriteria[],
    config: SortingConfig = {}
  ): Promise<SortedImageResult[]> {
    if (images.length === 0) return [];
    
    try {
      // Validate sorting configuration
      const validation = this.validateSortingConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid sorting config: ${validation.errors.join(', ')}`);
      }
      
      // Calculate scores for all images
      const relevanceScores = await this.calculateScores(images, criteria);
      
      // Merge scores based on criteria weights
      const finalScores = this.mergeMultiCriteria(
        new Map([['relevance', relevanceScores]]),
        { relevance: 1.0 }
      );
      
      // Sort by total score
      finalScores.sort((a, b) => b.totalScore - a.totalScore);
      
      // Apply diversity filtering if enabled
      const diversifiedScores = config.diversityFactor 
        ? this.applyDiversityFiltering(
            finalScores.map(score => this.convertToSortedResult(score, images)),
            config.diversityFactor
          )
        : finalScores.map(score => this.convertToSortedResult(score, images));
      
      // Apply result limits
      const maxResults = config.maxResults || images.length;
      const limitedResults = diversifiedScores.slice(0, maxResults);
      
      // Apply quality threshold if specified
      if (config.qualityThreshold) {
        return limitedResults.filter(result => 
          result.sortScore >= config.qualityThreshold!
        );
      }
      
      return limitedResults;
      
    } catch (error) {
      throw new Error(`Image sorting failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate comprehensive relevance scores
   */
  async calculateScores(
    images: any[],
    criteria: SortingCriteria[]
  ): Promise<RelevanceScore[]> {
    const scores: RelevanceScore[] = [];
    
    for (const image of images) {
      const componentScores: RelevanceScore['componentScores'] = {};
      let totalScore = 0;
      let totalWeight = 0;
      
      // Calculate score for each criterion
      for (const criterion of criteria) {
        let score = 0;
        
        switch (criterion.type) {
          case SortType.CONTENT_SIMILARITY:
            score = await this.calculateContentSimilarity(image, criterion);
            componentScores.content = score;
            break;
          case SortType.TEMPORAL_RELEVANCE:
            score = this.calculateTemporalRelevance(image, criterion);
            componentScores.temporal = score;
            break;
          case SortType.QUALITY_SCORE:
            score = await this.calculateQualityScore(image, criterion);
            componentScores.quality = score;
            break;
          case SortType.SEMANTIC_MATCH:
            score = await this.calculateSemanticSimilarity(
              image, 
              criterion.parameters?.concept || ''
            );
            componentScores.semantic = score;
            break;
          case SortType.VISUAL_SIMILARITY:
            score = await this.calculateVisualSimilarity(
              image,
              criterion.parameters?.referenceImages || []
            );
            componentScores.similarity = score;
            break;
          default:
            score = 0.5; // Default neutral score
            componentScores.custom = score;
        }
        
        // Apply weight and direction
        const weightedScore = score * criterion.weight;
        const directedScore = criterion.direction === 'desc' ? weightedScore : (1 - weightedScore);
        
        totalScore += directedScore;
        totalWeight += criterion.weight;
      }
      
      // Normalize total score
      const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
      
      scores.push({
        imageId: image.id,
        totalScore: Math.max(0, Math.min(1, normalizedScore)),
        componentScores,
        reasoning: this.generateSortReasoning(image, {
          imageId: image.id,
          totalScore: normalizedScore,
          componentScores,
          reasoning: '',
          confidence: 0.8
        }, criteria),
        confidence: this.calculateScoreConfidence(componentScores, criteria)
      });
    }
    
    return scores;
  }

  /**
   * Rank images by similarity to reference images
   */
  async rankBySimilarity(
    images: any[],
    config: SimilarityConfig
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.rankBySimilarity not implemented');
  }

  /**
   * Sort images by temporal patterns
   */
  async sortByTemporal(
    images: any[],
    config: TemporalConfig
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.sortByTemporal not implemented');
  }

  /**
   * Sort images by quality metrics
   */
  async sortByQuality(
    images: any[],
    config: QualityConfig
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.sortByQuality not implemented');
  }

  /**
   * Sort images by semantic relevance to concept
   */
  async sortBySemantic(
    images: any[],
    concept: string,
    threshold: number = 0.7
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.sortBySemantic not implemented');
  }

  /**
   * Sort images by people relevance
   */
  async sortByPeople(
    images: any[],
    peopleQuery: string
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.sortByPeople not implemented');
  }

  /**
   * Sort images by location relevance
   */
  async sortByLocation(
    images: any[],
    locationQuery: string
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.sortByLocation not implemented');
  }

  /**
   * Sort images by emotion/mood relevance
   */
  async sortByEmotion(
    images: any[],
    emotionQuery: string
  ): Promise<SortedImageResult[]> {
    // Implementation placeholder
    throw new Error('ImageSortingTool.sortByEmotion not implemented');
  }

  /**
   * Merge multiple scoring criteria with weights
   */
  mergeMultiCriteria(
    scores: Map<string, RelevanceScore[]>,
    weights: Record<string, number>
  ): RelevanceScore[] {
    // Implementation placeholder
    throw new Error('ImageSortingTool.mergeMultiCriteria not implemented');
  }

  /**
   * Apply diversity factor to avoid similar results
   */
  applyDiversityFiltering(
    sortedResults: SortedImageResult[],
    diversityFactor: number
  ): SortedImageResult[] {
    // Implementation placeholder
    throw new Error('ImageSortingTool.applyDiversityFiltering not implemented');
  }

  /**
   * Calculate content similarity score
   */
  private async calculateContentSimilarity(
    image: any,
    criteria: SortingCriteria
  ): Promise<number> {
    try {
      // Use embedding similarity if available
      if (image.embedding && criteria.parameters?.targetEmbedding) {
        return this.cosineSimilarity(image.embedding, criteria.parameters.targetEmbedding);
      }
      
      // Use labels/tags similarity
      if (image.metadata?.Labels && criteria.parameters?.targetLabels) {
        const imageLabels = image.metadata.Labels.map((l: any) => l.Name.toLowerCase());
        const targetLabels = criteria.parameters.targetLabels.map((l: string) => l.toLowerCase());
        
        const intersection = imageLabels.filter((label: string) => targetLabels.includes(label));
        const union = new Set([...imageLabels, ...targetLabels]);
        
        return intersection.length / union.size; // Jaccard similarity
      }
      
      // Use text similarity for captions/descriptions
      if (image.caption && criteria.parameters?.targetText) {
        return this.textSimilarity(image.caption, criteria.parameters.targetText);
      }
      
      // Default to metadata-based similarity
      return this.metadataSimilarity(image, criteria.parameters);
      
    } catch (error) {
      console.warn(`Content similarity calculation failed for ${image.id}:`, error);
      return 0.5; // Neutral score on error
    }
  }

  /**
   * Calculate temporal relevance score
   */
  private calculateTemporalRelevance(
    image: any,
    criteria: SortingCriteria
  ): number {
    try {
      const imageDate = new Date(image.created_at);
      const referenceDate = criteria.parameters?.referenceDate 
        ? new Date(criteria.parameters.referenceDate)
        : new Date();
      
      const timeDiff = Math.abs(imageDate.getTime() - referenceDate.getTime());
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      
      // Score based on recency - more recent = higher score
      if (criteria.parameters?.temporalMode === 'recency') {
        return Math.max(0, 1 - (daysDiff / 365)); // Decay over a year
      }
      
      // Score based on proximity to reference date
      if (criteria.parameters?.temporalMode === 'proximity') {
        const maxDays = criteria.parameters?.maxDays || 30;
        return Math.max(0, 1 - (daysDiff / maxDays));
      }
      
      // Default: linear decay over time
      return Math.max(0, 1 - (daysDiff / 365));
      
    } catch (error) {
      console.warn(`Temporal relevance calculation failed for ${image.id}:`, error);
      return 0.5;
    }
  }

  /**
   * Calculate quality score
   */
  private async calculateQualityScore(
    image: any,
    criteria: SortingCriteria
  ): Promise<number> {
    try {
      let qualityScore = 0;
      let componentCount = 0;
      
      // Technical quality metrics
      if (image.metadata?.EXIF) {
        const exif = image.metadata.EXIF;
        
        // Resolution score
        if (exif.PixelXDimension && exif.PixelYDimension) {
          const megapixels = (exif.PixelXDimension * exif.PixelYDimension) / 1000000;
          qualityScore += Math.min(megapixels / 20, 1); // Normalize to 20MP max
          componentCount++;
        }
        
        // ISO score (lower is better)
        if (exif.ISO) {
          const isoScore = Math.max(0, 1 - (exif.ISO / 6400)); // 6400 ISO as threshold
          qualityScore += isoScore;
          componentCount++;
        }
        
        // Aperture score (wider aperture often better for portraits)
        if (exif.FNumber) {
          const apertureScore = criteria.parameters?.preferWideAperture
            ? Math.max(0, 1 - (exif.FNumber / 8)) // Lower f-number = higher score
            : 0.5; // Neutral if no preference
          qualityScore += apertureScore;
          componentCount++;
        }
      }
      
      // Content quality from vision analysis
      if (image.metadata?.Labels) {
        const qualityLabels = ['Sharp', 'Clear', 'Bright', 'Colorful', 'Good Lighting'];
        const foundQualityLabels = image.metadata.Labels.filter((l: any) => 
          qualityLabels.includes(l.Name) && l.Confidence > 80
        );
        qualityScore += foundQualityLabels.length / qualityLabels.length;
        componentCount++;
      }
      
      // File size as quality indicator (larger often better, but with diminishing returns)
      if (image.metadata?.fileSize) {
        const sizeMB = image.metadata.fileSize / (1024 * 1024);
        const sizeScore = Math.min(sizeMB / 10, 1); // Normalize to 10MB
        qualityScore += sizeScore;
        componentCount++;
      }
      
      // Face detection quality
      if (image.metadata?.FaceDetails?.length > 0) {
        const avgFaceConfidence = image.metadata.FaceDetails.reduce(
          (sum: number, face: any) => sum + (face.Confidence || 0), 0
        ) / image.metadata.FaceDetails.length;
        qualityScore += avgFaceConfidence / 100;
        componentCount++;
      }
      
      return componentCount > 0 ? qualityScore / componentCount : 0.5;
      
    } catch (error) {
      console.warn(`Quality score calculation failed for ${image.id}:`, error);
      return 0.5;
    }
  }

  /**
   * Calculate semantic similarity score
   */
  private async calculateSemanticSimilarity(
    image: any,
    concept: string
  ): Promise<number> {
    try {
      // Use embedding service if available
      if (this.embeddingService && image.embedding) {
        const conceptEmbedding = await this.embeddingService.generateTextEmbedding(concept);
        return this.cosineSimilarity(image.embedding, conceptEmbedding);
      }
      
      // Fallback to text-based matching
      const searchText = concept.toLowerCase();
      let score = 0;
      let matches = 0;
      
      // Check image caption/description
      if (image.caption) {
        score += this.textSimilarity(image.caption.toLowerCase(), searchText);
        matches++;
      }
      
      // Check metadata labels
      if (image.metadata?.Labels) {
        const labelText = image.metadata.Labels
          .map((l: any) => l.Name.toLowerCase())
          .join(' ');
        score += this.textSimilarity(labelText, searchText);
        matches++;
      }
      
      // Check virtual tags
      if (image.virtualTags && Array.isArray(image.virtualTags)) {
        const tagsText = image.virtualTags.join(' ').toLowerCase();
        score += this.textSimilarity(tagsText, searchText);
        matches++;
      }
      
      return matches > 0 ? score / matches : 0;
      
    } catch (error) {
      console.warn(`Semantic similarity calculation failed for ${image.id}:`, error);
      return 0;
    }
  }

  /**
   * Calculate visual similarity score
   */
  private async calculateVisualSimilarity(
    image: any,
    referenceImages: any[]
  ): Promise<number> {
    try {
      if (!referenceImages || referenceImages.length === 0) {
        return 0.5; // Neutral score if no references
      }
      
      // Use embeddings if available
      if (image.embedding && this.embeddingService) {
        let maxSimilarity = 0;
        
        for (const refImage of referenceImages) {
          if (refImage.embedding) {
            const similarity = this.cosineSimilarity(image.embedding, refImage.embedding);
            maxSimilarity = Math.max(maxSimilarity, similarity);
          }
        }
        
        return maxSimilarity;
      }
      
      // Fallback to metadata-based similarity
      let avgSimilarity = 0;
      let comparisons = 0;
      
      for (const refImage of referenceImages) {
        const similarity = this.visualMetadataSimilarity(image, refImage);
        avgSimilarity += similarity;
        comparisons++;
      }
      
      return comparisons > 0 ? avgSimilarity / comparisons : 0.5;
      
    } catch (error) {
      console.warn(`Visual similarity calculation failed for ${image.id}:`, error);
      return 0.5;
    }
  }

  /**
   * Helper method for cosine similarity calculation
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Helper method for text similarity
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Helper method for metadata similarity
   */
  private metadataSimilarity(image: any, targetParams: any): number {
    if (!targetParams) return 0.5;
    
    let score = 0;
    let factors = 0;
    
    // Compare image dimensions
    if (targetParams.targetWidth && image.metadata?.EXIF?.PixelXDimension) {
      const widthDiff = Math.abs(image.metadata.EXIF.PixelXDimension - targetParams.targetWidth);
      score += Math.max(0, 1 - (widthDiff / targetParams.targetWidth));
      factors++;
    }
    
    // Compare file formats
    if (targetParams.targetFormat && image.metadata?.format) {
      score += image.metadata.format.toLowerCase() === targetParams.targetFormat.toLowerCase() ? 1 : 0;
      factors++;
    }
    
    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Helper method for visual metadata similarity
   */
  private visualMetadataSimilarity(image1: any, image2: any): number {
    let score = 0;
    let factors = 0;
    
    // Compare dominant colors (if available)
    if (image1.metadata?.DominantColors && image2.metadata?.DominantColors) {
      const colors1 = new Set(image1.metadata.DominantColors.map((c: any) => c.Name));
      const colors2 = new Set(image2.metadata.DominantColors.map((c: any) => c.Name));
      const intersection = new Set([...colors1].filter(x => colors2.has(x)));
      const union = new Set([...colors1, ...colors2]);
      score += union.size > 0 ? intersection.size / union.size : 0;
      factors++;
    }
    
    // Compare labels
    if (image1.metadata?.Labels && image2.metadata?.Labels) {
      const labels1 = new Set(image1.metadata.Labels.map((l: any) => l.Name.toLowerCase()));
      const labels2 = new Set(image2.metadata.Labels.map((l: any) => l.Name.toLowerCase()));
      const intersection = new Set([...labels1].filter(x => labels2.has(x)));
      const union = new Set([...labels1, ...labels2]);
      score += union.size > 0 ? intersection.size / union.size : 0;
      factors++;
    }
    
    // Compare face count
    const faceCount1 = image1.metadata?.FaceDetails?.length || 0;
    const faceCount2 = image2.metadata?.FaceDetails?.length || 0;
    if (faceCount1 > 0 || faceCount2 > 0) {
      const maxFaces = Math.max(faceCount1, faceCount2);
      score += 1 - (Math.abs(faceCount1 - faceCount2) / maxFaces);
      factors++;
    }
    
    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Convert relevance score to sorted result
   */
  private convertToSortedResult(score: RelevanceScore, images: any[]): SortedImageResult {
    const image = images.find(img => img.id === score.imageId);
    if (!image) {
      throw new Error(`Image with ID ${score.imageId} not found`);
    }
    
    return {
      image,
      sortScore: score.totalScore,
      reasoning: score.reasoning,
      position: 0, // Will be set later
      metadata: {
        componentScores: score.componentScores,
        confidence: score.confidence,
        sortingMethod: 'relevance_based'
      }
    };
  }

  /**
   * Calculate score confidence based on available data
   */
  private calculateScoreConfidence(
    componentScores: RelevanceScore['componentScores'],
    criteria: SortingCriteria[]
  ): number {
    let totalWeight = 0;
    let availableWeight = 0;
    
    for (const criterion of criteria) {
      totalWeight += criterion.weight;
      
      // Check if we have data for this criterion
      const hasData = this.hasDataForCriterion(criterion.type, componentScores);
      if (hasData) {
        availableWeight += criterion.weight;
      }
    }
    
    // Confidence is the ratio of available data to total criteria weight
    return totalWeight > 0 ? availableWeight / totalWeight : 0.5;
  }

  /**
   * Check if we have data for a specific criterion
   */
  private hasDataForCriterion(
    type: SortType,
    componentScores: RelevanceScore['componentScores']
  ): boolean {
    switch (type) {
      case SortType.CONTENT_SIMILARITY:
        return componentScores.content !== undefined;
      case SortType.TEMPORAL_RELEVANCE:
        return componentScores.temporal !== undefined;
      case SortType.QUALITY_SCORE:
        return componentScores.quality !== undefined;
      case SortType.SEMANTIC_MATCH:
        return componentScores.semantic !== undefined;
      case SortType.VISUAL_SIMILARITY:
        return componentScores.similarity !== undefined;
      default:
        return componentScores.custom !== undefined;
    }
  }

  /**
   * Normalize scores across different criteria
   */
  private normalizeScores(scores: number[]): number[] {
    if (scores.length === 0) return [];
    
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;
    
    if (range === 0) {
      // All scores are the same
      return scores.map(() => 0.5);
    }
    
    return scores.map(score => (score - min) / range);
  }

  /**
   * Generate reasoning for sort decision
   */
  private generateSortReasoning(
    image: any,
    score: RelevanceScore,
    criteria: SortingCriteria[]
  ): string {
    const reasoningParts: string[] = [];
    
    // Add overall score
    reasoningParts.push(`Overall relevance: ${(score.totalScore * 100).toFixed(1)}%`);
    
    // Add component explanations
    for (const criterion of criteria) {
      const component = this.getComponentForCriterion(criterion.type, score.componentScores);
      if (component !== undefined) {
        const percentage = (component * 100).toFixed(1);
        const criterionName = this.getCriterionDisplayName(criterion.type);
        reasoningParts.push(`${criterionName}: ${percentage}%`);
      }
    }
    
    // Add confidence note
    if (score.confidence < 0.7) {
      reasoningParts.push(`Note: Lower confidence due to limited metadata`);
    }
    
    return reasoningParts.join('; ');
  }

  /**
   * Get component score for criterion type
   */
  private getComponentForCriterion(
    type: SortType,
    componentScores: RelevanceScore['componentScores']
  ): number | undefined {
    switch (type) {
      case SortType.CONTENT_SIMILARITY:
        return componentScores.content;
      case SortType.TEMPORAL_RELEVANCE:
        return componentScores.temporal;
      case SortType.QUALITY_SCORE:
        return componentScores.quality;
      case SortType.SEMANTIC_MATCH:
        return componentScores.semantic;
      case SortType.VISUAL_SIMILARITY:
        return componentScores.similarity;
      default:
        return componentScores.custom;
    }
  }

  /**
   * Get display name for criterion type
   */
  private getCriterionDisplayName(type: SortType): string {
    switch (type) {
      case SortType.CONTENT_SIMILARITY:
        return 'Content match';
      case SortType.TEMPORAL_RELEVANCE:
        return 'Time relevance';
      case SortType.QUALITY_SCORE:
        return 'Image quality';
      case SortType.SEMANTIC_MATCH:
        return 'Semantic match';
      case SortType.VISUAL_SIMILARITY:
        return 'Visual similarity';
      case SortType.PEOPLE_RELEVANCE:
        return 'People match';
      case SortType.LOCATION_RELEVANCE:
        return 'Location match';
      case SortType.EMOTION_RELEVANCE:
        return 'Emotion match';
      default:
        return 'Custom criteria';
    }
  }

  /**
   * Validate sorting configuration
   */
  private validateSortingConfig(config: SortingConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate criteria
    if (!config.criteria || config.criteria.length === 0) {
      errors.push('At least one sorting criterion is required');
    } else {
      for (let i = 0; i < config.criteria.length; i++) {
        const criterion = config.criteria[i];
        
        if (criterion.weight <= 0 || criterion.weight > 1) {
          errors.push(`Criterion ${i}: weight must be between 0 and 1`);
        }
        
        if (!Object.values(SortType).includes(criterion.type)) {
          errors.push(`Criterion ${i}: invalid sort type ${criterion.type}`);
        }
        
        if (criterion.direction !== 'asc' && criterion.direction !== 'desc') {
          errors.push(`Criterion ${i}: direction must be 'asc' or 'desc'`);
        }
      }
    }
    
    // Validate numeric ranges
    if (config.maxResults !== undefined && config.maxResults <= 0) {
      errors.push('maxResults must be positive');
    }
    
    if (config.qualityThreshold !== undefined && 
        (config.qualityThreshold < 0 || config.qualityThreshold > 1)) {
      errors.push('qualityThreshold must be between 0 and 1');
    }
    
    if (config.diversityFactor !== undefined && 
        (config.diversityFactor < 0 || config.diversityFactor > 1)) {
      errors.push('diversityFactor must be between 0 and 1');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Health check for sorting tool
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic sorting functionality
      const testImages = [
        { id: 'test1', created_at: new Date().toISOString() },
        { id: 'test2', created_at: new Date().toISOString() }
      ];
      
      const criteria: SortingCriteria[] = [{
        type: SortType.TEMPORAL_RELEVANCE,
        direction: 'desc',
        weight: 1.0
      }];
      
      const result = await this.sortByRelevance(testImages, criteria);
      return Array.isArray(result);
    } catch (error) {
      console.error('Image sorting tool health check failed:', error);
      return false;
    }
  }
}

export const SortingUtils = {
  /**
   * Create default sorting criteria for common use cases
   */
  createDefaultCriteria: (sortType: SortType): SortingCriteria => ({
    type: sortType,
    direction: 'desc',
    weight: 1.0
  }),

  /**
   * Merge sorting configurations
   */
  mergeSortingConfigs: (configs: SortingConfig[]): SortingConfig => {
    // Implementation placeholder
    throw new Error('SortingUtils.mergeSortingConfigs not implemented');
  },

  /**
   * Validate sorting criteria
   */
  validateCriteria: (criteria: SortingCriteria[]): boolean => {
    return criteria.every(c => c.weight > 0 && c.weight <= 1);
  }
};
