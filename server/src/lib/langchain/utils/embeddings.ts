/**
 * Embedding Service for Vector Operations
 * 
 * Handles all embedding generation and vector similarity operations for image sorting.
 * Uses OpenAI's text-embedding-3-small model for cost-effective, high-quality embeddings.
 * 
 * Input: Text queries, image descriptions, metadata
 * Output: 384-dimensional vectors for pgvector storage and similarity search
 * 
 * Key Features:
 * - Batch embedding generation for efficiency
 * - Vector similarity search with pgvector integration
 * - Embedding caching to reduce API costs
 * - Smart text preprocessing for better embedding quality
 * - Fallback mechanisms for API failures
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { VirtualImage, EmbeddingQuery, VectorSearchResult } from '../../../types/sorting.js';
import { VirtualImageQueries } from '../../supabase/queries.js';
import { supabaseService } from '../../supabase/client.js';

export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;
  private cache: Map<string, number[]> = new Map();

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small', // 384 dimensions, cost-effective
      maxConcurrency: 5,
      maxRetries: 3
    });
  }

  /**
   * Generate embedding for a single text query
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      // Check cache first
      const cacheKey = `query:${query}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      // Preprocess query for better embeddings
      const processedQuery = this.preprocessText(query);
      
      const embedding = await this.embeddings.embedQuery(processedQuery);
      
      // Cache the result
      this.cache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      console.error('Error generating query embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate embeddings for multiple images in batch
   */
  async generateImageEmbeddings(images: VirtualImage[]): Promise<Map<string, number[]>> {
    try {
      const imagesToProcess = images.filter(img => !img.embedding);
      
      if (imagesToProcess.length === 0) {
        // Return existing embeddings
        return new Map(
          images
            .filter(img => img.embedding)
            .map(img => [img.id, img.embedding!])
        );
      }

      // Create text representations for embedding
      const textRepresentations = imagesToProcess.map(img => 
        this.createImageTextRepresentation(img)
      );

      // Generate embeddings in batch
      const embeddings = await this.embeddings.embedDocuments(textRepresentations);
      
      // Create result map
      const embeddingMap = new Map<string, number[]>();
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        const imageId = imagesToProcess[i].id;
        const embedding = embeddings[i];
        
        embeddingMap.set(imageId, embedding);
        
        // Update database with new embedding
        await VirtualImageQueries.updateEmbedding(
          imageId,
          embedding,
          imagesToProcess[i].user_id
        );
      }

      // Add existing embeddings to map
      images
        .filter(img => img.embedding)
        .forEach(img => embeddingMap.set(img.id, img.embedding!));

      return embeddingMap;
    } catch (error) {
      console.error('Error generating image embeddings:', error);
      throw new Error(`Failed to generate image embeddings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform vector similarity search
   */
  async vectorSimilaritySearch(
    queryEmbedding: number[],
    userId: string,
    options: {
      limit?: number;
      threshold?: number;
      albumId?: string;
      excludeIds?: string[];
    } = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const { limit = 20, threshold = 0.5, albumId, excludeIds } = options;

      // Use the pre-built query from VirtualImageQueries
      let results = await VirtualImageQueries.vectorSimilaritySearch(
        userId,
        queryEmbedding,
        { limit, threshold, albumId }
      );

      // Filter out excluded IDs
      if (excludeIds && excludeIds.length > 0) {
        results = results.filter(result => !excludeIds.includes(result.id));
      }

      // Transform to VectorSearchResult format
      return results.map(result => ({
        image: result as VirtualImage,
        similarity: result.similarity || 0,
        distance: 1 - (result.similarity || 0) // Convert similarity to distance
      }));
    } catch (error) {
      console.error('Error in vector similarity search:', error);
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find semantically similar images to a reference image
   */
  async findSimilarImages(
    referenceImage: VirtualImage,
    userId: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<VectorSearchResult[]> {
    if (!referenceImage.embedding) {
      // Generate embedding for reference image if missing
      const embeddingMap = await this.generateImageEmbeddings([referenceImage]);
      referenceImage.embedding = embeddingMap.get(referenceImage.id) || null;
    }

    if (!referenceImage.embedding) {
      throw new Error('Could not generate embedding for reference image');
    }

    return await this.vectorSimilaritySearch(
      referenceImage.embedding,
      userId,
      {
        ...options,
        excludeIds: [referenceImage.id] // Don't include the reference image itself
      }
    );
  }

  /**
   * Compute semantic diversity score for a set of images
   */
  async computeDiversityScore(images: VirtualImage[]): Promise<number> {
    try {
      if (images.length < 2) return 1.0;

      // Ensure all images have embeddings
      const embeddingMap = await this.generateImageEmbeddings(images);
      
      let totalDistance = 0;
      let comparisons = 0;

      // Calculate pairwise distances
      for (let i = 0; i < images.length; i++) {
        for (let j = i + 1; j < images.length; j++) {
          const embedding1 = embeddingMap.get(images[i].id);
          const embedding2 = embeddingMap.get(images[j].id);
          
          if (embedding1 && embedding2) {
            const distance = this.cosineSimilarity(embedding1, embedding2);
            totalDistance += distance;
            comparisons++;
          }
        }
      }

      // Return average diversity (higher = more diverse)
      return comparisons > 0 ? totalDistance / comparisons : 0;
    } catch (error) {
      console.error('Error computing diversity score:', error);
      return 0;
    }
  }

  /**
   * Create text representation of image for embedding
   */
  private createImageTextRepresentation(image: VirtualImage): string {
    const parts: string[] = [];

    // Add virtual name if available
    if (image.virtual_name) {
      parts.push(`Title: ${image.virtual_name}`);
    }

    // Add description
    if (image.virtual_description) {
      parts.push(`Description: ${image.virtual_description}`);
    }

    // Add caption from vision analysis
    if (image.caption) {
      parts.push(`Content: ${image.caption}`);
    }

    // Add vision summary
    if (image.vision_summary) {
      parts.push(`Analysis: ${image.vision_summary}`);
    }

    // Add tags
    if (image.virtual_tags && image.virtual_tags.length > 0) {
      parts.push(`Tags: ${image.virtual_tags.join(', ')}`);
    }

    // Add metadata insights
    if (image.metadata) {
      const insights = this.extractMetadataInsights(image.metadata);
      if (insights) {
        parts.push(`Features: ${insights}`);
      }
    }

    // Fallback to filename if no other content
    if (parts.length === 0) {
      parts.push(`Image: ${image.original_name}`);
    }

    return parts.join('. ');
  }

  /**
   * Extract meaningful insights from image metadata
   */
  private extractMetadataInsights(metadata: Record<string, any>): string {
    const insights: string[] = [];

    // Extract from Rekognition labels
    if (metadata.Labels) {
      const topLabels = metadata.Labels
        .filter((label: any) => label.Confidence > 80)
        .slice(0, 5)
        .map((label: any) => label.Name);
      
      if (topLabels.length > 0) {
        insights.push(`contains ${topLabels.join(', ')}`);
      }
    }

    // Extract scene information
    if (metadata.SceneLabels) {
      const scenes = metadata.SceneLabels
        .filter((scene: any) => scene.Confidence > 70)
        .map((scene: any) => scene.Name);
      
      if (scenes.length > 0) {
        insights.push(`scene: ${scenes.join(', ')}`);
      }
    }

    // Extract text if present
    if (metadata.TextDetections && metadata.TextDetections.length > 0) {
      insights.push('contains text');
    }

    return insights.join(', ');
  }

  /**
   * Preprocess text for better embedding quality
   */
  private preprocessText(text: string): string {
    // Clean and normalize text
    return text
      .trim()
      .toLowerCase()
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Expand common abbreviations for image sorting
      .replace(/\bpic\b/g, 'picture')
      .replace(/\bimg\b/g, 'image')
      .replace(/\bphoto\b/g, 'photograph')
      // Add context for better sorting
      .replace(/^/, 'Sort images by: ');
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

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
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    // Simple cache stats (in production, implement proper hit rate tracking)
    return {
      size: this.cache.size,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }

  /**
   * Health check for embedding service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test with a simple query
      await this.generateQueryEmbedding('test');
      return true;
    } catch (error) {
      console.error('Embedding service health check failed:', error);
      return false;
    }
  }
}
