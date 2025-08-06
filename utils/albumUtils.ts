import { Album, SortSession } from '../types';
import { AlbumManager } from './album/albumManager';
import { AllPhotosAlbumManager } from './album/allPhotosAlbumManager';
import { ModeratedAlbumManager } from './album/moderatedAlbumManager';
import { SortSessionManager } from './album/sortSessionManager';
import { SmartAlbumManager } from './album/smartAlbumManager';
import { NsfwImageManager } from './nsfw/nsfwImageManager';
import { NsfwImageCache } from './cache/nsfwImageCache';
import { supabase } from './supabase';

/**
 * Main AlbumUtils class that orchestrates all album-related operations
 * This class serves as a facade for the modular album management system
 */
export class AlbumUtils {
  // ===== NSFW Management =====
  
  /**
   * Get NSFW image IDs with caching for performance
   */
  static async getNsfwImageIds(): Promise<string[]> {
    // Check cache first
    const cachedIds = NsfwImageCache.get();
    if (cachedIds) {
      return Array.from(cachedIds);
    }

    // Fetch from database and update cache
    const imageIds = await NsfwImageManager.getNsfwImageIds();
    NsfwImageCache.set(imageIds);
    return imageIds;
  }

  /**
   * Filter NSFW images from a collection with performance optimization
   */
  static async filterNsfwImages<T extends { id: string }>(
    items: T[], 
    showModerated: boolean = false
  ): Promise<T[]> {
    return NsfwImageManager.filterNsfwImages(items, showModerated);
  }

  /**
   * Store NSFW image IDs in the database with proper error handling
   */
  static async storeNsfwImageIds(nsfwImageIds: string[]): Promise<void> {
    await NsfwImageManager.storeNsfwImageIds(nsfwImageIds);
    // Update cache
    nsfwImageIds.forEach((id: string) => NsfwImageCache.add(id));
  }

  /**
   * Remove images from NSFW status (user approval)
   */
  static async removeFromNsfwStatus(imageIds: string[]): Promise<void> {
    await NsfwImageManager.removeFromNsfwStatus(imageIds);
    // Update cache
    imageIds.forEach((id: string) => NsfwImageCache.remove(id));
  }

  /**
   * Clear NSFW cache (useful for testing or manual refresh)
   */
  static async clearNsfwCache(): Promise<void> {
    try {
      // Clear the NSFW image cache
      NsfwImageCache.clear();
   
    } catch (error) {
      throw error;
    }
  }

  // ===== Album Management =====

  /**
   * Load albums from Supabase database with NSFW filtering
   */
  static async loadAlbums(): Promise<Album[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, returning empty albums');
        return [];
      }

      console.log('🔍 Loading albums from database for user:', user.id);

      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Database error loading albums:', error);
        throw error;
      }

      console.log('📊 Raw database results:', {
        totalFromDB: data?.length || 0,
        albums: data?.map(album => ({
          id: album.id,
          name: album.name,
          is_moderated_album: album.is_moderated_album,
          count: album.count
        })) || []
      });

      const processedAlbums = (data || []).map(album => ({
        id: album.id,
        name: album.name,
        imageIds: album.image_ids || [],
        tags: album.tags || [],
        createdAt: new Date(album.created_at).getTime(),
        isLocked: album.is_locked || false,
        thumbnail: album.thumbnail || '',
        count: album.count || 0,
        isAllPhotosAlbum: album.is_all_photos_album || false,
        isModeratedAlbum: album.is_moderated_album || false, // ✅ Make sure this mapping is correct
      }));

      console.log('📊 Processed albums:', {
        totalProcessed: processedAlbums.length,
        moderatedCount: processedAlbums.filter(a => a.isModeratedAlbum).length,
        regularCount: processedAlbums.filter(a => !a.isModeratedAlbum).length,
        albums: processedAlbums.map(a => ({
          id: a.id,
          name: a.name,
          isModeratedAlbum: a.isModeratedAlbum,
          count: a.count
        }))
      });

      return processedAlbums;
    } catch (error) {
      console.error('Error loading albums from Supabase:', error);
      return [];
    }
  }

  /**
   * Save albums to Supabase database
   */
  static async saveAlbums(albums: Album[]): Promise<void> {
    return AlbumManager.saveAlbums(albums);
  }

  /**
   * Add a new album to Supabase database
   */
  static async addAlbum(album: Album): Promise<void> {
    return AlbumManager.addAlbum(album);
  }

  /**
   * Remove an album from Supabase database
   */
  static async removeAlbum(albumId: string): Promise<void> {
    return AlbumManager.removeAlbum(albumId);
  }

  /**
   * Update an album in Supabase database
   */
  static async updateAlbum(albumId: string, updates: Partial<Album>): Promise<void> {
    return AlbumManager.updateAlbum(albumId, updates);
  }

  // ===== All Photos Album Management =====

  /**
   * Ensure the "All Photos" album exists and is up to date
   */
  static async ensureAllPhotosAlbumExists(showModerated: boolean = false): Promise<void> {
    return AllPhotosAlbumManager.ensureAllPhotosAlbumExists(showModerated);
  }

  // ===== Moderated Album Management =====

  /**
   * Create categorized moderated albums based on moderation labels
   */
  static async createCategorizedModeratedAlbums(
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: any }
  ): Promise<void> {
    return ModeratedAlbumManager.createCategorizedModeratedAlbums(nsfwImages, moderationResults);
  }

  /**
   * Update moderated_folders table to track which folders have been scanned
   */
  static async updateModeratedFolders(
    folderIds: string[], 
    folderNames: { [folderId: string]: string }
  ): Promise<void> {
    return ModeratedAlbumManager.updateModeratedFolders(folderIds, folderNames);
  }

  // ===== Sort Session Management =====

  /**
   * Save a sort session to Supabase database
   */
  static async saveSortSession(session: SortSession): Promise<void> {
    return SortSessionManager.saveSortSession(session);
  }

  /**
   * Load sort sessions from Supabase database
   */
  static async loadSortSessions(): Promise<SortSession[]> {
    return SortSessionManager.loadSortSessions();
  }

  // ===== Smart Album Management =====

  /**
   * Get smart albums with improved defaults
   */
  static async getSmartAlbums(): Promise<Album[]> {
    return SmartAlbumManager.getSmartAlbums();
  }

  // ===== Legacy Methods (for backward compatibility) =====

  /**
   * @deprecated Use createCategorizedModeratedAlbums instead
   */
  static async ensureModeratedContentAlbumExists(nsfwImages: any[]): Promise<void> {
    console.warn('⚠️ ensureModeratedContentAlbumExists is deprecated. Use createCategorizedModeratedAlbums instead.');
    if (nsfwImages && nsfwImages.length > 0) {
      const mockModerationResults: { [imageId: string]: any } = {};
      nsfwImages.forEach((img: any) => {
        mockModerationResults[img.id] = {
          confidence_score: 0.8,
          moderation_labels: [],
        };
      });
      return this.createCategorizedModeratedAlbums(nsfwImages, mockModerationResults);
    }
  }

  /**
   * @deprecated Use removeFromNsfwStatus instead
   */
  static async removeFromModeratedImages(imageIds: string[]): Promise<void> {
    console.warn('⚠️ removeFromModeratedImages is deprecated. Use removeFromNsfwStatus instead.');
    return this.removeFromNsfwStatus(imageIds);
  }

  // ===== Additional Helper Methods =====

  /**
   * Get moderated images for a specific user
   */
  static async getModeratedImages(userId?: string): Promise<any[]> {
    return NsfwImageManager.getModeratedImages(userId);
  }

  /**
   * Get moderated folders for a specific user
   */
  static async getModeratedFolders(userId?: string): Promise<any[]> {
    return NsfwImageManager.getModeratedFolders(userId);
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
    return NsfwImageManager.getModerationStats();
  }

  /**
   * Get moderated albums with their category information
   */
  static async getModeratedAlbumsWithCategories(): Promise<Array<Album & {
    categoryInfo?: any;
    moderationStats?: any;
  }>> {
    try {
      const albums = await this.loadAlbums(); // Load with moderated content
      const moderatedAlbums = albums.filter((album: Album) => album.isModeratedAlbum);

      // Enhance each album with category information
      const enhancedAlbums = moderatedAlbums.map((album: Album) => {
        // Try to extract category from tags
        const categoryTag = album.tags?.find((tag: string) => 
          // This would need to be implemented based on your NsfwAlbumNaming utility
          tag.startsWith('category_')
        );

        return {
          ...album,
          categoryInfo: categoryTag ? { id: categoryTag } : null,
          moderationStats: {
            // These could be calculated from virtual_image table if needed
            averageConfidence: 0,
            topLabels: [],
          }
        };
      });

      return enhancedAlbums;
    } catch (error) {
      console.error('❌ getModeratedAlbumsWithCategories: Error:', error);
      return [];
    }
  }
}
