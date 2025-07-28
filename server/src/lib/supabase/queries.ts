import { supabaseService, handleDatabaseError } from './client';
import { VirtualImage } from '../../types/sorting';

// Query builders for virtual_image table
export class VirtualImageQueries {
  
  // Get images by user ID with optional filters
  static async getByUserId(
    userId: string,
    options: {
      albumId?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
      sortBy?: string; // Allow any schema field
      sortOrder?: 'asc' | 'desc';
      includeEmbeddings?: boolean;
    } = {}
  ): Promise<VirtualImage[]> {
    try {
      let query = supabaseService
        .from('virtual_image')
        .select(
          options.includeEmbeddings 
            ? '*' 
            : [
                'id', 'user_id', 'original_path', 'original_name', 'hash', 'thumbnail', 'virtual_name', 'virtual_tags', 'virtual_albums', 'virtual_description',
                'nsfw_score', 'isflagged', 'caption', 'vision_summary', 'vision_sorted', 'metadata', 'embedding', 'created_at', 'updated_at', 'sortorder',
                'date_taken', 'date_modified', 'date_imported', 'location_lat', 'location_lng', 'location_name', 'location_country', 'location_city',
                'dominant_colors', 'detected_objects', 'detected_faces_count', 'scene_type', 'brightness_score', 'blur_score', 'quality_score', 'aesthetic_score',
                'emotion_detected', 'activity_detected', 'image_orientation'
              ].join(',')
        )
        .eq('user_id', userId);

      // Apply filters
      if (options.albumId) {
        query = query.overlaps('virtual_albums', [options.albumId]);
      }

      if (options.tags && options.tags.length > 0) {
        query = query.overlaps('virtual_tags', options.tags);
      }

      // Apply sorting
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'getByUserId');
      }

      return (data || []) as unknown as VirtualImage[];
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'getByUserId');
    }
  }

  // Get images by IDs (for specific sorting requests)
  static async getByIds(imageIds: string[], userId: string): Promise<VirtualImage[]> {
    try {
      const { data, error } = await supabaseService
        .from('virtual_image')
        .select('*')
        .in('id', imageIds)
        .eq('user_id', userId); // Security: ensure user owns these images

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'getByIds');
      }

      return (data || []) as VirtualImage[];
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'getByIds');
    }
  }

  // Get images with embeddings for vector similarity search
  static async getWithEmbeddings(
    userId: string,
    options: {
      hasEmbedding?: boolean;
      limit?: number;
    } = {}
  ): Promise<VirtualImage[]> {
    try {
      let query = supabaseService
        .from('virtual_image')
        .select('*')
        .eq('user_id', userId);

      if (options.hasEmbedding !== undefined) {
        if (options.hasEmbedding) {
          query = query.not('embedding', 'is', null);
        } else {
          query = query.is('embedding', null);
        }
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'getWithEmbeddings');
      }

      return (data || []) as VirtualImage[];
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'getWithEmbeddings');
    }
  }

  // Vector similarity search using pgvector
  static async vectorSimilaritySearch(
    userId: string,
    queryEmbedding: number[],
    options: {
      limit?: number;
      threshold?: number;
      albumId?: string;
    } = {}
  ): Promise<Array<VirtualImage & { similarity: number }>> {
    try {
      // Note: This requires pgvector extension and proper embedding column setup
      const limit = options.limit || 20;
      const threshold = options.threshold || 0.5;
      
      let query = supabaseService
        .rpc('vector_similarity_search', {
          query_embedding: queryEmbedding,
          user_id: userId,
          similarity_threshold: threshold,
          max_results: limit
        });

      if (options.albumId) {
            query = query.eq('virtual_albums', options.albumId);
      }

      const { data, error } = await query;

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'vectorSimilaritySearch');
      }

      return data || [];
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'vectorSimilaritySearch');
    }
  }

  // Update sort order for images
  static async updateSortOrder(
    updates: Array<{ id: string; sortOrder: number }>,
    userId: string
  ): Promise<void> {
    try {
      // Batch update sort orders
      const promises = updates.map(({ id, sortOrder }) =>
        supabaseService
          .from('virtual_image')
          .update({ sortOrder, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', userId) // Security: ensure user owns the image
      );

      const results = await Promise.all(promises);
      
      for (const result of results) {
        if (result.error) {
          handleDatabaseError(result.error, 'virtual_image', 'updateSortOrder');
        }
      }
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'updateSortOrder');
    }
  }

  // Update embeddings for images
  static async updateEmbedding(
    imageId: string,
    embedding: number[],
    userId: string
  ): Promise<void> {
    try {
      const { error } = await supabaseService
        .from('virtual_image')
        .update({ 
          embedding,
          updated_at: new Date().toISOString()
        })
        .eq('id', imageId)
        .eq('user_id', userId);

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'updateEmbedding');
      }
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'updateEmbedding');
    }
  }

  // Update vision analysis results
  static async updateVisionAnalysis(
    imageId: string,
    analysis: {
      visionSummary?: string;
      caption?: string;
      vision_sorted?: boolean;
      metadata?: Record<string, any>;
    },
    userId: string
  ): Promise<void> {
    try {
      const { error } = await supabaseService
        .from('virtual_image')
        .update({
          ...analysis,
          updated_at: new Date().toISOString()
        })
        .eq('id', imageId)
        .eq('user_id', userId);

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'updateVisionAnalysis');
      }
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'updateVisionAnalysis');
    }
  }

  // Get statistics for user's images
  static async getStats(userId: string): Promise<{
    total: number;
    withEmbeddings: number;
    withVisionAnalysis: number;
    albums: number;
    averageNsfwScore: number;
  }> {
    try {
      const { data, error } = await supabaseService
        .rpc('get_user_image_stats', { user_id: userId });

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'getStats');
      }

      return data || {
        total: 0,
        withEmbeddings: 0,
        withVisionAnalysis: 0,
        albums: 0,
        averageNsfwScore: 0
      };
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'getStats');
    }
  }

  // Search images by text (using metadata and descriptions)
  static async textSearch(
    userId: string,
    searchQuery: string,
    options: {
      limit?: number;
      includeCaption?: boolean;
      includeDescription?: boolean;
      includeMetadata?: boolean;
    } = {}
  ): Promise<VirtualImage[]> {
    try {
      const limit = options.limit || 50;
      
      let query = supabaseService
        .from('virtual_image')
        .select('*')
        .eq('user_id', userId);

      // Build text search conditions
      const searchConditions = [];
      
      if (options.includeCaption !== false) {
        searchConditions.push(`caption.ilike.%${searchQuery}%`);
      }
      
      if (options.includeDescription !== false) {
        searchConditions.push(`virtual_description.ilike.%${searchQuery}%`);
      }
      
      // For now, simple text search. In production, use PostgreSQL full-text search
      query = query.or(searchConditions.join(','));
      query = query.limit(limit);

      const { data, error } = await query;

      if (error) {
        handleDatabaseError(error, 'virtual_image', 'textSearch');
      }

      return (data || []) as VirtualImage[];
    } catch (error) {
      handleDatabaseError(error, 'virtual_image', 'textSearch');
    }
  }
}

// Credit and user profile queries
export class UserQueries {
  
  // Get user profile with credits
  static async getProfile(userId: string) {
    try {
      const { data, error } = await supabaseService
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        handleDatabaseError(error, 'user_profiles', 'getProfile');
      }

      return data;
    } catch (error) {
      handleDatabaseError(error, 'user_profiles', 'getProfile');
    }
  }

  // Update user credits
  static async updateCredits(userId: string, creditChange: number) {
    try {
      const { error } = await supabaseService
        .rpc('update_user_credits', {
          user_id: userId,
          credit_change: creditChange
        });

      if (error) {
        handleDatabaseError(error, 'user_profiles', 'updateCredits');
      }
    } catch (error) {
      handleDatabaseError(error, 'user_profiles', 'updateCredits');
    }
  }
}
