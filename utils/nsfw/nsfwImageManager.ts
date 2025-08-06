import { supabase } from '../supabase';

export interface NsfwImageRecord {
  id: string;
  user_id: string;
  image_id: string;
  isflagged: boolean;
  nsfw_score: number;
  rekognition_data: any;
  created_at: string;
  updated_at: string;
}

export class NsfwImageManager {
  /**
   * Store NSFW image IDs in the virtual_image table with proper error handling
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

      console.log(`🔒 Updating ${nsfwImageIds.length} NSFW image flags for user ${user.id}`);

      // Update existing virtual_image records to mark as NSFW
      const { error } = await supabase
        .from('virtual_image')
        .update({
          isflagged: true,
          nsfw_score: 0.9, // Default high confidence for manual flagging
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .in('id', nsfwImageIds);

      if (error) {
        console.error('❌ Error updating NSFW image flags:', error);
        throw new Error(`Failed to update NSFW image flags: ${error.message}`);
      }

      console.log(`✅ Successfully updated ${nsfwImageIds.length} NSFW image flags`);

    } catch (error) {
      console.error('❌ Error in storeNsfwImageIds:', error);
      throw error;
    }
  }

  /**
   * Get NSFW image IDs from virtual_image table
   */
  static async getNsfwImageIds(): Promise<string[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 User not authenticated, returning empty NSFW list');
        return [];
      }

      console.log('🔒 Fetching NSFW image IDs from virtual_image table...');

      const { data, error } = await supabase
        .from('virtual_image')
        .select('id')
        .eq('user_id', user.id)
        .eq('isflagged', true);

      if (error) {
        console.error('❌ Error fetching NSFW image IDs:', error);
        return [];
      }

      const imageIds = data?.map((row: any) => row.id) || [];
      console.log(`🔒 Fetched ${imageIds.length} NSFW image IDs from virtual_image table`);
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
   * Remove images from NSFW status (user approval) in virtual_image table
   */
  static async removeFromNsfwStatus(imageIds: string[]): Promise<void> {
    if (!imageIds || imageIds.length === 0) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      console.log(`🔒 Removing ${imageIds.length} images from NSFW status`);

      // Update virtual_image table
      const { error } = await supabase
        .from('virtual_image')
        .update({
          isflagged: false,
          nsfw_score: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .in('id', imageIds);

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
   * Get moderated images from virtual_image table
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
        .from('virtual_image')
        .select('id, user_id, id as image_id, isflagged, nsfw_score, rekognition_data, created_at, updated_at')
        .eq('user_id', targetUserId)
        .eq('isflagged', true)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading moderated images:', error);
        return [];
      }

      return data?.map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        image_id: item.id, // In virtual_image, id is the image_id
        isflagged: item.isflagged,
        nsfw_score: item.nsfw_score || 0,
        rekognition_data: item.rekognition_data,
        created_at: item.created_at,
        updated_at: item.updated_at
      })) || [];
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
   * Get statistics about moderated content from virtual_image table
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

      // Get moderated images count from virtual_image
      const { data: moderatedImages, error: imagesError } = await supabase
        .from('virtual_image')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .eq('isflagged', true);

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
      const lastScanDate = scannedFolders?.[0]?.last_scanned_at || 
                          (moderatedImages && moderatedImages.length > 0 ? 
                           moderatedImages.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0].updated_at : 
                           null);

      // Folder-based counting not available in current virtual_image schema
      const nsfwByFolder: { [folderId: string]: number } = {};

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