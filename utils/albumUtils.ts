import { supabase } from './supabase';
import { Album, SortSession } from '../types';
import { PhotoLoader } from './photoLoader';

// Helper function to generate a UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class AlbumUtils {
  /**
   * Ensure the "All Photos" album exists and is up to date
   */
  static async ensureAllPhotosAlbumExists(selectedFolders: string[]): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, skipping All Photos album creation');
        return;
      }

      // Check if "All Photos" is in selected folders
      if (!selectedFolders.includes('all_photos')) {
        console.log('All Photos not in selected folders, skipping');
        return;
      }

      // Load existing albums
      const { data: existingAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_all_photos_album', true)
        .limit(1);

      if (loadError) {
        console.error('Error loading existing All Photos album:', loadError);
        return;
      }

      // Load all photo IDs
      const allPhotoIds = await PhotoLoader.loadAllPhotoIds();
      
      if (allPhotoIds.length === 0) {
        console.log('No photos found, skipping All Photos album');
        return;
      }

      const imageIds = allPhotoIds.map(photo => photo.id);
      const thumbnail = allPhotoIds[0]?.uri || '';

      if (existingAlbums && existingAlbums.length > 0) {
        // Update existing "All Photos" album
        const existingAlbum = existingAlbums[0];
        
        // Check if update is needed
        const needsUpdate = 
          existingAlbum.count !== imageIds.length ||
          JSON.stringify(existingAlbum.image_ids?.sort()) !== JSON.stringify(imageIds.sort());

        if (needsUpdate) {
          const { error: updateError } = await supabase
            .from('albums')
            .update({
              image_ids: imageIds,
              count: imageIds.length,
              thumbnail: thumbnail,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbum.id);

          if (updateError) {
            console.error('Error updating All Photos album:', updateError);
          } else {
            console.log(`Updated All Photos album with ${imageIds.length} photos`);
          }
        }
      } else {
        // Create new "All Photos" album
        const newAlbum = {
          id: generateUUID(),
          user_id: user.id,
          name: 'All Photos',
          image_ids: imageIds,
          tags: ['all', 'photos', 'device'],
          thumbnail: thumbnail,
          count: imageIds.length,
          is_locked: false,
          is_all_photos_album: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
          .from('albums')
          .insert([newAlbum]);

        if (insertError) {
          console.error('Error creating All Photos album:', insertError);
        } else {
          console.log(`Created All Photos album with ${imageIds.length} photos`);
        }
      }
    } catch (error) {
      console.error('Error ensuring All Photos album exists:', error);
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
        .filter(album => !album.isAllPhotosAlbum)
        .map(album => ({
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
   * Load albums from Supabase database
   */
  static async loadAlbums(): Promise<Album[]> {
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

      return (data || []).map(album => ({
        id: album.id,
        name: album.name,
        imageIds: album.image_ids || [],
        tags: album.tags || [],
        createdAt: new Date(album.created_at).getTime(),
        isLocked: album.is_locked || false,
        thumbnail: album.thumbnail || '',
        count: album.count || 0,
        isAllPhotosAlbum: album.is_all_photos_album || false,
      }));
    } catch (error) {
      console.error('Error loading albums from Supabase:', error);
      return [];
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

  /**
   * Save a sort session to Supabase database
   */
  static async saveSortSession(session: SortSession): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const sessionToInsert = {
        id: session.id,
        user_id: user.id,
        prompt: session.prompt,
        results: session.results,
        processing_time: session.processingTime,
        created_at: new Date(session.timestamp).toISOString(),
      };

      const { error } = await supabase
        .from('sort_sessions')
        .insert([sessionToInsert]);

      if (error) {
        throw error;
      }

      // Keep only the last 50 sessions for this user
      const { data: sessions, error: selectError } = await supabase
        .from('sort_sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(50, 1000);

      if (selectError) {
        console.error('Error fetching old sessions:', selectError);
        return;
      }

      if (sessions && sessions.length > 0) {
        const sessionIdsToDelete = sessions.map(s => s.id);
        const { error: deleteError } = await supabase
          .from('sort_sessions')
          .delete()
          .in('id', sessionIdsToDelete);

        if (deleteError) {
          console.error('Error deleting old sessions:', deleteError);
        }
      }
    } catch (error) {
      console.error('Error saving sort session to Supabase:', error);
      throw error;
    }
  }

  /**
   * Load sort sessions from Supabase database
   */
  static async loadSortSessions(): Promise<SortSession[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('User not authenticated, returning empty sessions');
        return [];
      }

      const { data, error } = await supabase
        .from('sort_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      return (data || []).map(session => ({
        id: session.id,
        prompt: session.prompt,
        timestamp: new Date(session.created_at).getTime(),
        results: session.results,
        processingTime: session.processing_time || 0,
      }));
    } catch (error) {
      console.error('Error loading sort sessions from Supabase:', error);
      return [];
    }
  }

  /**
   * Get smart albums with improved defaults
   */
  static async getSmartAlbums(): Promise<Album[]> {
    try {
      const albums = await this.loadAlbums();
      
      // If user has albums, return them
      if (albums.length > 0) {
        return albums;
      }

      // For new users, create default smart albums
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        // Return empty array if not authenticated
        return [];
      }

      const defaultAlbums: Album[] = [
        {
          id: generateUUID(),
          name: 'Documents & Receipts',
          imageIds: [],
          tags: ['receipt', 'bill', 'invoice', 'document', 'text'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Travel & Adventures',
          imageIds: [],
          tags: ['travel', 'vacation', 'trip', 'adventure', 'landscape'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Screenshots & Apps',
          imageIds: [],
          tags: ['screenshot', 'screen', 'app', 'interface'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Food & Dining',
          imageIds: [],
          tags: ['food', 'meal', 'restaurant', 'cooking', 'dining'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'People & Portraits',
          imageIds: [],
          tags: ['people', 'portrait', 'selfie', 'family', 'friends'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Nature & Outdoors',
          imageIds: [],
          tags: ['nature', 'outdoor', 'landscape', 'trees', 'sky', 'animals'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
      ];
      
      // Save default albums to database
      await this.saveAlbums(defaultAlbums);
      return defaultAlbums;
    } catch (error) {
      console.error('Error getting smart albums:', error);
      return [];
    }
  }
}