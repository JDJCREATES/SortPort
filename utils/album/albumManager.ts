import { supabase } from '../supabase';
import { Album } from '../../types';
import { NsfwImageManager } from '../nsfw/nsfwImageManager';

interface DatabaseAlbum {
  id: string;
  name: string;
  image_ids: string[];
  tags: string[];
  created_at: string;
  is_locked: boolean;
  thumbnail: string | null;
  count: number;
  is_all_photos_album: boolean;
  is_moderated_album: boolean;
}

export class AlbumManager {
  /**
   * Load albums with NSFW filtering support
   */
  static async loadAlbums(showModerated: boolean = false): Promise<Album[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, returning empty albums');
        return [];
      }

      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (!data) return [];

      // Filter out moderated albums based on showModerated setting
      let filteredAlbums = data as DatabaseAlbum[];
      if (!showModerated) {
        filteredAlbums = data.filter((album: DatabaseAlbum) => !album.is_moderated_album);
      }

      // Convert to Album type and filter image IDs if needed
      const albums: Album[] = await Promise.all(
        filteredAlbums.map(async (album: DatabaseAlbum) => {
          let imageIds = album.image_ids || [];
          
          // Filter NSFW images from regular albums (not moderated albums)
          if (!album.is_moderated_album && !showModerated) {
            const filteredImages = await NsfwImageManager.filterNsfwImages(
              imageIds.map((id: string) => ({ id })), 
              showModerated
            );
            imageIds = filteredImages.map((img: any) => img.id);
          }

          return {
            id: album.id,
            name: album.name,
            imageIds: imageIds,
            tags: album.tags || [],
            createdAt: new Date(album.created_at).getTime(),
            isLocked: album.is_locked || false,
            thumbnail: album.thumbnail || '',
            count: imageIds.length, // Use filtered count
            isAllPhotosAlbum: album.is_all_photos_album || false,
            isModeratedAlbum: album.is_moderated_album || false,
          };
        })
      );

      return albums;
    } catch (error) {
      console.error('Error loading albums from Supabase:', error);
      return [];
    }
  }

  /**
   * Save albums to Supabase database
   */
  static async saveAlbums(albums: Album[]): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Delete existing albums for this user (except All Photos album)
      const { error: deleteError } = await supabase
        .from('albums')
        .delete()
        .eq('user_id', user.id)
        .eq('is_all_photos_album', false);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new albums (excluding All Photos album)
      const albumsToInsert = albums
        .filter((album: Album) => !album.isAllPhotosAlbum)
        .map((album: Album) => ({
          id: album.id,
          user_id: user.id,
          name: album.name,
          image_ids: album.imageIds,
          tags: album.tags,
          thumbnail: album.thumbnail || null,
          count: album.count,
          is_locked: album.isLocked || false,
          is_all_photos_album: false,
          created_at: new Date(album.createdAt).toISOString(),
          updated_at: new Date().toISOString(),
        }));

      if (albumsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('albums')
          .insert(albumsToInsert);

        if (insertError) {
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Error saving albums to Supabase:', error);
      throw error;
    }
  }

  /**
   * Add a new album to Supabase database
   */
  static async addAlbum(album: Album): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const albumToInsert = {
        id: album.id,
        user_id: user.id,
        name: album.name,
        image_ids: album.imageIds,
        tags: album.tags,
        thumbnail: album.thumbnail || null,
        count: album.count,
        is_locked: album.isLocked || false,
        is_all_photos_album: album.isAllPhotosAlbum || false,
        is_moderated_album: album.isModeratedAlbum || false,
        created_at: new Date(album.createdAt).toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('albums')
        .insert([albumToInsert]);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error adding album to Supabase:', error);
      throw error;
    }
  }

  /**
   * Remove an album from Supabase database
   */
  static async removeAlbum(albumId: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('albums')
        .delete()
        .eq('id', albumId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error removing album from Supabase:', error);
      throw error;
    }
  }

  /**
   * Update an album in Supabase database
   */
  static async updateAlbum(albumId: string, updates: Partial<Album>): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.imageIds !== undefined) updateData.image_ids = updates.imageIds;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      if (updates.thumbnail !== undefined) updateData.thumbnail = updates.thumbnail;
      if (updates.count !== undefined) updateData.count = updates.count;
      if (updates.isLocked !== undefined) updateData.is_locked = updates.isLocked;
      if (updates.isModeratedAlbum !== undefined) updateData.is_moderated_album = updates.isModeratedAlbum;

      const { error } = await supabase
        .from('albums')
        .update(updateData)
        .eq('id', albumId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error updating album in Supabase:', error);
      throw error;
    }
  }
}