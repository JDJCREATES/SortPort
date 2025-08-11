/**
 * Virtual Image ID Service - Clean ID-based image tracking
 * Replaces complex path-based validation with simple ID operations
 */

import { supabase } from '../supabase';
import { logInfo, logError, logDebug } from './LoggingConfig';

export interface VirtualImageRecord {
  id: string;
  user_id: string;
  original_path?: string; // Optional - for reference only
  virtual_name?: string;
  virtual_tags?: string[];
  virtual_albums?: string[];
  isflagged?: boolean;
  rekognition_data?: any;
  mlkit_data?: any;
  created_at: string;
  updated_at: string;
}

export interface CreateVirtualImageRequest {
  userId: string;
  originalPath?: string;
  virtualName?: string;
  tags?: string[];
  albums?: string[];
}

export interface UpdateVirtualImageRequest {
  virtualImageId: string;
  isNsfw?: boolean;
  rekognitionData?: any;
  mlkitData?: any;
  tags?: string[];
  albums?: string[];
}

export class VirtualImageIdService {
  /**
   * Create a new virtual image record - returns database ID for tracking
   */
  static async createVirtualImage(request: CreateVirtualImageRequest): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('virtual_image')
        .insert({
          user_id: request.userId,
          original_path: request.originalPath, // Store for reference but don't rely on it
          virtual_name: request.virtualName,
          virtual_tags: request.tags || [],
          virtual_albums: request.albums || [],
          isflagged: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      logDebug('Created virtual image record', {
        component: 'VirtualImageIdService',
        virtualImageId: data.id,
        userId: request.userId
      });

      return data.id;
    } catch (error) {
      logError('Failed to create virtual image', {
        component: 'VirtualImageIdService',
        userId: request.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update virtual image by ID - no path matching required
   */
  static async updateVirtualImage(request: UpdateVirtualImageRequest): Promise<void> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (request.isNsfw !== undefined) updateData.isflagged = request.isNsfw;
      if (request.rekognitionData !== undefined) updateData.rekognition_data = request.rekognitionData;
      if (request.mlkitData !== undefined) updateData.mlkit_data = request.mlkitData;
      if (request.tags !== undefined) updateData.virtual_tags = request.tags;
      if (request.albums !== undefined) updateData.virtual_albums = request.albums;

      const { error } = await supabase
        .from('virtual_image')
        .update(updateData)
        .eq('id', request.virtualImageId);

      if (error) throw error;

      logDebug('Updated virtual image by ID', {
        component: 'VirtualImageIdService',
        virtualImageId: request.virtualImageId,
        fields: Object.keys(updateData)
      });
    } catch (error) {
      logError('Failed to update virtual image', {
        component: 'VirtualImageIdService',
        virtualImageId: request.virtualImageId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get virtual image by ID
   */
  static async getVirtualImage(virtualImageId: string): Promise<VirtualImageRecord | null> {
    try {
      const { data, error } = await supabase
        .from('virtual_image')
        .select('*')
        .eq('id', virtualImageId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as VirtualImageRecord;
    } catch (error) {
      logError('Failed to get virtual image', {
        component: 'VirtualImageIdService',
        virtualImageId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get multiple virtual images by IDs
   */
  static async getVirtualImages(virtualImageIds: string[]): Promise<VirtualImageRecord[]> {
    try {
      const { data, error } = await supabase
        .from('virtual_image')
        .select('*')
        .in('id', virtualImageIds);

      if (error) throw error;

      logDebug('Retrieved virtual images by IDs', {
        component: 'VirtualImageIdService',
        requestedCount: virtualImageIds.length,
        foundCount: data?.length || 0
      });

      return (data as VirtualImageRecord[]) || [];
    } catch (error) {
      logError('Failed to get virtual images', {
        component: 'VirtualImageIdService',
        idsCount: virtualImageIds.length,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Delete virtual image by ID
   */
  static async deleteVirtualImage(virtualImageId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('virtual_image')
        .delete()
        .eq('id', virtualImageId);

      if (error) throw error;

      logInfo('Deleted virtual image', {
        component: 'VirtualImageIdService',
        virtualImageId
      });
    } catch (error) {
      logError('Failed to delete virtual image', {
        component: 'VirtualImageIdService',
        virtualImageId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get virtual images for user with pagination
   */
  static async getUserVirtualImages(
    userId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<{
    images: VirtualImageRecord[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      // Get total count
      const { count, error: countError } = await supabase
        .from('virtual_image')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) throw countError;

      // Get paginated data
      const { data, error } = await supabase
        .from('virtual_image')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const total = count || 0;
      const hasMore = offset + limit < total;

      logDebug('Retrieved user virtual images', {
        component: 'VirtualImageIdService',
        userId,
        limit,
        offset,
        returnedCount: data?.length || 0,
        total,
        hasMore
      });

      return {
        images: (data as VirtualImageRecord[]) || [],
        total,
        hasMore
      };
    } catch (error) {
      logError('Failed to get user virtual images', {
        component: 'VirtualImageIdService',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get NSFW virtual image IDs for user
   */
  static async getNsfwImageIds(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('virtual_image')
        .select('id')
        .eq('user_id', userId)
        .eq('isflagged', true);

      if (error) throw error;

      const imageIds = data?.map(row => row.id) || [];

      logDebug('Retrieved NSFW image IDs', {
        component: 'VirtualImageIdService',
        userId,
        count: imageIds.length
      });

      return imageIds;
    } catch (error) {
      logError('Failed to get NSFW image IDs', {
        component: 'VirtualImageIdService',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Batch update multiple virtual images by ID
   */
  static async batchUpdateVirtualImages(updates: UpdateVirtualImageRequest[]): Promise<void> {
    try {
      // Process updates in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(update => this.updateVirtualImage(update))
        );
      }

      logInfo('Completed batch update of virtual images', {
        component: 'VirtualImageIdService',
        totalUpdates: updates.length
      });
    } catch (error) {
      logError('Failed to batch update virtual images', {
        component: 'VirtualImageIdService',
        updatesCount: updates.length,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
