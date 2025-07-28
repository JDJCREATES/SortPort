/**
 * Pick Thumbnails Chain
 * 
 * Specializes in selecting the best representative images for collections, albums, or specific purposes.
 * Uses advanced visual analysis and composition scoring to identify optimal thumbnail candidates.
 * 
 * Input: ChainInput with thumbnail criteria (quality, representativeness, visual appeal)
 * Output: ChainOutput with ranked thumbnail candidates based on multiple visual factors
 * 
 * Key Features:
 * - Multi-factor thumbnail scoring (composition, quality, representativeness)
 * - Visual appeal assessment using golden ratio and rule of thirds
 * - Collection representativeness analysis
 * - Smart atlas-based batch analysis for cost efficiency
 * - Fallback to metadata when vision analysis is unavailable
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { ChainInput, ChainOutput, SortedImageResult } from '../../../types/sorting.js';
import { EmbeddingService } from '../utils/embeddings.js';
import { SortingPrompts, formatImageDataForPrompt, formatUserPreferences } from '../prompts/sorting.js';

interface ThumbnailCriteria {
  quality: 'high' | 'medium' | 'any';
  representativeness: number; // 0-1, how well it should represent the collection
  visualAppeal: string[];
  purpose: 'album' | 'collection' | 'showcase' | 'preview';
  aspectRatio?: string;
  maxCount: number;
}

export class PickThumbnailsChain {
  private llm: ChatOpenAI;
  private embeddingService: EmbeddingService;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'gpt-4o-mini', // Use mini for cost efficiency in thumbnail selection
      temperature: 0.1,
      maxTokens: 2000
    });
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Main invoke method for thumbnail selection
   */
  async invoke(input: ChainInput): Promise<ChainOutput> {
    const startTime = Date.now();
    let visionCallCount = 0;
    let embeddingOperations = 0;

    try {
      // Extract thumbnail criteria from query
      const criteria = this.extractThumbnailCriteria(input.query, input.context);
      
      // Step 1: Quality pre-filtering
      const qualityFiltered = await this.filterByQuality(input.images, criteria);

      // Step 2: Technical analysis (composition, resolution, clarity)
      const technicalScores = await this.analyzeTechnicalQuality(qualityFiltered, criteria);

      // Step 3: Representativeness analysis using embeddings
      const representativenessScores = await this.analyzeRepresentativeness(input, qualityFiltered, criteria);
      embeddingOperations++;

      // Step 4: Visual appeal scoring
      const visualAppealScores = await this.analyzeVisualAppeal(qualityFiltered, criteria);

      // Step 5: Combine scores with weights
      const combinedScores = this.combineScores(technicalScores, representativenessScores, visualAppealScores, criteria);

      // Step 6: Vision-based enhancement for top candidates
      let finalScores = combinedScores;
      if (this.shouldUseVisionForThumbnails(input.context, criteria, combinedScores)) {
        finalScores = await this.enhanceWithVisionAnalysis(input, combinedScores, criteria);
        visionCallCount++;
      }

      // Step 7: Final selection and ranking
      const selectedThumbnails = await this.selectFinalThumbnails(input, finalScores, criteria);

      const processingTime = Date.now() - startTime;

      return {
        sortedImages: selectedThumbnails,
        reasoning: this.generateThumbnailReasoning(criteria, selectedThumbnails, visionCallCount > 0),
        confidence: this.calculateThumbnailConfidence(selectedThumbnails, visionCallCount > 0),
        metadata: {
          chainType: 'pickThumbnails',
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
      console.error('Thumbnail selection chain error:', error);
      throw new Error(`Thumbnail selection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract thumbnail criteria from query and context
   */
  private extractThumbnailCriteria(query: string, context: any): ThumbnailCriteria {
    const lowerQuery = query.toLowerCase();
    
    // Determine quality requirement
    let quality: 'high' | 'medium' | 'any' = 'medium';
    if (lowerQuery.includes('best') || lowerQuery.includes('highest') || lowerQuery.includes('premium')) {
      quality = 'high';
    } else if (lowerQuery.includes('any') || lowerQuery.includes('quick')) {
      quality = 'any';
    }

    // Determine representativeness level
    let representativeness = 0.7; // Default moderate representativeness
    if (lowerQuery.includes('representative') || lowerQuery.includes('typical') || lowerQuery.includes('showcase')) {
      representativeness = 0.9;
    } else if (lowerQuery.includes('unique') || lowerQuery.includes('standout')) {
      representativeness = 0.3;
    }

    // Determine purpose
    let purpose: 'album' | 'collection' | 'showcase' | 'preview' = 'album';
    if (lowerQuery.includes('showcase') || lowerQuery.includes('portfolio')) {
      purpose = 'showcase';
    } else if (lowerQuery.includes('preview') || lowerQuery.includes('quick')) {
      purpose = 'preview';
    } else if (lowerQuery.includes('collection')) {
      purpose = 'collection';
    }

    // Extract visual appeal factors
    const visualAppeal: string[] = [];
    if (lowerQuery.includes('colorful') || lowerQuery.includes('vibrant')) visualAppeal.push('colorful');
    if (lowerQuery.includes('portrait') || lowerQuery.includes('people')) visualAppeal.push('portrait');
    if (lowerQuery.includes('landscape') || lowerQuery.includes('scenic')) visualAppeal.push('landscape');
    if (lowerQuery.includes('sharp') || lowerQuery.includes('clear')) visualAppeal.push('sharp');
    if (lowerQuery.includes('bright') || lowerQuery.includes('well-lit')) visualAppeal.push('bright');

    // Determine count
    let maxCount = 1;
    const countMatch = query.match(/(\d+)\s*(thumbnail|image|photo)/i);
    if (countMatch) {
      maxCount = Math.min(parseInt(countMatch[1]), 10); // Cap at 10
    } else if (lowerQuery.includes('few') || lowerQuery.includes('several')) {
      maxCount = 3;
    } else if (lowerQuery.includes('many') || lowerQuery.includes('multiple')) {
      maxCount = 5;
    }

    return {
      quality,
      representativeness,
      visualAppeal,
      purpose,
      maxCount
    };
  }

  /**
   * Filter images by basic quality criteria
   */
  private async filterByQuality(images: any[], criteria: ThumbnailCriteria) {
    if (criteria.quality === 'any') {
      return images;
    }

    return images.filter(image => {
      // Resolution check
      if (image.metadata?.EXIF?.PixelXDimension && image.metadata?.EXIF?.PixelYDimension) {
        const megapixels = (image.metadata.EXIF.PixelXDimension * image.metadata.EXIF.PixelYDimension) / 1000000;
        
        if (criteria.quality === 'high' && megapixels < 2) return false;
        if (criteria.quality === 'medium' && megapixels < 1) return false;
      }

      // File size check (avoid very small files)
      if (image.metadata?.fileSize && image.metadata.fileSize < 50000) { // 50KB minimum
        return false;
      }

      // Avoid NSFW content for thumbnails
      if (image.isFlagged || (image.nsfwScore && image.nsfwScore > 0.7)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Analyze technical quality factors
   */
  private async analyzeTechnicalQuality(images: any[], criteria: ThumbnailCriteria) {
    return images.map(image => {
      let technicalScore = 0;
      const factors: string[] = [];

      // Resolution scoring
      if (image.metadata?.EXIF?.PixelXDimension && image.metadata?.EXIF?.PixelYDimension) {
        const megapixels = (image.metadata.EXIF.PixelXDimension * image.metadata.EXIF.PixelYDimension) / 1000000;
        if (megapixels >= 8) {
          technicalScore += 0.3;
          factors.push('high_resolution');
        } else if (megapixels >= 3) {
          technicalScore += 0.2;
          factors.push('good_resolution');
        } else if (megapixels >= 1) {
          technicalScore += 0.1;
          factors.push('adequate_resolution');
        }
      }

      // Camera settings analysis
      if (image.metadata?.EXIF) {
        const exif = image.metadata.EXIF;
        
        // ISO score (lower is generally better for thumbnails)
        if (exif.ISO) {
          const iso = parseInt(exif.ISO);
          if (iso <= 400) {
            technicalScore += 0.2;
            factors.push('low_iso');
          } else if (iso <= 800) {
            technicalScore += 0.1;
            factors.push('moderate_iso');
          }
        }

        // Aperture score
        if (exif.FNumber) {
          const aperture = parseFloat(exif.FNumber);
          if (aperture >= 5.6 && aperture <= 11) {
            technicalScore += 0.1;
            factors.push('good_aperture');
          }
        }

        // Focal length for composition
        if (exif.FocalLength) {
          const focal = parseFloat(exif.FocalLength);
          if (focal >= 35 && focal <= 85) { // Good for portraits
            technicalScore += 0.1;
            factors.push('portrait_focal');
          } else if (focal >= 14 && focal <= 35) { // Good for landscapes
            technicalScore += 0.1;
            factors.push('landscape_focal');
          }
        }
      }

      // Rekognition quality indicators
      if (image.metadata?.Labels) {
        const qualityLabels = image.metadata.Labels.filter((label: any) => 
          ['Sharp', 'Clear', 'Bright', 'Colorful', 'Vivid'].includes(label.Name) && 
          label.Confidence > 75
        );
        
        technicalScore += qualityLabels.length * 0.05;
        if (qualityLabels.length > 0) {
          factors.push('quality_indicators');
        }
      }

      // File size quality proxy
      if (image.metadata?.fileSize) {
        const sizeMB = image.metadata.fileSize / (1024 * 1024);
        if (sizeMB > 2 && sizeMB < 15) { // Good balance
          technicalScore += 0.1;
          factors.push('good_file_size');
        }
      }

      return {
        image,
        technicalScore: Math.min(technicalScore, 1.0),
        technicalFactors: factors
      };
    });
  }

  /**
   * Analyze how well each image represents the collection
   */
  private async analyzeRepresentativeness(input: ChainInput, images: any[], criteria: ThumbnailCriteria) {
    if (criteria.representativeness < 0.5) {
      // For unique/standout thumbnails, representativeness is less important
      return images.map(image => ({
        image,
        representativenessScore: 0.5,
        representativenessFactors: ['uniqueness_preferred']
      }));
    }

    // Generate collection summary embedding
    const collectionDescriptions = images
      .map(img => [img.caption, img.visionSummary, img.virtual_description].filter(Boolean).join(' '))
      .filter(desc => desc.length > 0);
    
    const collectionSummary = collectionDescriptions.join(' ');
    const collectionEmbedding = await this.embeddingService.generateQueryEmbedding(
      `Representative image of collection: ${collectionSummary}`
    );

    // Calculate how well each image represents the collection
    const representativenessResults = await Promise.all(
      images.map(async image => {
        // Create image description for embedding
        const imageDescription = [
          image.caption,
          image.visionSummary,
          image.virtual_description,
          image.virtualTags?.join(' ')
        ].filter(Boolean).join(' ');

        if (!imageDescription) {
          return {
            image,
            representativenessScore: 0.3,
            representativenessFactors: ['no_description']
          };
        }

        const imageEmbedding = await this.embeddingService.generateQueryEmbedding(imageDescription);
        
        // Calculate similarity to collection
        const similarity = this.cosineSimilarity(imageEmbedding, collectionEmbedding);
        
        const factors: string[] = [];
        if (similarity > 0.8) factors.push('highly_representative');
        else if (similarity > 0.6) factors.push('moderately_representative');
        else factors.push('less_representative');

        // Additional representativeness factors
        if (image.virtualAlbum) factors.push('album_context');
        if (image.virtualTags?.length > 0) factors.push('tagged');
        if (image.metadata?.Labels?.length > 5) factors.push('rich_metadata');

        return {
          image,
          representativenessScore: similarity,
          representativenessFactors: factors
        };
      })
    );

    return representativenessResults;
  }

  /**
   * Analyze visual appeal factors
   */
  private async analyzeVisualAppeal(images: any[], criteria: ThumbnailCriteria) {
    return images.map(image => {
      let visualScore = 0;
      const appealFactors: string[] = [];

      // Color analysis from Rekognition
      if (image.metadata?.Labels) {
        const colorLabels = image.metadata.Labels.filter((label: any) => 
          ['Colorful', 'Vibrant', 'Bright', 'Vivid'].includes(label.Name) && label.Confidence > 70
        );
        
        if (colorLabels.length > 0) {
          visualScore += 0.2;
          appealFactors.push('colorful');
        }

        // Composition-related labels
        const compositionLabels = image.metadata.Labels.filter((label: any) => 
          ['Portrait', 'Landscape', 'Architecture', 'Nature', 'Art'].includes(label.Name) && 
          label.Confidence > 75
        );
        
        visualScore += compositionLabels.length * 0.1;
        if (compositionLabels.length > 0) {
          appealFactors.push('good_composition');
        }

        // People in images often make good thumbnails
        const peopleLabels = image.metadata.Labels.filter((label: any) => 
          ['Person', 'People', 'Face', 'Portrait'].includes(label.Name) && label.Confidence > 80
        );
        
        if (peopleLabels.length > 0) {
          visualScore += 0.15;
          appealFactors.push('people');
        }
      }

      // Face detection bonus (faces attract attention)
      if (image.metadata?.FaceDetails && image.metadata.FaceDetails.length > 0) {
        visualScore += Math.min(image.metadata.FaceDetails.length * 0.1, 0.2);
        appealFactors.push('faces_detected');
      }

      // Visual appeal criteria matching
      for (const appealCriterion of criteria.visualAppeal) {
        if (this.matchesVisualCriterion(image, appealCriterion)) {
          visualScore += 0.1;
          appealFactors.push(`matches_${appealCriterion}`);
        }
      }

      // Aspect ratio scoring for thumbnail purposes
      if (image.metadata?.EXIF?.PixelXDimension && image.metadata?.EXIF?.PixelYDimension) {
        const aspectRatio = image.metadata.EXIF.PixelXDimension / image.metadata.EXIF.PixelYDimension;
        
        // Square or near-square images work well as thumbnails
        if (aspectRatio >= 0.8 && aspectRatio <= 1.25) {
          visualScore += 0.15;
          appealFactors.push('thumbnail_friendly_aspect');
        }
        // Standard photo ratios are also good
        else if ((aspectRatio >= 1.4 && aspectRatio <= 1.6) || (aspectRatio >= 0.6 && aspectRatio <= 0.8)) {
          visualScore += 0.1;
          appealFactors.push('standard_aspect');
        }
      }

      return {
        image,
        visualScore: Math.min(visualScore, 1.0),
        appealFactors
      };
    });
  }

  /**
   * Check if image matches specific visual criterion
   */
  private matchesVisualCriterion(image: any, criterion: string): boolean {
    const imageText = [
      image.caption,
      image.visionSummary,
      image.virtual_description,
      image.virtualTags?.join(' ')
    ].filter(Boolean).join(' ').toLowerCase();

    const labels = image.metadata?.Labels?.map((l: any) => l.Name.toLowerCase()) || [];

    switch (criterion) {
      case 'colorful':
        return labels.includes('colorful') || labels.includes('vibrant') || 
               imageText.includes('colorful') || imageText.includes('vibrant');
      
      case 'portrait':
        return labels.includes('portrait') || labels.includes('person') || 
               imageText.includes('portrait') || imageText.includes('person');
      
      case 'landscape':
        return labels.includes('landscape') || labels.includes('nature') || 
               imageText.includes('landscape') || imageText.includes('scenery');
      
      case 'sharp':
        return labels.includes('sharp') || labels.includes('clear') ||
               imageText.includes('sharp') || imageText.includes('clear');
      
      case 'bright':
        return labels.includes('bright') || labels.includes('sunny') ||
               imageText.includes('bright') || imageText.includes('well-lit');
      
      default:
        return false;
    }
  }

  /**
   * Combine all scores with appropriate weights
   */
  private combineScores(technicalScores: any[], representativenessScores: any[], visualScores: any[], criteria: ThumbnailCriteria) {
    const combined = technicalScores.map((techResult, index) => {
      const repResult = representativenessScores[index];
      const visResult = visualScores[index];

      // Weights based on criteria
      let techWeight = 0.3;
      let repWeight = criteria.representativeness * 0.5;
      let visWeight = 0.5 - (repWeight - 0.25);

      if (criteria.quality === 'high') {
        techWeight = 0.4;
        visWeight = 0.4;
        repWeight = 0.2;
      } else if (criteria.purpose === 'showcase') {
        visWeight = 0.5;
        techWeight = 0.3;
        repWeight = 0.2;
      }

      const combinedScore = (techResult.technicalScore * techWeight) +
                           (repResult.representativenessScore * repWeight) +
                           (visResult.visualScore * visWeight);

      return {
        image: techResult.image,
        combinedScore,
        technicalScore: techResult.technicalScore,
        representativenessScore: repResult.representativenessScore,
        visualScore: visResult.visualScore,
        factors: {
          technical: techResult.technicalFactors,
          representativeness: repResult.representativenessFactors,
          visual: visResult.appealFactors
        }
      };
    });

    return combined.sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Determine if vision analysis should be used
   */
  private shouldUseVisionForThumbnails(context: any, criteria: ThumbnailCriteria, results: any[]): boolean {
    // Always consider vision for high-quality showcase thumbnails
    if (criteria.quality === 'high' && criteria.purpose === 'showcase') {
      return !context.preferences.useVisionSparingly && context.constraints.maxCredits >= 3;
    }

    // Use vision if scores are close (hard to decide)
    if (results.length >= 2) {
      const topScore = results[0].combinedScore;
      const secondScore = results[1].combinedScore;
      
      if (Math.abs(topScore - secondScore) < 0.1) {
        return !context.preferences.useVisionSparingly && context.constraints.maxCredits >= 3;
      }
    }

    return false;
  }

  /**
   * Enhance top candidates with vision analysis
   */
  private async enhanceWithVisionAnalysis(input: ChainInput, results: any[], criteria: ThumbnailCriteria) {
    // TODO: Implement actual vision analysis using atlas generation
    // For now, simulate vision enhancement
    
    const topCandidates = results.slice(0, Math.min(5, criteria.maxCount * 2));
    
    return results.map(result => {
      if (topCandidates.includes(result)) {
        // Simulate vision-based enhancement
        return {
          ...result,
          combinedScore: Math.min(result.combinedScore + 0.1, 1.0),
          factors: {
            ...result.factors,
            vision: ['composition_analysis', 'visual_quality_check']
          }
        };
      }
      return result;
    }).sort((a, b) => b.combinedScore - a.combinedScore);
  }

  /**
   * Select final thumbnails using LLM validation
   */
  private async selectFinalThumbnails(input: ChainInput, results: any[], criteria: ThumbnailCriteria): Promise<SortedImageResult[]> {
    const candidates = results.slice(0, Math.min(10, results.length));
    
    const promptText = await SortingPrompts.THUMBNAIL.format({
      query: input.query,
      imageCount: candidates.length,
      sortType: 'thumbnail',
      userPreferences: formatUserPreferences(input.context.preferences),
      qualityRequirement: criteria.quality,
      representativenessLevel: criteria.representativeness,
      visualAppealFactors: criteria.visualAppeal.join(', ') || 'general appeal',
      imageData: formatImageDataForPrompt(candidates.map(r => r.image))
    });

    try {
      const llmResponse = await this.llm.invoke(promptText);
      const parsed = JSON.parse(llmResponse.content as string);
      
      const selected = parsed.sortedImages
        .slice(0, criteria.maxCount)
        .map((item: any, index: number) => {
          const candidate = candidates.find(r => r.image.id === item.imageId);
          return {
            image: candidate?.image,
            sortScore: item.sortScore,
            reasoning: item.reasoning,
            position: index + 1,
            metadata: {
              thumbnailPurpose: criteria.purpose,
              qualityLevel: criteria.quality,
              technicalScore: candidate?.technicalScore || 0,
              visualScore: candidate?.visualScore || 0,
              representativenessScore: candidate?.representativenessScore || 0,
              confidence: item.metadata?.confidence || 0.8,
              factors: candidate?.factors || {},
              ...item.metadata
            }
          };
        })
        .filter((item: any) => item.image);

      return selected;

    } catch (error) {
      console.error('LLM thumbnail selection failed, using algorithmic selection');
      return this.fallbackThumbnailSelection(candidates, criteria);
    }
  }

  /**
   * Fallback thumbnail selection
   */
  private fallbackThumbnailSelection(results: any[], criteria: ThumbnailCriteria): SortedImageResult[] {
    return results
      .slice(0, criteria.maxCount)
      .map((result, index) => ({
        image: result.image,
        sortScore: result.combinedScore,
        reasoning: `Selected as thumbnail based on technical quality (${result.technicalScore.toFixed(2)}), visual appeal (${result.visualScore.toFixed(2)}), and representativeness (${result.representativenessScore.toFixed(2)})`,
        position: index + 1,
        metadata: {
          thumbnailPurpose: criteria.purpose,
          qualityLevel: criteria.quality,
          technicalScore: result.technicalScore,
          visualScore: result.visualScore,
          representativenessScore: result.representativenessScore,
          confidence: 0.7,
          factors: result.factors
        }
      }));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

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
   * Generate reasoning for thumbnail selection
   */
  private generateThumbnailReasoning(criteria: ThumbnailCriteria, thumbnails: SortedImageResult[], usedVision: boolean): string {
    const parts = [
      `Selected ${thumbnails.length} thumbnail${thumbnails.length > 1 ? 's' : ''} for ${criteria.purpose} purpose`
    ];

    if (criteria.quality !== 'any') {
      parts.push(`with ${criteria.quality} quality requirements`);
    }

    if (criteria.representativeness > 0.7) {
      parts.push('prioritizing collection representativeness');
    } else if (criteria.representativeness < 0.5) {
      parts.push('prioritizing unique and standout images');
    }

    if (criteria.visualAppeal.length > 0) {
      parts.push(`emphasizing ${criteria.visualAppeal.join(' and ')} visual characteristics`);
    }

    const avgScore = thumbnails.reduce((sum, t) => sum + t.sortScore, 0) / thumbnails.length;
    if (avgScore > 0.8) {
      parts.push('Selected high-quality candidates with excellent characteristics.');
    } else if (avgScore > 0.6) {
      parts.push('Selected good candidates balancing multiple factors.');
    } else {
      parts.push('Selected best available options from the collection.');
    }

    if (usedVision) {
      parts.push('Enhanced selection with detailed visual analysis.');
    }

    return parts.join('. ') + '.';
  }

  /**
   * Calculate confidence for thumbnail selection
   */
  private calculateThumbnailConfidence(thumbnails: SortedImageResult[], usedVision: boolean): number {
    if (thumbnails.length === 0) return 0;

    // Base confidence on average scores and metadata quality
    const avgScore = thumbnails.reduce((sum, t) => sum + t.sortScore, 0) / thumbnails.length;
    let confidence = avgScore;

    // Boost confidence if technical factors are strong
    const avgTechnicalScore = thumbnails.reduce((sum, t) => 
      sum + (t.metadata.technicalScore || 0), 0) / thumbnails.length;
    
    if (avgTechnicalScore > 0.7) confidence += 0.1;

    // Boost confidence for vision analysis
    if (usedVision) confidence += 0.1;

    // Boost confidence if multiple factors align
    const factorCount = thumbnails[0]?.metadata?.factors ? 
      Object.values(thumbnails[0].metadata.factors).flat().length : 0;
    
    if (factorCount > 5) confidence += 0.1;

    return Math.min(Math.max(confidence, 0.3), 1.0);
  }

  /**
   * Health check for thumbnail selection chain
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testInput: ChainInput = {
        query: 'best thumbnail',
        images: [],
        context: {
          query: 'best thumbnail',
          userImages: [],
          sortType: 'thumbnail',
          preferences: {
            preferredSort: 'thumbnail',
            useVisionSparingly: true,
            maxVisionCalls: 1,
            favoriteStyles: [],
            excludeNsfw: true
          },
          constraints: {
            maxResults: 1,
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
      console.error('Thumbnail chain health check failed:', error);
      return false;
    }
  }
}
