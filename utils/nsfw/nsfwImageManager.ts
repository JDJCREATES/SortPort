import { supabase } from '../supabase';

export interface NsfwImageRecord {
  id: string;
  user_id: string;
  image_id: string;
  folder_id: string;
  is_nsfw: boolean;
  moderation_labels: any;
  created_at: string;
  updated_at: string;
}

export class NsfwImageManager {
  /**
   * Store NSFW image IDs in the database with proper error handling
   */
  static async storeNsfwImageIds(nsfwImageIds: string[]): Promise<void> {
    if (!nsfwImageIds || nsfwImageIds.length === 0) {
      console.log('🔒 No NSFW image IDs to store');
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.warn('🔒 User not authenticated, cannot store NSFW image IDs');
        return;
      }

      console.log(`🔒 Storing ${nsfwImageIds.length} NSFW image IDs for user ${user.id}`);

      // Prepare records for insertion
      const nsfwRecords = nsfwImageIds.map((imageId: string) => ({
        user_id: user.id,
        image_id: imageId,
        folder_id: 'unknown',
        is_nsfw: true,
        moderation_labels: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Insert with conflict resolution
      const { error } = await supabase
        .from('moderated_images')
        .upsert(nsfwRecords, { 
          onConflict: 'user_id,image_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('❌ Error storing NSFW image IDs:', error);
        throw new Error(`Failed to store NSFW image IDs: ${error.message}`);
      }

      console.log(`✅ Successfully stored ${nsfwImageIds.length} NSFW image IDs`);

    } catch (error) {
      console.error('❌ Error in storeNsfwImageIds:', error);
      throw error;
    }
  }

  /**
   * Get NSFW image IDs from database
   */
  static async getNsfwImageIds(): Promise<string[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 User not authenticated, returning empty NSFW list');
        return [];
      }

      console.log('🔒 Fetching NSFW image IDs from database...');

      const { data, error } = await supabase
        .from('moderated_images')
        .select('image_id')
        .eq('user_id', user.id)
        .eq('is_nsfw', true);

      if (error) {
        console.error('❌ Error fetching NSFW image IDs:', error);
        return [];
      }

      const imageIds = data?.map((row: any) => row.image_id) || [];
      console.log(`🔒 Fetched ${imageIds.length} NSFW image IDs from database`);
      return imageIds;

    } catch (error) {
      console.error('❌ Error in getNsfwImageIds:', error);
      return [];
    }
  }

  /**
   * Filter NSFW images from a collection with performance optimization
   */
  static async filterNsfwImages<T extends { id: string }>(
    items: T[], 
    showModerated: boolean = false
  ): Promise<T[]> {
    if (showModerated || !items || items.length === 0) {
      return items;
    }

    try {
      const nsfwImageIds = await this.getNsfwImageIds();
      if (nsfwImageIds.length === 0) {
        return items;
      }

      const nsfwSet = new Set(nsfwImageIds);
      const filteredItems = items.filter((item: T) => !nsfwSet.has(item.id));
      
      const filteredCount = items.length - filteredItems.length;
      if (filteredCount > 0) {
        console.log(`🔒 Filtered ${filteredCount} NSFW items from ${items.length} total`);
      }
      
      return filteredItems;
    } catch (error) {
      console.error('❌ Error filtering NSFW images:', error);
      return items; // Return all items if filtering fails
    }
  }

  /**
   * Remove images from NSFW status (user approval)
   */
  static async removeFromNsfwStatus(imageIds: string[]): Promise<void> {
    if (!imageIds || imageIds.length === 0) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      console.log(`🔒 Removing ${imageIds.length} images from NSFW status`);

      // Update database
      const { error } = await supabase
        .from('moderated_images')
        .update({
          is_nsfw: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .in('image_id', imageIds);

      if (error) {
        console.error('❌ Error removing NSFW status:', error);
        throw error;
      }

      console.log(`✅ Successfully removed ${imageIds.length} images from NSFW status`);

    } catch (error) {
      console.error('❌ Error in removeFromNsfwStatus:', error);
      throw error;
    }
  }

  /**
   * Get moderated images for a specific user
   */
  static async getModeratedImages(userId?: string): Promise<NsfwImageRecord[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, returning empty moderated images');
        return [];
      }

      const targetUserId = userId || user.id;

      const { data, error } = await supabase
        .from('moderated_images')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_nsfw', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading moderated images:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getModeratedImages:', error);
      return [];
    }
  }

  /**
   * Get moderated folders for a specific user
   */
  static async getModeratedFolders(userId?: string): Promise<any[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, returning empty moderated folders');
        return [];
      }

      const targetUserId = userId || user.id;

      const { data, error } = await supabase
        .from('moderated_folders')
        .select('*')
        .eq('user_id', targetUserId)
        .order('last_scanned_at', { ascending: false });

      if (error) {
        console.error('Error loading moderated folders:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getModeratedFolders:', error);
      return [];
    }
  }

  /**
   * Get statistics about moderated content
   */
  static async getModerationStats(): Promise<{
    totalModeratedImages: number;
    totalScannedFolders: number;
    lastScanDate: string | null;
    nsfwByFolder: { [folderId: string]: number };
  }> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return {
          totalModeratedImages: 0,
          totalScannedFolders: 0,
          lastScanDate: null,
          nsfwByFolder: {},
        };
      }

      // Get moderated images count
      const { data: moderatedImages, error: imagesError } = await supabase
        .from('moderated_images')
        .select('folder_id')
        .eq('user_id', user.id)
        .eq('is_nsfw', true);

      if (imagesError) {
        console.error('Error loading moderated images stats:', imagesError);
      }

      // Get scanned folders
      const { data: scannedFolders, error: foldersError } = await supabase
        .from('moderated_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('last_scanned_at', { ascending: false });

      if (foldersError) {
        console.error('Error loading scanned folders stats:', foldersError);
      }

      // Calculate stats
      const totalModeratedImages = moderatedImages?.length || 0;
      const totalScannedFolders = scannedFolders?.length || 0;
      const lastScanDate = scannedFolders?.[0]?.last_scanned_at || null;

      // Count NSFW images by folder
      const nsfwByFolder: { [folderId: string]: number } = {};
      moderatedImages?.forEach((image: any) => {
        const folderId = image.folder_id;
        nsfwByFolder[folderId] = (nsfwByFolder[folderId] || 0) + 1;
      });

      return {
        totalModeratedImages,
        totalScannedFolders,
        lastScanDate,
        nsfwByFolder,
      };

    } catch (error) {
      console.error('❌ getModerationStats: Error:', error);
      return {
        totalModeratedImages: 0,
        totalScannedFolders: 0,
        lastScanDate: null,
        nsfwByFolder: {},
      };
    }
  }
}