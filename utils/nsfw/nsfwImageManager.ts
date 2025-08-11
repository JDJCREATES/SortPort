import { supabase } from '../supabase';
import { VirtualImageIdService } from '../shared/VirtualImageIdService'; // For upload operations only

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
   * Store NSFW image IDs during upload operations
   * Note: Uses VirtualImageIdService for upload-time operations only
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

      // Use clean ID-based batch updates
      const updates = nsfwImageIds.map(imageId => ({
        virtualImageId: imageId,
        isNsfw: true
      }));

      await VirtualImageIdService.batchUpdateVirtualImages(updates);

      console.log(`✅ Successfully updated ${nsfwImageIds.length} NSFW image flags using ID-based service`);

    } catch (error) {
      console.error('❌ Error in storeNsfwImageIds:', error);
      throw error;
    }
  }

  /**
   * Get NSFW image paths from virtual_image table (for device photo filtering)
   */
  static async getNsfwImagePaths(): Promise<string[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 User not authenticated, returning empty NSFW list');
        return [];
      }

      console.log('🔒 Fetching NSFW image paths from virtual_image table...');

      // Add a small retry mechanism to handle race conditions with virtual-image-bridge
      let attempts = 0;
      const maxAttempts = 3;
      let data = null;
      
      while (attempts < maxAttempts) {
        const { data: queryData, error } = await supabase
          .from('virtual_image')
          .select('original_path, id')
          .eq('user_id', user.id)
          .eq('isflagged', true);

        if (error) {
          console.error('❌ Error fetching NSFW image paths:', error);
          return [];
        }

        data = queryData;
        
        // If we got some results or this is the last attempt, proceed
        if (data && data.length > 0 || attempts === maxAttempts - 1) {
          break;
        }
        
        // Wait briefly before retrying (for race condition with virtual-image-bridge)
        if (attempts < maxAttempts - 1) {
          console.log(`🔒 No NSFW records found, retrying in 1s... (attempt ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        attempts++;
      }

      const imagePaths = data?.map((row: any) => row.original_path).filter(path => path) || [];
      console.log(`🔒 Fetched ${imagePaths.length} NSFW image paths from virtual_image table (${data?.length || 0} total records)`);
      
      // Debug: Log sample paths if filtering might fail
      if (data && data.length > 0 && imagePaths.length < data.length) {
        console.warn(`⚠️ Some virtual_image records missing original_path: ${data.length - imagePaths.length} out of ${data.length}`);
      }
      
      return imagePaths;

    } catch (error) {
      console.error('❌ Error in getNsfwImagePaths:', error);
      return [];
    }
  }

  /**
   * Get NSFW image IDs from virtual_image table (for client-side album filtering)
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

      const imageIds = data?.map(row => row.id) || [];
      console.log(`🔒 Fetched ${imageIds.length} NSFW image IDs from virtual_image table`);
      return imageIds;

    } catch (error) {
      console.error('❌ Error in getNsfwImageIds:', error);
      return [];
    }
  }

  /**
   * Filter NSFW photos from PhotoLoader results by comparing URIs
   */
  static async filterNsfwPhotos<T extends { id: string; uri: string }>(
    photos: T[], 
    showModerated: boolean = false
  ): Promise<T[]> {
    if (showModerated || !photos || photos.length === 0) {
      return photos;
    }

    try {
      const nsfwImagePaths = await this.getNsfwImagePaths();
      if (nsfwImagePaths.length === 0) {
        console.log('🔒 No NSFW paths found in database, returning all photos');
        return photos;
      }

      // ...removed verbose debug logs...

      // Create normalized versions for comparison (handle potential URI encoding differences)
      const nsfwSet = new Set(nsfwImagePaths);
      
      // Also create a set of normalized paths (decoded URIs) for better matching
      const nsfwNormalizedSet = new Set(
        nsfwImagePaths.map(path => {
          try {
            return decodeURIComponent(path);
          } catch {
            return path;
          }
        })
      );

      const filteredPhotos = photos.filter((photo: T) => {
        // Compare using URI, not ID
        const directMatch = nsfwSet.has(photo.uri);
        if (directMatch) return false;
        
        // Try normalized match
        try {
          const normalizedPhotoUri = decodeURIComponent(photo.uri);
          if (nsfwNormalizedSet.has(normalizedPhotoUri)) return false;
        } catch {
          // Ignore decoding errors
        }
        
        return true;
      });
      
      const filteredCount = photos.length - filteredPhotos.length;
      console.log(`🔒 NSFW filter: ${filteredCount} of ${photos.length} photos removed.`);
      
      return filteredPhotos;
    } catch (error) {
      console.error('❌ Error filtering NSFW photos by URI comparison:', error);
      return photos; // Return all photos if filtering fails
    }
  }

  /**
   * Filter NSFW images from device photo collection by original_path
   */
  static async filterNsfwPhotosByPath<T extends { id: string }>(
    photos: T[], 
    showModerated: boolean = false
  ): Promise<T[]> {
    if (showModerated || !photos || photos.length === 0) {
      return photos;
    }

    try {
      const nsfwImagePaths = await this.getNsfwImagePaths();
      if (nsfwImagePaths.length === 0) {
        console.log('🔒 No NSFW paths found in database, returning all photos');
        return photos;
      }

      // Debug: Log sample paths for comparison
      if (photos.length > 0 && nsfwImagePaths.length > 0) {
        console.log('🔒 Sample photo ID format:', photos[0].id.substring(0, 80) + '...');
        console.log('🔒 Sample NSFW path format:', nsfwImagePaths[0].substring(0, 80) + '...');
        
        // Check if paths are using different URI schemes
        const photoScheme = photos[0].id.split(':')[0];
        const nsfwScheme = nsfwImagePaths[0].split(':')[0];
        if (photoScheme !== nsfwScheme) {
          console.warn(`⚠️ Path scheme mismatch detected: photos use "${photoScheme}://" but NSFW paths use "${nsfwScheme}://"`);
        }
      }

      // Create normalized versions for comparison (handle potential URI encoding differences)
      const nsfwSet = new Set(nsfwImagePaths);
      
      // Also create a set of normalized paths (decoded URIs) for better matching
      const nsfwNormalizedSet = new Set(
        nsfwImagePaths.map(path => {
          try {
            return decodeURIComponent(path);
          } catch {
            return path;
          }
        })
      );

      const filteredPhotos = photos.filter((photo: T) => {
        const directMatch = nsfwSet.has(photo.id);
        if (directMatch) return false;
        
        // Try normalized match
        try {
          const normalizedPhotoId = decodeURIComponent(photo.id);
          if (nsfwNormalizedSet.has(normalizedPhotoId)) return false;
        } catch {
          // Ignore decoding errors
        }
        
        return true;
      });
      
      const filteredCount = photos.length - filteredPhotos.length;
      if (filteredCount > 0) {
        console.log(`🔒 Filtered ${filteredCount} NSFW photos from ${photos.length} total by original_path`);
      } else {
        console.warn(`⚠️ No photos filtered - possible path mismatch. ${nsfwImagePaths.length} NSFW paths vs ${photos.length} photos`);
        
        // Additional debugging for path mismatches
        if (nsfwImagePaths.length > 0 && photos.length > 0) {
          console.log('🔍 First few photo IDs for comparison:');
          photos.slice(0, 3).forEach((photo, i) => {
            console.log(`  Photo ${i}: ${photo.id}`);
          });
          console.log('🔍 First few NSFW paths for comparison:');
          nsfwImagePaths.slice(0, 3).forEach((path, i) => {
            console.log(`  NSFW ${i}: ${path}`);
          });
        }
      }
      
      return filteredPhotos;
    } catch (error) {
      console.error('❌ Error filtering NSFW photos by path:', error);
      return photos; // Return all photos if filtering fails
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