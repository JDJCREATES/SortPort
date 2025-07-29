/**
 * Virtual Image Manager
 * 
 * Streamlined system for managing virtual_image data with AWS Rekognition integration.
 * Designed to work seamlessly with existing Edge Functions.
 */

import { supabaseService } from '../supabase/client';
import { VirtualImage } from '../../types/sorting';
import { EventEmitter } from 'events';

export interface RekognitionData {
  // Complete AWS Rekognition response structure
  Labels?: Array<{
    Name: string;
    Confidence: number;
    Instances?: Array<{
      BoundingBox: {
        Width: number;
        Height: number;
        Left: number;
        Top: number;
      };
    }>;
    Parents?: Array<{
      Name: string;
    }>;
    Categories?: Array<{
      Name: string;
    }>;
  }>;
  
  ModerationLabels?: Array<{
    Name: string;
    Confidence: number;
    ParentName?: string;
  }>;
  
  FaceDetails?: Array<{
    BoundingBox: {
      Width: number;
      Height: number;
      Left: number;
      Top: number;
    };
    AgeRange: {
      Low: number;
      High: number;
    };
    Smile: {
      Value: boolean;
      Confidence: number;
    };
    Eyeglasses: {
      Value: boolean;
      Confidence: number;
    };
    Sunglasses: {
      Value: boolean;
      Confidence: number;
    };
    Gender: {
      Value: string;
      Confidence: number;
    };
    Beard: {
      Value: boolean;
      Confidence: number;
    };
    Mustache: {
      Value: boolean;
      Confidence: number;
    };
    EyesOpen: {
      Value: boolean;
      Confidence: number;
    };
    MouthOpen: {
      Value: boolean;
      Confidence: number;
    };
    Emotions?: Array<{
      Type: string;
      Confidence: number;
    }>;
    Landmarks?: Array<{
      Type: string;
      X: number;
      Y: number;
    }>;
    Pose: {
      Roll: number;
      Yaw: number;
      Pitch: number;
    };
    Quality: {
      Brightness: number;
      Sharpness: number;
    };
    Confidence: number;
  }>;
  
  ImageProperties?: {
    Quality: {
      Brightness: number;
      Sharpness: number;
      Contrast: number;
    };
    DominantColors?: Array<{
      Red: number;
      Green: number;
      Blue: number;
      HexCode: string;
      SimplifiedColor: string;
      CssColor: string;
      PixelPercentage: number;
    }>;
    Foreground?: {
      Quality: {
        Brightness: number;
        Sharpness: number;
        Contrast: number;
      };
      DominantColors?: Array<{
        Red: number;
        Green: number;
        Blue: number;
        HexCode: string;
        SimplifiedColor: string;
        CssColor: string;
        PixelPercentage: number;
      }>;
    };
    Background?: {
      Quality: {
        Brightness: number;
        Sharpness: number;
        Contrast: number;
      };
      DominantColors?: Array<{
        Red: number;
        Green: number;
        Blue: number;
        HexCode: string;
        SimplifiedColor: string;
        CssColor: string;
        PixelPercentage: number;
      }>;
    };
  };
  
  TextDetections?: Array<{
    DetectedText: string;
    Type: string;
    Id: number;
    ParentId?: number;
    Confidence: number;
    Geometry: {
      BoundingBox: {
        Width: number;
        Height: number;
        Left: number;
        Top: number;
      };
    };
  }>;
}

export interface ProcessingOptions {
  batchSize?: number;
  concurrency?: number;
  retryAttempts?: number;
  progressCallback?: (processed: number, total: number) => void;
  enableCaching?: boolean;
}

export interface VirtualImageInput {
  id?: string;
  user_id: string;
  original_path: string;
  original_name: string;
  hash?: string;
  fileSize?: number;
  mimeType?: string;
  exifData?: any;
  rekognitionData?: RekognitionData;
}

export class VirtualImageManager extends EventEmitter {
  private cache: Map<string, VirtualImage> = new Map();
  private processingQueue: Map<string, Promise<VirtualImage | null>> = new Map();
  private readonly CACHE_TTL = 1000 * 60 * 5; // 5 minutes
  private readonly MAX_BATCH_SIZE = 100;
  private readonly DEFAULT_CONCURRENCY = 10;

  constructor() {
    super();
    this.setupCleanupInterval();
  }

  /**
   * Process a single image with complete Rekognition data extraction
   */
  async processImage(input: VirtualImageInput, options: ProcessingOptions = {}): Promise<VirtualImage | null> {
    const cacheKey = `${input.user_id}:${input.hash || input.original_path}`;
    
    // Check cache first
    if (options.enableCaching && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - new Date(cached.updated_at).getTime() < this.CACHE_TTL) {
        return cached;
      }
    }

    // Check if already processing
    if (this.processingQueue.has(cacheKey)) {
      return await this.processingQueue.get(cacheKey)!;
    }

    // Start processing
    const processingPromise = this.createVirtualImage(input);
    this.processingQueue.set(cacheKey, processingPromise);

    try {
      const result = await processingPromise;
      
      // Cache result
      if (result && options.enableCaching) {
        this.cache.set(cacheKey, result);
      }
      
      this.emit('imageProcessed', { input, result });
      return result;
    } catch (error) {
      this.emit('processingError', { input, error });
      throw error;
    } finally {
      this.processingQueue.delete(cacheKey);
    }
  }

  /**
   * Process multiple images in batches with concurrency control
   */
  async processBatch(
    inputs: VirtualImageInput[], 
    options: ProcessingOptions = {}
  ): Promise<Array<VirtualImage | null>> {
    const {
      batchSize = this.MAX_BATCH_SIZE,
      concurrency = this.DEFAULT_CONCURRENCY,
      progressCallback
    } = options;

    const results: Array<VirtualImage | null> = [];
    let processed = 0;

    // Process in chunks
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      
      // Process batch with concurrency limit
      const batchPromises = batch.map((input, index) => 
        this.processWithDelay(input, index * 100, options) // 100ms delay between starts
      );

      // Limit concurrency
      const batchResults = await this.limitConcurrency(batchPromises, concurrency);
      results.push(...batchResults);
      
      processed += batch.length;
      progressCallback?.(processed, inputs.length);
      
      this.emit('batchProcessed', { processed, total: inputs.length });
    }

    return results;
  }

  /**
   * Create virtual image record with comprehensive Rekognition data mapping
   */
  private async createVirtualImage(input: VirtualImageInput): Promise<VirtualImage | null> {
    try {
      const virtualImageData = this.mapToVirtualImage(input);
      
      // Insert into database
      const { data, error } = await supabaseService
        .from('virtual_image')
        .insert(virtualImageData)
        .select()
        .single();

      if (error) {
        console.error('Failed to create virtual image:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating virtual image:', error);
      return null;
    }
  }

  /**
   * Map input data to complete VirtualImage structure with all Rekognition data
   */
  private mapToVirtualImage(input: VirtualImageInput): Partial<VirtualImage> {
    const now = new Date().toISOString();
    const rekData = input.rekognitionData;

    // Extract comprehensive data from Rekognition
    const processedRek = rekData ? this.extractRekognitionData(rekData) : {};

    return {
      id: input.id || this.generateUUID(),
      user_id: input.user_id,
      original_path: input.original_path,
      original_name: input.original_name,
      hash: input.hash || null,
      thumbnail: null, // To be populated by thumbnail generation service
      
      // Virtual/AI fields (initially null)
      virtual_name: null,
      virtual_tags: null,
      virtual_albums: undefined,
      virtual_description: null,
      
      // NSFW and safety
      nsfw_score: processedRek.nsfwScore || null,
      isflagged: processedRek.isNsfw || false,
      
      // AI analysis fields
      caption: null,
      vision_summary: null,
      vision_sorted: false,
      embedding: null,
      
      // Complete metadata including all Rekognition data
      metadata: {
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        exif: input.exifData,
        rekognition: {
          raw: rekData, // Complete raw response
          processed: processedRek, // Processed/normalized data
          version: '2023.11', // Track Rekognition API version
          processedAt: now
        },
        processingTimestamp: now
      },
      
      // Timestamps
      created_at: now,
      updated_at: now,
      sortorder: null,
      
      // EXIF-based dates
      date_taken: input.exifData?.DateTimeOriginal || null,
      date_modified: input.exifData?.ModifyDate || null,
      date_imported: now,
      
      // Location from EXIF
      location_lat: input.exifData?.GPSLatitude || null,
      location_lng: input.exifData?.GPSLongitude || null,
      location_name: null,
      location_country: null,
      location_city: null,
      
      // Rekognition extracted features
      dominant_colors: processedRek.dominantColors || null,
      detected_objects: processedRek.objects || null,
      detected_faces_count: processedRek.faceCount || 0,
      scene_type: processedRek.sceneType || null,
      
      // Quality and technical metrics
      brightness_score: processedRek.brightness || null,
      blur_score: processedRek.sharpness || null,
      quality_score: processedRek.overallQuality || null,
      aesthetic_score: null, // For future AI analysis
      
      // Human and activity detection
      emotion_detected: processedRek.emotions || null,
      activity_detected: processedRek.activities || null,
      image_orientation: processedRek.orientation || null
    };
  }

  /**
   * Extract and normalize ALL data from AWS Rekognition response
   */
  private extractRekognitionData(rekData: RekognitionData) {
    const result: any = {
      // Safety and moderation
      nsfwScore: this.calculateNSFWScore(rekData.ModerationLabels),
      isNsfw: this.isImageNSFW(rekData.ModerationLabels),
      moderationLabels: rekData.ModerationLabels?.map(label => ({
        name: label.Name,
        confidence: label.Confidence,
        parent: label.ParentName
      })) || [],
      
      // Object and scene detection
      objects: rekData.Labels?.map(label => ({
        name: label.Name,
        confidence: label.Confidence,
        categories: label.Categories?.map(cat => cat.Name) || [],
        parents: label.Parents?.map(parent => parent.Name) || [],
        instances: label.Instances?.length || 0
      })) || [],
      
      // Scene classification
      sceneType: this.determineSceneType(rekData.Labels),
      
      // Face analysis (comprehensive)
      faces: rekData.FaceDetails?.map(face => ({
        boundingBox: face.BoundingBox,
        ageRange: face.AgeRange,
        emotions: face.Emotions?.map(emotion => ({
          type: emotion.Type,
          confidence: emotion.Confidence
        })) || [],
        attributes: {
          smile: face.Smile,
          eyeglasses: face.Eyeglasses,
          sunglasses: face.Sunglasses,
          gender: face.Gender,
          beard: face.Beard,
          mustache: face.Mustache,
          eyesOpen: face.EyesOpen,
          mouthOpen: face.MouthOpen
        },
        pose: face.Pose,
        quality: face.Quality,
        landmarks: face.Landmarks || [],
        confidence: face.Confidence
      })) || [],
      
      faceCount: rekData.FaceDetails?.length || 0,
      
      // Image quality and properties
      brightness: rekData.ImageProperties?.Quality?.Brightness || null,
      sharpness: rekData.ImageProperties?.Quality?.Sharpness || null,
      contrast: rekData.ImageProperties?.Quality?.Contrast || null,
      
      // Color analysis (comprehensive)
      dominantColors: rekData.ImageProperties?.DominantColors?.map(color => ({
        rgb: `rgb(${color.Red}, ${color.Green}, ${color.Blue})`,
        hex: color.HexCode,
        simplified: color.SimplifiedColor,
        css: color.CssColor,
        percentage: color.PixelPercentage
      })) || [],
      
      // Foreground/Background analysis
      foreground: rekData.ImageProperties?.Foreground ? {
        quality: rekData.ImageProperties.Foreground.Quality,
        dominantColors: rekData.ImageProperties.Foreground.DominantColors
      } : null,
      
      background: rekData.ImageProperties?.Background ? {
        quality: rekData.ImageProperties.Background.Quality,
        dominantColors: rekData.ImageProperties.Background.DominantColors
      } : null,
      
      // Text detection
      textDetections: rekData.TextDetections?.map(text => ({
        text: text.DetectedText,
        type: text.Type,
        confidence: text.Confidence,
        boundingBox: text.Geometry.BoundingBox
      })) || [],
      
      // Derived insights
      emotions: this.extractEmotions(rekData.FaceDetails),
      activities: this.extractActivities(rekData.Labels),
      overallQuality: this.calculateOverallQuality(rekData.ImageProperties),
      orientation: this.determineOrientation(rekData.ImageProperties),
      
      // Technical metadata
      hasText: rekData.TextDetections && rekData.TextDetections.length > 0,
      hasFaces: rekData.FaceDetails && rekData.FaceDetails.length > 0,
      isPortrait: this.isPortraitImage(rekData.FaceDetails),
      isGroupPhoto: rekData.FaceDetails && rekData.FaceDetails.length > 1,
      
      // Confidence scores
      averageConfidence: this.calculateAverageConfidence(rekData),
      highConfidenceLabels: rekData.Labels?.filter(label => label.Confidence > 90).map(l => l.Name) || []
    };

    return result;
  }

  /**
   * Helper methods for data extraction
   */
  private calculateNSFWScore(moderationLabels?: RekognitionData['ModerationLabels']): number {
    if (!moderationLabels) return 0;
    
    const nsfwLabels = ['Explicit Nudity', 'Suggestive', 'Violence', 'Drugs'];
    const maxConfidence = moderationLabels
      .filter(label => nsfwLabels.some(nsfw => label.Name.includes(nsfw)))
      .reduce((max, label) => Math.max(max, label.Confidence), 0);
    
    return maxConfidence / 100; // Convert to 0-1 scale
  }

  private isImageNSFW(moderationLabels?: RekognitionData['ModerationLabels']): boolean {
    return this.calculateNSFWScore(moderationLabels) > 0.8;
  }

  private determineSceneType(labels?: RekognitionData['Labels']): string | null {
    if (!labels) return null;
    
    const sceneMapping = {
      'Outdoors': ['Outdoors', 'Nature', 'Landscape', 'Sky', 'Mountain'],
      'Indoor': ['Indoors', 'Room', 'Furniture', 'Home'],
      'Beach': ['Beach', 'Ocean', 'Water', 'Sand'],
      'Urban': ['City', 'Building', 'Street', 'Car', 'Architecture'],
      'Party': ['Party', 'Celebration', 'Dancing', 'Crowd'],
      'Food': ['Food', 'Meal', 'Restaurant', 'Dining'],
      'Sport': ['Sport', 'Exercise', 'Game', 'Stadium']
    };
    
    for (const [scene, keywords] of Object.entries(sceneMapping)) {
      if (labels.some(label => 
        keywords.some(keyword => 
          label.Name.toLowerCase().includes(keyword.toLowerCase()) && label.Confidence > 70
        )
      )) {
        return scene;
      }
    }
    
    return null;
  }

  private extractEmotions(faceDetails?: RekognitionData['FaceDetails']): string[] | null {
    if (!faceDetails) return null;
    
    const emotions = faceDetails
      .flatMap(face => face.Emotions || [])
      .filter(emotion => emotion.Confidence > 50)
      .map(emotion => emotion.Type);
    
    return emotions.length > 0 ? [...new Set(emotions)] : null;
  }

  private extractActivities(labels?: RekognitionData['Labels']): string[] | null {
    if (!labels) return null;
    
    const activityKeywords = ['Sport', 'Exercise', 'Dance', 'Reading', 'Cooking', 'Swimming', 'Running'];
    const activities = labels
      .filter(label => 
        activityKeywords.some(activity => 
          label.Name.includes(activity) && label.Confidence > 70
        )
      )
      .map(label => label.Name);
    
    return activities.length > 0 ? activities : null;
  }

  private calculateOverallQuality(imageProps?: RekognitionData['ImageProperties']): number | null {
    if (!imageProps?.Quality) return null;
    
    const { Brightness, Sharpness, Contrast } = imageProps.Quality;
    return (Brightness + Sharpness + (Contrast || 0)) / (Contrast ? 3 : 2);
  }

  private determineOrientation(imageProps?: RekognitionData['ImageProperties']): string | null {
    // This would need additional logic based on image dimensions
    // For now, return null - can be enhanced with EXIF data
    return null;
  }

  private isPortraitImage(faceDetails?: RekognitionData['FaceDetails']): boolean {
    if (!faceDetails || faceDetails.length === 0) return false;
    
    // Consider it a portrait if there's a large, well-centered face
    return faceDetails.some(face => {
      const bbox = face.BoundingBox;
      const faceSize = bbox.Width * bbox.Height;
      const centerX = bbox.Left + bbox.Width / 2;
      const centerY = bbox.Top + bbox.Height / 2;
      
      return faceSize > 0.1 && // Face takes up >10% of image
             Math.abs(centerX - 0.5) < 0.3 && // Face is reasonably centered
             Math.abs(centerY - 0.5) < 0.3;
    });
  }

  private calculateAverageConfidence(rekData: RekognitionData): number {
    const allConfidences: number[] = [];
    
    rekData.Labels?.forEach(label => allConfidences.push(label.Confidence));
    rekData.ModerationLabels?.forEach(label => allConfidences.push(label.Confidence));
    rekData.FaceDetails?.forEach(face => allConfidences.push(face.Confidence));
    rekData.TextDetections?.forEach(text => allConfidences.push(text.Confidence));
    
    return allConfidences.length > 0 
      ? allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length 
      : 0;
  }

  /**
   * Integration with Edge Functions
   */
  async syncWithEdgeFunction(jobId: string, rekognitionResult: RekognitionData): Promise<VirtualImage | null> {
    // This method can be called from your Edge Function webhook
    // to sync Rekognition results back to the main system
    
    try {
      // Find the pending virtual image record by job ID
      const { data: existingImage, error } = await supabaseService
        .from('virtual_image')
        .select('*')
        .eq('metadata->jobId', jobId)
        .single();

      if (error || !existingImage) {
        console.error('Virtual image not found for job:', jobId);
        return null;
      }

      // Update with Rekognition data
      const updatedData = this.mapToVirtualImage({
        ...existingImage,
        rekognitionData: rekognitionResult
      });

      const { data: updated, error: updateError } = await supabaseService
        .from('virtual_image')
        .update(updatedData)
        .eq('id', existingImage.id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update virtual image:', updateError);
        return null;
      }

      this.emit('imageUpdated', { jobId, image: updated });
      return updated;
    } catch (error) {
      console.error('Error syncing with edge function:', error);
      return null;
    }
  }

  /**
   * Utility methods
   */
  private async processWithDelay(
    input: VirtualImageInput, 
    delay: number, 
    options: ProcessingOptions
  ): Promise<VirtualImage | null> {
    await new Promise(resolve => setTimeout(resolve, delay));
    return this.processImage(input, options);
  }

  private async limitConcurrency<T>(
    promises: Promise<T>[], 
    limit: number
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < promises.length; i += limit) {
      const batch = promises.slice(i, i + limit);
      const batchResults = await Promise.allSettled(batch);
      
      results.push(...batchResults.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean) as T[]);
    }
    
    return results;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private setupCleanupInterval(): void {
    // Clean up cache every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, image] of this.cache.entries()) {
        if (now - new Date(image.updated_at).getTime() > this.CACHE_TTL) {
          this.cache.delete(key);
        }
      }
    }, this.CACHE_TTL);
  }

  /**
   * Public API methods
   */
  async getVirtualImage(id: string): Promise<VirtualImage | null> {
    try {
      const { data, error } = await supabaseService
        .from('virtual_image')
        .select('*')
        .eq('id', id)
        .single();

      return error ? null : data;
    } catch (error) {
      console.error('Error fetching image:', error);
      return null;
    }
  }

  async findByPath(imagePath: string): Promise<VirtualImage | null> {
    try {
      // Clean the path - remove s3:// prefix and temp bucket prefixes
      let cleanPath = imagePath;
      if (cleanPath.startsWith('s3://')) {
        cleanPath = cleanPath.replace(/^s3:\/\/[^\/]+\//, '');
      }
      if (cleanPath.startsWith('temp-')) {
        cleanPath = cleanPath.replace(/^temp-[^\/]+\//, '');
      }

      console.log(`🔍 Looking for virtual image with path: ${imagePath} (cleaned: ${cleanPath})`);

      // Try exact match first
      let { data, error } = await supabaseService
        .from('virtual_image')
        .select('*')
        .eq('original_path', imagePath)
        .single();

      if (data && !error) {
        console.log(`✅ Found virtual image by exact path match: ${data.id}`);
        return data;
      }

      // Try with cleaned path
      ({ data, error } = await supabaseService
        .from('virtual_image')
        .select('*')
        .eq('original_path', cleanPath)
        .single());

      if (data && !error) {
        console.log(`✅ Found virtual image by cleaned path match: ${data.id}`);
        return data;
      }

      // Try partial match using LIKE
      ({ data, error } = await supabaseService
        .from('virtual_image')
        .select('*')
        .or(`original_path.like.%${cleanPath},original_path.like.%${imagePath}`)
        .limit(1)
        .single());

      if (data && !error) {
        console.log(`✅ Found virtual image by partial path match: ${data.id}`);
        return data;
      }

      console.warn(`⚠️ No virtual image found for path: ${imagePath}`);
      return null;

    } catch (error) {
      console.error('Error finding image by path:', error);
      return null;
    }
  }

  async updateVirtualImage(id: string, updates: Partial<VirtualImage>): Promise<VirtualImage | null> {
    try {
      const { data, error } = await supabaseService
        .from('virtual_image')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (data) {
        // Update cache
        const cacheKey = `${data.user_id}:${data.hash || data.original_path}`;
        this.cache.set(cacheKey, data);
        this.emit('imageUpdated', { id, image: data });
      }

      return error ? null : data;
    } catch (error) {
      console.error('Error updating image:', error);
      return null;
    }
  }

  async deleteVirtualImage(id: string): Promise<boolean> {
    try {
      const { error } = await supabaseService
        .from('virtual_image')
        .delete()
        .eq('id', id);

      if (!error) {
        // Remove from cache
        for (const [key, image] of this.cache.entries()) {
          if (image.id === id) {
            this.cache.delete(key);
            break;
          }
        }
        this.emit('imageDeleted', { id });
      }

      return !error;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  async getUserImages(
    userId: string, 
    options: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      folderId?: string;
    } = {}
  ): Promise<{ images: VirtualImage[]; total: number }> {
    try {
      let query = supabaseService
        .from('virtual_image')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (options.folderId) {
        // Assuming folder_id is stored in metadata
        query = query.contains('metadata', { folderId: options.folderId });
      }

      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      if (options.limit) {
        const offset = options.offset || 0;
        query = query.range(offset, offset + options.limit - 1);
      }

      const { data, error, count } = await query;

      return {
        images: error ? [] : data,
        total: count || 0
      };
    } catch (error) {
      console.error('Error fetching user images:', error);
      return { images: [], total: 0 };
    }
  }

  // Clean shutdown
  async shutdown(): Promise<void> {
    // Wait for all processing to complete
    await Promise.allSettled(Array.from(this.processingQueue.values()));
    
    // Clear cache and queues
    this.cache.clear();
    this.processingQueue.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}

// Export singleton instance
export const virtualImageManager = new VirtualImageManager();
