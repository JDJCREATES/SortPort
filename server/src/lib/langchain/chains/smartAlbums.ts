/**
 * Smart Albums Chain
 * 
 * Automatically creates intelligent album groupings based on content analysis, temporal patterns,
 * and thematic similarity. Uses advanced clustering and embedding analysis to group related images.
 * 
 * Input: ChainInput with album creation preferences and grouping strategy
 * Output: ChainOutput with suggested album groupings and metadata
 * 
 * Key Features:
 * - Multi-modal clustering (content, time, location, people)
 * - Thematic album creation based on content analysis
 * - Event detection and temporal grouping
 * - People-based album suggestions
 * - Smart naming for generated albums
 */

import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { ChainInput, ChainOutput, SortedImageResult } from '../../../types/sorting.js';
import { EmbeddingService } from '../utils/embeddings.js';
import { SortingPrompts, formatImageDataForPrompt, formatUserPreferences } from '../prompts/sorting.js';

interface AlbumGroup {
  name: string;
  description: string;
  images: any[];
  theme: string;
  confidence: number;
  reasoning: string;
  thumbnailImage?: any;
  metadata: {
    size: number;
    dateRange?: any;
    location?: string | string[];
    people?: string[] | (string | string[])[];
    tags?: string[] | string;
  };
}

interface ClusteringOptions {
  strategy: 'content' | 'temporal' | 'people' | 'location' | 'hybrid';
  minAlbumSize: number;
  maxAlbumSize: number;
  maxAlbums: number;
  allowOverlap: boolean;
}

export class SmartAlbumsChain {
  private llm: ChatOpenAI;
  private embeddingService: EmbeddingService;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0.2, // Slightly higher for creative album naming
      maxTokens: 3000
    });
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Main invoke method for smart album creation
   */
  async invoke(input: ChainInput): Promise<ChainOutput> {
    const startTime = Date.now();
    let visionCallCount = 0;
    let embeddingOperations = 0;

    try {
      // Extract album creation parameters
      const options = this.extractAlbumOptions(input.query, input.context);
      
      // Step 1: Analyze images for clustering features
      const analysisResults = await this.analyzeImagesForClustering(input.images);
      embeddingOperations++;

      // Step 2: Apply clustering strategy
      const clusters = await this.applyClustering(input, analysisResults, options);

      // Step 3: Refine clusters and create album metadata
      const refinedAlbums = await this.refineAlbumsWithMetadata(clusters, options);

      // Step 4: Generate smart album names and descriptions
      const namedAlbums = await this.generateAlbumNamesAndDescriptions(refinedAlbums);

      // Step 5: Select thumbnail images for each album
      const albumsWithThumbnails = await this.selectAlbumThumbnails(namedAlbums);

      // Step 6: Convert to sorted results format
      const sortedResults = this.convertToSortedResults(albumsWithThumbnails);

      const processingTime = Date.now() - startTime;

      return {
        sortedImages: sortedResults,
        reasoning: this.generateAlbumReasoning(albumsWithThumbnails, options),
        confidence: this.calculateAlbumConfidence(albumsWithThumbnails),
        metadata: {
          chainType: 'smartAlbums',
          processingTime,
          usedVision: visionCallCount > 0,
          visionCallCount,
          embeddingOperations,
          costBreakdown: {
            embedding: embeddingOperations * 0.1,
            vision: visionCallCount * 2.0,
            processing: 1.5, // Higher for complex clustering
            total: (embeddingOperations * 0.1) + (visionCallCount * 2.0) + 1.5
          }
        }
      };

    } catch (error) {
      console.error('Smart albums chain error:', error);
      throw new Error(`Smart album creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract album creation options from query
   */
  private extractAlbumOptions(query: string, context: any): ClusteringOptions {
    const lowerQuery = query.toLowerCase();
    
    // Determine clustering strategy
    let strategy: 'content' | 'temporal' | 'people' | 'location' | 'hybrid' = 'hybrid';
    if (lowerQuery.includes('by content') || lowerQuery.includes('by theme')) {
      strategy = 'content';
    } else if (lowerQuery.includes('by time') || lowerQuery.includes('by date') || lowerQuery.includes('events')) {
      strategy = 'temporal';
    } else if (lowerQuery.includes('by people') || lowerQuery.includes('by person')) {
      strategy = 'people';
    } else if (lowerQuery.includes('by location') || lowerQuery.includes('by place')) {
      strategy = 'location';
    }

    // Album size preferences
    let minAlbumSize = 3;
    let maxAlbumSize = 50;
    
    if (lowerQuery.includes('small') || lowerQuery.includes('few')) {
      maxAlbumSize = 20;
    } else if (lowerQuery.includes('large') || lowerQuery.includes('big')) {
      minAlbumSize = 10;
      maxAlbumSize = 100;
    }

    // Maximum number of albums
    let maxAlbums = 10;
    const albumCountMatch = query.match(/(\d+)\s*album/i);
    if (albumCountMatch) {
      maxAlbums = Math.min(parseInt(albumCountMatch[1]), 20);
    }

    return {
      strategy,
      minAlbumSize,
      maxAlbumSize,
      maxAlbums,
      allowOverlap: lowerQuery.includes('overlap') || lowerQuery.includes('flexible')
    };
  }

  /**
   * Analyze images for clustering features
   */
  private async analyzeImagesForClustering(images: any[]) {
    // Generate embeddings for all images
    const embeddingMap = await this.embeddingService.generateImageEmbeddings(images);

    return images.map(image => {
      const embedding = embeddingMap.get(image.id) || null;
      
      // Extract clustering features
      const features = {
        // Content features
        contentEmbedding: embedding,
        rekognitionLabels: this.extractLabels(image.metadata?.Labels),
        dominantColors: this.extractColors(image.metadata),
        
        // Temporal features
        timestamp: new Date(image.created_at),
        timeOfDay: this.getTimeOfDay(image.created_at),
        season: this.getSeason(image.created_at),
        
        // Location features
        gpsLocation: image.metadata?.GPS,
        locationLabels: this.extractLocationLabels(image.metadata?.Labels),
        
        // People features
        faceCount: image.metadata?.FaceDetails?.length || 0,
        peopleLabels: this.extractPeopleLabels(image.metadata?.Labels),
        
        // Quality features
        technicalQuality: this.assessTechnicalQuality(image),
        
        // Contextual features
        album: image.virtualAlbum,
        tags: image.virtualTags || [],
        description: image.virtual_description || image.caption || ''
      };

      return { image, features };
    });
  }

  /**
   * Apply clustering strategy
   */
  private async applyClustering(input: ChainInput, analysisResults: any[], options: ClusteringOptions) {
    switch (options.strategy) {
      case 'content':
        return await this.clusterByContent(analysisResults, options);
      case 'temporal':
        return await this.clusterByTime(analysisResults, options);
      case 'people':
        return await this.clusterByPeople(analysisResults, options);
      case 'location':
        return await this.clusterByLocation(analysisResults, options);
      case 'hybrid':
      default:
        return await this.clusterHybrid(analysisResults, options);
    }
  }

  /**
   * Cluster images by content similarity
   */
  private async clusterByContent(analysisResults: any[], options: ClusteringOptions) {
    const clusters: any[][] = [];
    const used = new Set();

    // K-means style clustering based on embeddings
    for (const candidate of analysisResults) {
      if (used.has(candidate.image.id) || !candidate.features.contentEmbedding) continue;

      const cluster = [candidate];
      used.add(candidate.image.id);

      // Find similar images
      for (const other of analysisResults) {
        if (used.has(other.image.id) || !other.features.contentEmbedding) continue;

        const similarity = this.cosineSimilarity(
          candidate.features.contentEmbedding,
          other.features.contentEmbedding
        );

        if (similarity > 0.7 && cluster.length < options.maxAlbumSize) {
          cluster.push(other);
          used.add(other.image.id);
        }
      }

      if (cluster.length >= options.minAlbumSize) {
        clusters.push(cluster);
      }
    }

    return clusters.slice(0, options.maxAlbums);
  }

  /**
   * Cluster images by temporal patterns
   */
  private async clusterByTime(analysisResults: any[], options: ClusteringOptions) {
    // Sort by timestamp
    const sortedResults = [...analysisResults].sort((a, b) => 
      a.features.timestamp.getTime() - b.features.timestamp.getTime()
    );

    const clusters: any[][] = [];
    let currentCluster: any[] = [];
    let lastTimestamp: Date | null = null;

    for (const result of sortedResults) {
      const timestamp = result.features.timestamp;
      
      // Start new cluster if gap is too large (more than 7 days)
      if (lastTimestamp && 
          (timestamp.getTime() - lastTimestamp.getTime()) > 7 * 24 * 60 * 60 * 1000) {
        
        if (currentCluster.length >= options.minAlbumSize) {
          clusters.push(currentCluster);
        }
        currentCluster = [];
      }

      currentCluster.push(result);
      lastTimestamp = timestamp;

      // Split large clusters
      if (currentCluster.length >= options.maxAlbumSize) {
        clusters.push(currentCluster);
        currentCluster = [];
      }
    }

    // Add final cluster
    if (currentCluster.length >= options.minAlbumSize) {
      clusters.push(currentCluster);
    }

    return clusters.slice(0, options.maxAlbums);
  }

  /**
   * Cluster images by people
   */
  private async clusterByPeople(analysisResults: any[], options: ClusteringOptions) {
    const clusters: any[][] = [];
    
    // Group by face count first
    const soloImages = analysisResults.filter(r => r.features.faceCount === 1);
    const groupImages = analysisResults.filter(r => r.features.faceCount > 1);
    const noFaceImages = analysisResults.filter(r => r.features.faceCount === 0);

    // Create solo portrait album
    if (soloImages.length >= options.minAlbumSize) {
      clusters.push(soloImages.slice(0, options.maxAlbumSize));
    }

    // Create group photos album
    if (groupImages.length >= options.minAlbumSize) {
      clusters.push(groupImages.slice(0, options.maxAlbumSize));
    }

    // Create scenery/object album
    if (noFaceImages.length >= options.minAlbumSize) {
      clusters.push(noFaceImages.slice(0, options.maxAlbumSize));
    }

    return clusters.slice(0, options.maxAlbums);
  }

  /**
   * Cluster images by location
   */
  private async clusterByLocation(analysisResults: any[], options: ClusteringOptions) {
    // Group by location labels and GPS data
    const locationGroups = new Map<string, any[]>();

    for (const result of analysisResults) {
      let locationKey = 'unknown';
      
      // Use GPS coordinates if available
      if (result.features.gpsLocation) {
        const lat = Math.round(result.features.gpsLocation.lat * 100) / 100;
        const lon = Math.round(result.features.gpsLocation.lon * 100) / 100;
        locationKey = `gps_${lat}_${lon}`;
      }
      // Use location labels
      else if (result.features.locationLabels.length > 0) {
        locationKey = result.features.locationLabels[0];
      }
      // Use album as location proxy
      else if (result.features.album) {
        locationKey = `album_${result.features.album}`;
      }

      if (!locationGroups.has(locationKey)) {
        locationGroups.set(locationKey, []);
      }
      locationGroups.get(locationKey)!.push(result);
    }

    // Convert to clusters
    const clusters: any[][] = [];
    for (const [location, images] of locationGroups) {
      if (images.length >= options.minAlbumSize && location !== 'unknown') {
        clusters.push(images.slice(0, options.maxAlbumSize));
      }
    }

    return clusters.slice(0, options.maxAlbums);
  }

  /**
   * Hybrid clustering combining multiple strategies
   */
  private async clusterHybrid(analysisResults: any[], options: ClusteringOptions) {
    // Apply multiple clustering strategies and merge results
    const contentClusters = await this.clusterByContent(analysisResults, { ...options, maxAlbums: 5 });
    const temporalClusters = await this.clusterByTime(analysisResults, { ...options, maxAlbums: 3 });
    const peopleClusters = await this.clusterByPeople(analysisResults, { ...options, maxAlbums: 2 });

    // Merge and deduplicate
    const allClusters = [...contentClusters, ...temporalClusters, ...peopleClusters];
    const mergedClusters = this.deduplicateClusters(allClusters, options);

    return mergedClusters.slice(0, options.maxAlbums);
  }

  /**
   * Deduplicate clusters by removing overlapping images
   */
  private deduplicateClusters(clusters: any[][], options: ClusteringOptions) {
    if (options.allowOverlap) return clusters;

    const usedImages = new Set();
    const deduplicatedClusters: any[][] = [];

    // Sort clusters by size (prefer larger clusters)
    clusters.sort((a, b) => b.length - a.length);

    for (const cluster of clusters) {
      const uniqueImages = cluster.filter(item => !usedImages.has(item.image.id));
      
      if (uniqueImages.length >= options.minAlbumSize) {
        deduplicatedClusters.push(uniqueImages);
        uniqueImages.forEach(item => usedImages.add(item.image.id));
      }
    }

    return deduplicatedClusters;
  }

  /**
   * Refine albums with metadata
   */
  private async refineAlbumsWithMetadata(clusters: any[][], options: ClusteringOptions): Promise<AlbumGroup[]> {
    return clusters.map(cluster => {
      const images = cluster.map(item => item.image);
      const features = cluster.map(item => item.features);

      // Calculate date range
      const timestamps = features.map(f => f.timestamp).sort((a, b) => a.getTime() - b.getTime());
      const dateRange = timestamps.length > 1 
        ? `${timestamps[0].toLocaleDateString()} - ${timestamps[timestamps.length - 1].toLocaleDateString()}`
        : timestamps[0]?.toLocaleDateString();

      // Extract common location
      const locations = features.flatMap(f => f.locationLabels).filter(Boolean);
      const location = this.getMostCommon(locations);

      // Extract people information
      const peopleLabels = features.flatMap(f => f.peopleLabels).filter(Boolean);
      const people = this.getMostCommon(peopleLabels);

      // Extract common tags
      const allTags = features.flatMap(f => f.tags).filter(Boolean);
      const commonTags = this.getMostCommon(allTags, 3);

      // Determine theme based on content
      const theme = this.determineTheme(features);

      return {
        name: '', // Will be generated later
        description: '', // Will be generated later
        images,
        theme,
        confidence: 0.8, // Will be calculated later
        reasoning: '', // Will be generated later
        metadata: {
          size: images.length,
          dateRange,
          location,
          people: people ? [people] : [],
          tags: commonTags
        }
      };
    });
  }

  /**
   * Generate smart album names and descriptions
   */
  private async generateAlbumNamesAndDescriptions(albums: AlbumGroup[]): Promise<AlbumGroup[]> {
    const namedAlbums: AlbumGroup[] = [];

    for (const album of albums) {
      try {
        const albumInfo = this.summarizeAlbumForNaming(album);
        
        const prompt = SortingPrompts.SMART_ALBUM.format({
          query: 'Generate album name and description',
          imageCount: album.images.length,
          sortType: 'smart_album',
          userPreferences: 'Create meaningful, descriptive album names',
          albumTheme: album.theme,
          groupingStrategy: 'automatic',
          imageData: formatImageDataForPrompt(album.images.slice(0, 5)) // Sample for naming
        });

        const response = await this.llm.invoke(`
Based on this album information, generate a creative but descriptive name and description:

Album Info:
- Size: ${album.metadata.size} images
- Date Range: ${album.metadata.dateRange || 'Various dates'}
- Theme: ${album.theme}
- Location: ${Array.isArray(album.metadata.location) ? album.metadata.location.join(', ') : (album.metadata.location || 'Various locations')}
- Common Tags: ${Array.isArray(album.metadata.tags) ? album.metadata.tags.join(', ') : (album.metadata.tags || 'None')}

Sample Images:
${album.images.slice(0, 3).map((img, i) => 
  `${i+1}. ${img.virtualName || img.originalName} - ${img.caption || 'No caption'}`
).join('\n')}

Respond with JSON:
{
  "name": "Creative but descriptive album name (max 30 chars)",
  "description": "Detailed description of the album contents and theme",
  "confidence": 0.8,
  "reasoning": "Why this name and description fit the album"
}
        `);

        const parsed = JSON.parse(response.content as string);
        
        namedAlbums.push({
          ...album,
          name: parsed.name || this.generateFallbackName(album),
          description: parsed.description || this.generateFallbackDescription(album),
          confidence: parsed.confidence || 0.7,
          reasoning: parsed.reasoning || 'Generated based on album content analysis'
        });

      } catch (error) {
        console.error('Failed to generate album name, using fallback');
        namedAlbums.push({
          ...album,
          name: this.generateFallbackName(album),
          description: this.generateFallbackDescription(album),
          confidence: 0.6,
          reasoning: 'Fallback naming due to generation error'
        });
      }
    }

    return namedAlbums;
  }

  /**
   * Select thumbnail images for albums
   */
  private async selectAlbumThumbnails(albums: AlbumGroup[]): Promise<AlbumGroup[]> {
    return albums.map(album => {
      // Simple thumbnail selection - pick image with highest technical quality
      let bestThumbnail = album.images[0];
      let bestScore = 0;

      for (const image of album.images) {
        let score = 0;
        
        // Prefer images with faces for human-centric albums
        if (image.metadata?.FaceDetails?.length > 0) score += 0.3;
        
        // Prefer higher resolution
        if (image.metadata?.EXIF?.PixelXDimension && image.metadata?.EXIF?.PixelYDimension) {
          const megapixels = (image.metadata.EXIF.PixelXDimension * image.metadata.EXIF.PixelYDimension) / 1000000;
          score += Math.min(megapixels / 10, 0.3);
        }
        
        // Prefer images with good quality indicators
        if (image.metadata?.Labels) {
          const qualityLabels = image.metadata.Labels.filter((l: any) => 
            ['Sharp', 'Clear', 'Bright', 'Colorful'].includes(l.Name) && l.Confidence > 80
          );
          score += qualityLabels.length * 0.1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestThumbnail = image;
        }
      }

      return {
        ...album,
        thumbnailImage: bestThumbnail
      };
    });
  }

  /**
   * Convert albums to sorted results format
   */
  private convertToSortedResults(albums: AlbumGroup[]): SortedImageResult[] {
    const results: SortedImageResult[] = [];
    let position = 1;

    for (const album of albums) {
      // Add album metadata as a special result
      results.push({
        image: {
          id: `album_${album.name.replace(/\s+/g, '_').toLowerCase()}`,
          user_id: '',
          originalPath: '',
          originalName: album.name,
          hash: '',
          thumbnail: null,
          virtualName: album.name,
          virtualTags: Array.isArray(album.metadata.tags) ? album.metadata.tags : (album.metadata.tags ? [album.metadata.tags] : []),
          virtualAlbum: null,
          virtual_description: album.description,
          nsfwScore: null,
          isFlagged: null,
          caption: `Album: ${album.name}`,
          visionSummary: album.description,
          vision_sorted: null,
          metadata: {
            albumType: 'smart_album',
            imageCount: album.metadata.size,
            thumbnailImageId: album.thumbnailImage?.id
          },
          embedding: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sortOrder: 0
        },
        sortScore: album.confidence,
        reasoning: album.reasoning,
        position: position++,
        metadata: {
          albumInfo: {
            name: album.name,
            description: album.description,
            theme: album.theme,
            size: album.metadata.size,
            dateRange: album.metadata.dateRange,
            location: album.metadata.location,
            people: album.metadata.people,
            tags: album.metadata.tags
          },
          isAlbumHeader: true,
          confidence: album.confidence
        }
      });

      // Add first few images from each album as examples
      const sampleImages = album.images.slice(0, 3);
      for (const image of sampleImages) {
        results.push({
          image,
          sortScore: album.confidence * 0.9,
          reasoning: `Part of "${album.name}" album`,
          position: position++,
          metadata: {
            albumName: album.name,
            albumTheme: album.theme,
            inAlbum: 'true',
            confidence: album.confidence * 0.9
          }
        });
      }
    }

    return results;
  }

  // Helper methods
  private extractLabels(labels: any[]): string[] {
    return labels?.filter(l => l.Confidence > 70).map(l => l.Name) || [];
  }

  private extractColors(metadata: any): string[] {
    // Extract color information from metadata if available
    return metadata?.DominantColors?.map((c: any) => c.Name) || [];
  }

  private extractLocationLabels(labels: any[]): string[] {
    const locationKeywords = ['Building', 'Architecture', 'Landmark', 'Nature', 'Outdoors', 'Indoors'];
    return labels?.filter(l => 
      locationKeywords.some(k => l.Name.includes(k)) && l.Confidence > 70
    ).map(l => l.Name) || [];
  }

  private extractPeopleLabels(labels: any[]): string[] {
    const peopleKeywords = ['Person', 'People', 'Face', 'Portrait', 'Human'];
    return labels?.filter(l => 
      peopleKeywords.some(k => l.Name.includes(k)) && l.Confidence > 80
    ).map(l => l.Name) || [];
  }

  private getTimeOfDay(timestamp: string): string {
    const hour = new Date(timestamp).getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private getSeason(timestamp: string): string {
    const month = new Date(timestamp).getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  private assessTechnicalQuality(image: any): number {
    let score = 0;
    
    if (image.metadata?.EXIF?.PixelXDimension && image.metadata?.EXIF?.PixelYDimension) {
      const megapixels = (image.metadata.EXIF.PixelXDimension * image.metadata.EXIF.PixelYDimension) / 1000000;
      score += Math.min(megapixels / 10, 0.5);
    }
    
    if (image.metadata?.Labels) {
      const qualityLabels = image.metadata.Labels.filter((l: any) => 
        ['Sharp', 'Clear', 'Bright'].includes(l.Name) && l.Confidence > 80
      );
      score += qualityLabels.length * 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  private getMostCommon(items: string[], limit: number = 1): string | string[] {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    
    if (limit === 1) {
      return sorted[0]?.[0] || '';
    } else {
      return sorted.slice(0, limit).map(entry => entry[0]);
    }
  }

  private determineTheme(features: any[]): string {
    const allLabels = features.flatMap(f => f.rekognitionLabels);
    const labelCounts = new Map<string, number>();
    
    for (const label of allLabels) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }
    
    const topLabels = Array.from(labelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
    
    // Determine theme based on top labels
    if (topLabels.some(l => ['Person', 'People', 'Face'].includes(l))) {
      return 'people';
    } else if (topLabels.some(l => ['Nature', 'Landscape', 'Tree', 'Mountain'].includes(l))) {
      return 'nature';
    } else if (topLabels.some(l => ['Building', 'Architecture', 'City'].includes(l))) {
      return 'urban';
    } else if (topLabels.some(l => ['Party', 'Celebration', 'Event'].includes(l))) {
      return 'event';
    } else {
      return 'general';
    }
  }

  private summarizeAlbumForNaming(album: AlbumGroup): string {
    return `${album.metadata.size} images, theme: ${album.theme}, date: ${album.metadata.dateRange}`;
  }

  private generateFallbackName(album: AlbumGroup): string {
    const theme = album.theme.charAt(0).toUpperCase() + album.theme.slice(1);
    const date = album.metadata.dateRange?.split(' - ')[0] || 'Recent';
    return `${theme} Collection ${date}`;
  }

  private generateFallbackDescription(album: AlbumGroup): string {
    return `A collection of ${album.metadata.size} ${album.theme} images${album.metadata.dateRange ? ` from ${album.metadata.dateRange}` : ''}.`;
  }

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

  private generateAlbumReasoning(albums: AlbumGroup[], options: ClusteringOptions): string {
    const parts = [
      `Created ${albums.length} smart albums using ${options.strategy} clustering strategy.`
    ];

    const themes = albums.map(a => a.theme);
    const uniqueThemes = [...new Set(themes)];
    
    if (uniqueThemes.length > 1) {
      parts.push(`Identified ${uniqueThemes.join(', ')} themes across the collection.`);
    }

    const totalImages = albums.reduce((sum, a) => sum + a.metadata.size, 0);
    parts.push(`Organized ${totalImages} images into meaningful groups.`);

    const avgConfidence = albums.reduce((sum, a) => sum + a.confidence, 0) / albums.length;
    if (avgConfidence > 0.8) {
      parts.push('High confidence in album groupings based on strong content patterns.');
    } else if (avgConfidence > 0.6) {
      parts.push('Good album groupings with reasonable confidence.');
    } else {
      parts.push('Basic album groupings based on available metadata.');
    }

    return parts.join(' ');
  }

  private calculateAlbumConfidence(albums: AlbumGroup[]): number {
    if (albums.length === 0) return 0;
    
    const avgConfidence = albums.reduce((sum, a) => sum + a.confidence, 0) / albums.length;
    
    // Boost confidence if we have good variety
    const themes = [...new Set(albums.map(a => a.theme))];
    const varietyBoost = Math.min(themes.length * 0.05, 0.15);
    
    return Math.min(avgConfidence + varietyBoost, 1.0);
  }

  /**
   * Health check for smart albums chain
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testInput: ChainInput = {
        query: 'create smart albums',
        images: [],
        context: {
          query: 'create smart albums',
          userImages: [],
          sortType: 'smart_album',
          preferences: {
            preferredSort: 'smart_album',
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
      console.error('Smart albums chain health check failed:', error);
      return false;
    }
  }
}
