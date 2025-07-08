import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { Album, SortSession } from '../types';
import { PhotoLoader } from './photoLoader';
import { MediaStorage } from './mediaStorage';
import { NsfwAlbumNaming } from './moderation/nsfwAlbumNaming';

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
  static async ensureAllPhotosAlbumExists(): Promise<void> {
    try {
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('📁 ensureAllPhotosAlbumExists: User not authenticated, skipping');
        return;
      }
      

      // Load current settings to get selected folders
      const settings = await MediaStorage.loadSettings();
      const selectedFolders = settings.selectedFolders || ['all_photos'];
      console.log('📁 ensureAllPhotosAlbumExists: Selected folders:', selectedFolders);

      // Load existing albums
      const { data: existingAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_all_photos_album', true)
        .limit(1);

      if (loadError) {
        console.error('❌ ensureAllPhotosAlbumExists: Error loading existing album:', loadError);
        return;
      }

      // Load all photo IDs from the entire device
      const allPhotoIds = await PhotoLoader.loadAllPhotoIds(selectedFolders);
      console.log('📁 ensureAllPhotosAlbumExists: Loaded', allPhotoIds.length, 'photo IDs');
      
      // Always create/update the album, even if empty
      const imageIds = allPhotoIds.map(photo => photo.id);
      
      // Generate thumbnail for the first image if available
      let thumbnail: string | undefined;
      if (allPhotoIds.length > 0) {
        thumbnail = allPhotoIds[0].uri; // Simple and reliable approach
      }

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
              thumbnail: thumbnail || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbum.id);

          if (updateError) {
            console.error('❌ ensureAllPhotosAlbumExists: Error updating album:', updateError);
          } else {
            console.log(`✅ ensureAllPhotosAlbumExists: Updated album with ${imageIds.length} photos`);
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
          thumbnail: thumbnail || null,
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
          console.error('❌ ensureAllPhotosAlbumExists: Error creating album:', insertError);
        } else {
          console.log(`✅ ensureAllPhotosAlbumExists: Created album with ${imageIds.length} photos`);
        }
      }
    } catch (error) {
      console.error('❌ ensureAllPhotosAlbumExists: Error:', error);
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
        isModeratedAlbum: album.is_moderated_album || false,
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

  /**
   * Create or update moderated content album with NSFW images
   * Properly handles moderated_images and moderated_folders tables
   */
  static async ensureModeratedContentAlbumExists(nsfwImages: any[]): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 ensureModeratedContentAlbumExists: User not authenticated, skipping');
        return;
      }

      if (!nsfwImages || nsfwImages.length === 0) {
        console.log('🔒 ensureModeratedContentAlbumExists: No NSFW images provided');
        return;
      }

      console.log(`🔒 ensureModeratedContentAlbumExists: Processing ${nsfwImages.length} NSFW images`);

      // Extract image IDs from NSFW images
      const nsfwImageIds = nsfwImages.map(img => img.id);
      
      // Generate thumbnail from first NSFW image
      const thumbnail = nsfwImages.length > 0 ? nsfwImages[0].uri : null;

      // Check if moderated content album already exists
      const { data: existingAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_moderated_album', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (loadError) {
        console.error('❌ ensureModeratedContentAlbumExists: Error loading existing albums:', loadError);
        return;
      }

      let albumId: string;

      if (existingAlbums && existingAlbums.length > 0) {
        // Update existing moderated album
        const existingAlbum = existingAlbums[0];
        const existingImageIds = existingAlbum.image_ids || [];
        
        // Merge existing and new image IDs (remove duplicates)
        const mergedImageIds = [...new Set([...existingImageIds, ...nsfwImageIds])];
        
        // Only update if there are new images
        if (mergedImageIds.length > existingImageIds.length) {
          const { error: updateError } = await supabase
            .from('albums')
            .update({
              image_ids: mergedImageIds,
              count: mergedImageIds.length,
              thumbnail: thumbnail || existingAlbum.thumbnail,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbum.id);

          if (updateError) {
            console.error('❌ ensureModeratedContentAlbumExists: Error updating album:', updateError);
            return;
          } else {
            console.log(`✅ ensureModeratedContentAlbumExists: Updated moderated album with ${mergedImageIds.length} total images (${mergedImageIds.length - existingImageIds.length} new)`);
          }
        }
        
        albumId = existingAlbum.id;
      } else {
        // Create new moderated content album
        albumId = generateUUID();
        const newAlbum = {
          id: albumId,
          user_id: user.id,
          name: 'Moderated Content',
          image_ids: nsfwImageIds,
          tags: ['nsfw', 'moderated', 'flagged', 'sensitive'],
          thumbnail: thumbnail,
          count: nsfwImageIds.length,
          is_locked: true,
          is_all_photos_album: false,
          is_moderated_album: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
          .from('albums')
          .insert([newAlbum]);

        if (insertError) {
          console.error('❌ ensureModeratedContentAlbumExists: Error creating moderated album:', insertError);
          return;
        } else {
          console.log(`✅ ensureModeratedContentAlbumExists: Created new moderated album with ${nsfwImageIds.length} images`);
        }
      }

      // Insert records into moderated_images table
      await this.insertModeratedImages(user.id, nsfwImages);

    } catch (error) {
      console.error('❌ ensureModeratedContentAlbumExists: Error:', error);
    }
  }

  /**
   * Insert records into moderated_images table with proper schema
   */
  private static async insertModeratedImages(userId: string, nsfwImages: any[]): Promise<void> {
    try {
      // Prepare moderated image records according to your schema
      const moderatedImageRecords = nsfwImages.map(image => ({
        id: generateUUID(),
        user_id: userId,
        image_id: image.id,
        folder_id: image.folderId || 'unknown', // You might need to track this
        is_nsfw: true,
        moderation_labels: [], // Will be populated by the enhanced version
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Insert new moderated image records (handle duplicates)
      const { error: insertError } = await supabase
        .from('moderated_images')
        .upsert(moderatedImageRecords, { 
          onConflict: 'user_id,image_id',
          ignoreDuplicates: false // Update existing records
        });

      if (insertError) {
        console.error('❌ Error inserting moderated images:', insertError);
      } else {
        console.log(`✅ Inserted/updated ${moderatedImageRecords.length} moderated image records`);
      }

    } catch (error) {
      console.error('❌ insertModeratedImages: Error:', error);
    }
  }

  /**
   * Enhanced version that includes moderation results from AWS Rekognition
   */
  static async ensureModeratedContentAlbumExistsWithResults(
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: any }
  ): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 ensureModeratedContentAlbumExistsWithResults: User not authenticated, skipping');
        return;
      }

      if (!nsfwImages || nsfwImages.length === 0) {
        console.log('🔒 ensureModeratedContentAlbumExistsWithResults: No NSFW images provided');
        return;
      }

      console.log(`🔒 ensureModeratedContentAlbumExistsWithResults: Processing ${nsfwImages.length} NSFW images with moderation results`);

      // Extract image IDs from NSFW images
      const nsfwImageIds = nsfwImages.map(img => img.id);
      
      // Generate thumbnail from first NSFW image
      const thumbnail = nsfwImages.length > 0 ? nsfwImages[0].uri : null;

      // Handle albums table (same as before)
      const { data: existingAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_moderated_album', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (loadError) {
        console.error('❌ ensureModeratedContentAlbumExistsWithResults: Error loading existing albums:', loadError);
        return;
      }

      let albumId: string;

      if (existingAlbums && existingAlbums.length > 0) {
        // Update existing moderated album
        const existingAlbum = existingAlbums[0];
        const existingImageIds = existingAlbum.image_ids || [];
        const mergedImageIds = [...new Set([...existingImageIds, ...nsfwImageIds])];
        
        if (mergedImageIds.length > existingImageIds.length) {
          const { error: updateError } = await supabase
            .from('albums')
            .update({
              image_ids: mergedImageIds,
              count: mergedImageIds.length,
              thumbnail: thumbnail || existingAlbum.thumbnail,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbum.id);

          if (updateError) {
            console.error('❌ ensureModeratedContentAlbumExistsWithResults: Error updating album:', updateError);
            return;
          }
        }
        
        albumId = existingAlbum.id;
      } else {
        // Create new moderated content album
        albumId = generateUUID();
        const newAlbum = {
          id: albumId,
          user_id: user.id,
          name: 'Moderated Content',
          image_ids: nsfwImageIds,
          tags: ['nsfw', 'moderated', 'flagged', 'sensitive'],
          thumbnail: thumbnail,
          count: nsfwImageIds.length,
          is_locked: true,
          is_all_photos_album: false,
          is_moderated_album: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
          .from('albums')
          .insert([newAlbum]);

        if (insertError) {
          console.error('❌ ensureModeratedContentAlbumExistsWithResults: Error creating moderated album:', insertError);
          return;
        }
      }

      // Insert detailed moderated images with AWS Rekognition results
      await this.insertDetailedModeratedImages(user.id, nsfwImages, moderationResults);

    } catch (error) {
      console.error('❌ ensureModeratedContentAlbumExistsWithResults: Error:', error);
    }
  }

  /**
   * Insert detailed moderated image records with AWS Rekognition results
   */
  private static async insertDetailedModeratedImages(
    userId: string, 
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: any }
  ): Promise<void> {
    try {
      // Prepare detailed moderated image records with proper schema
      const moderatedImageRecords = nsfwImages.map(image => {
        const moderationResult = moderationResults[image.id];
        
        return {
          id: generateUUID(),
          user_id: userId,
          image_id: image.id,
          folder_id: image.folderId || 'unknown',
          is_nsfw: true,
          moderation_labels: moderationResult ? {
            confidence_score: moderationResult.confidence_score || 0,
            labels: moderationResult.moderation_labels || [],
            aws_response: moderationResult
          } : {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      // Insert new moderated image records
      const { error: insertError } = await supabase
        .from('moderated_images')
        .upsert(moderatedImageRecords, { 
          onConflict: 'user_id,image_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('❌ Error inserting detailed moderated images:', insertError);
      } else {
        console.log(`✅ Inserted/updated ${moderatedImageRecords.length} detailed moderated image records`);
      }

    } catch (error) {
      console.error('❌ insertDetailedModeratedImages: Error:', error);
    }
  }

  /**
   * Update moderated_folders table to track which folders have been scanned
   */
  static async updateModeratedFolders(folderIds: string[], folderNames: { [folderId: string]: string }): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 updateModeratedFolders: User not authenticated, skipping');
        return;
      }

      const moderatedFolderRecords = folderIds.map(folderId => ({
        id: generateUUID(),
        user_id: user.id,
        folder_id: folderId,
        folder_name: folderNames[folderId] || 'Unknown Folder',
        last_scanned_at: new Date().toISOString(),
        status: 'scanned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Upsert folder records
      const { error: insertError } = await supabase
        .from('moderated_folders')
        .upsert(moderatedFolderRecords, { 
          onConflict: 'user_id,folder_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('❌ Error updating moderated folders:', insertError);
      } else {
        console.log(`✅ Updated ${moderatedFolderRecords.length} moderated folder records`);
      }

    } catch (error) {
      console.error('❌ updateModeratedFolders: Error:', error);
    }
  }

  /**
   * Get moderated images for a specific user
   */
  static async getModeratedImages(userId?: string): Promise<any[]> {
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
   * Remove images from moderated status (if user manually reviews and approves them)
   */
  static async removeFromModeratedImages(imageIds: string[]): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Update moderated_images to mark as not NSFW
      const { error: updateError } = await supabase
        .from('moderated_images')
        .update({
          is_nsfw: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .in('image_id', imageIds);

      if (updateError) {
        console.error('❌ Error updating moderated images:', updateError);
        throw updateError;
      }

      // Also remove from moderated albums
      const { data: moderatedAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_moderated_album', true);

      if (loadError) {
        console.error('❌ Error loading moderated albums:', loadError);
        throw loadError;
      }

      // Update each moderated album to remove the approved images
      for (const album of moderatedAlbums || []) {
        const currentImageIds = album.image_ids || [];
        const filteredImageIds = currentImageIds.filter((id: string) => !imageIds.includes(id));

        if (filteredImageIds.length !== currentImageIds.length) {
          const { error: albumUpdateError } = await supabase
            .from('albums')
            .update({
              image_ids: filteredImageIds,
              count: filteredImageIds.length,
              updated_at: new Date().toISOString(),
            })
            .eq('id', album.id);

          if (albumUpdateError) {
            console.error(`❌ Error updating moderated album ${album.name}:`, albumUpdateError);
          } else {
            console.log(`✅ Removed ${currentImageIds.length - filteredImageIds.length} images from ${album.name}`);
          }
        }
      }

      console.log(`✅ Successfully removed ${imageIds.length} images from moderated status`);

    } catch (error) {
      console.error('❌ removeFromModeratedImages: Error:', error);
      throw error;
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
      moderatedImages?.forEach(image => {
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

  /**
   * Create or update a specific categorized moderated album
   */
  private static async createOrUpdateCategorizedAlbum(
    userId: string,
    albumCategory: any,
    allNsfwImages: any[],
    moderationResults: { [imageId: string]: any }
  ): Promise<void> {
    try {
      // Filter images for this specific category
      const categoryImages = allNsfwImages.filter(img => 
        albumCategory.imageIds.includes(img.id)
      );

      if (categoryImages.length === 0) return;

      // Generate thumbnail from first image in category
      const thumbnail = categoryImages[0]?.uri || null;

      // Check if this category album already exists
      const { data: existingAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', userId)
        .eq('is_moderated_album', true)
        .ilike('name', `%${albumCategory.name}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (loadError) {
        console.error('❌ Error loading existing categorized album:', loadError);
        return;
      }

      const safeDisplayName = NsfwAlbumNaming.generateSafeDisplayName(
        albumCategory.category, 
        categoryImages.length
      );

      if (existingAlbums && existingAlbums.length > 0) {
        // Update existing categorized album
        const existingAlbum = existingAlbums[0];
        const existingImageIds = existingAlbum.image_ids || [];
        const mergedImageIds = [...new Set([...existingImageIds, ...albumCategory.imageIds])];

        if (mergedImageIds.length > existingImageIds.length) {
          const { error: updateError } = await supabase
            .from('albums')
            .update({
              name: safeDisplayName,
              image_ids: mergedImageIds,
              count: mergedImageIds.length,
              thumbnail: thumbnail || existingAlbum.thumbnail,
              tags: [
                'nsfw', 
                'moderated', 
                albumCategory.categoryId,
                ...albumCategory.category.keywords.map((k: string) => k.toLowerCase().replace(/\s+/g, '_'))
              ],
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbum.id);

          if (updateError) {
            console.error('❌ Error updating categorized album:', updateError);
          } else {
            console.log(`✅ Updated categorized album: ${safeDisplayName}`);
          }
        }
      } else {
        // Create new categorized album
        const newAlbum = {
          id: generateUUID(),
          user_id: userId,
          name: safeDisplayName,
          image_ids: albumCategory.imageIds,
          tags: [
            'nsfw', 
            'moderated', 
            albumCategory.categoryId,
            ...albumCategory.category.keywords.map((k: string) => k.toLowerCase().replace(/\s+/g, '_'))
          ],
          thumbnail: thumbnail,
          count: albumCategory.imageIds.length,
          is_locked: true,
          is_all_photos_album: false,
          is_moderated_album: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
          .from('albums')
          .insert([newAlbum]);

        if (insertError) {
          console.error('❌ Error creating categorized album:', insertError);
        } else {
          console.log(`✅ Created new categorized album: ${safeDisplayName}`);
        }
      }

    } catch (error) {
      console.error('❌ createOrUpdateCategorizedAlbum: Error:', error);
    }
  }

  /**
   * Get moderated albums with their category information
   */
  static async getModeratedAlbumsWithCategories(): Promise<Array<Album & {
    categoryInfo?: any;
    moderationStats?: any;
  }>> {
    try {
      const albums = await this.loadAlbums();
      const moderatedAlbums = albums.filter(album => album.isModeratedAlbum);

      // Enhance each album with category information
      const enhancedAlbums = moderatedAlbums.map(album => {
        // Try to extract category from tags
        const categoryTag = album.tags?.find(tag => 
          NsfwAlbumNaming.getAllCategories().some(cat => cat.id === tag)
        );

        const categoryInfo = categoryTag ? 
          NsfwAlbumNaming.getCategoryById(categoryTag) : null;

        return {
          ...album,
          categoryInfo,
          moderationStats: {
            // These could be calculated from moderated_images table if needed
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

  /**
   * Create categorized moderated albums based on moderation labels
   */
  static async createCategorizedModeratedAlbums(
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: any }
  ): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 createCategorizedModeratedAlbums: User not authenticated, skipping');
        return;
      }

      if (!nsfwImages || nsfwImages.length === 0) {
        console.log('🔒 createCategorizedModeratedAlbums: No NSFW images provided');
        return;
      }

      // Prepare moderation data for album generation
      const imagesModerationData = nsfwImages.map(image => ({
        imageId: image.id,
        moderationLabels: moderationResults[image.id]?.moderation_labels || [],
        confidence: moderationResults[image.id]?.confidence_score || 0,
      }));

      // Generate intelligent album categories
      const albumCategories = NsfwAlbumNaming.generateMultipleAlbumNames(imagesModerationData);

      console.log(`🎯 Generated ${albumCategories.length} categorized albums:`, 
        albumCategories.map(cat => `${cat.name} (${cat.imageIds.length} images)`));

      // Create or update albums for each category
      for (const albumCategory of albumCategories) {
        await this.createOrUpdateCategorizedAlbum(user.id, albumCategory, nsfwImages, moderationResults);
      }

      // Also insert detailed moderation records
      await this.insertDetailedModeratedImages(user.id, nsfwImages, moderationResults);

    } catch (error) {
      console.error('❌ createCategorizedModeratedAlbums: Error:', error);
    }
  }
}
