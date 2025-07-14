import { supabase } from '../supabase';
import { PhotoLoader } from '../photoLoader';
import { MediaStorage } from '../mediaStorage';
import { NsfwImageManager } from '../nsfw/nsfwImageManager';
import { generateUUID } from '../helpers/uuid';

export class AllPhotosAlbumManager {
  private static isEnsuring = false;
  private static lastEnsureTime = 0;
  private static ENSURE_DEBOUNCE_MS = 5000; // 5 seconds
  private static callCount = 0;
  private static resetTime = 0;
  private static MAX_CALLS_PER_MINUTE = 10;

  /**
   * Ensure the "All Photos" album exists and is up to date with NSFW filtering
   */
  static async ensureAllPhotosAlbumExists(showModerated: boolean = false): Promise<void> {
    // Circuit breaker - prevent too many calls
    const now = Date.now();
    if (now - this.resetTime > 60000) { // Reset every minute
      this.callCount = 0;
      this.resetTime = now;
    }
    
    this.callCount++;
    if (this.callCount > this.MAX_CALLS_PER_MINUTE) {
      console.warn('🚨 ensureAllPhotosAlbumExists: Too many calls, circuit breaker activated');
      return;
    }

    // Prevent concurrent executions
    if (this.isEnsuring) {
      console.log('📁 ensureAllPhotosAlbumExists: Already running, skipping...');
      return;
    }

    // Debounce rapid calls
    if (now - this.lastEnsureTime < this.ENSURE_DEBOUNCE_MS) {
      console.log('📁 ensureAllPhotosAlbumExists: Called too recently, skipping...');
      return;
    }

    this.isEnsuring = true;
    this.lastEnsureTime = now;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('📁 ensureAllPhotosAlbumExists: User not authenticated, skipping');
        return;
      }

      // Load current settings to get selected folders
      const settings = await MediaStorage.loadSettings();
      const selectedFolders = settings.selectedFolders || [];
      
      // If no folders selected, create empty album or delete existing one
      if (selectedFolders.length === 0) {
        console.log('📁 ensureAllPhotosAlbumExists: No folders selected, creating empty album');
        
        // Check if album exists
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

        if (existingAlbums && existingAlbums.length > 0) {
          // Update existing album to be empty
          const { error: updateError } = await supabase
            .from('albums')
            .update({
              image_ids: [],
              count: 0,
              thumbnail: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbums[0].id);

          if (updateError) {
            console.error('❌ ensureAllPhotosAlbumExists: Error updating album:', updateError);
          } else {
            console.log('✅ ensureAllPhotosAlbumExists: Updated album to be empty');
          }
        } else {
          // Create empty album
          const newAlbum = {
            id: generateUUID(),
            user_id: user.id,
            name: 'All Photos',
            image_ids: [],
            tags: ['all', 'photos', 'device'],
            thumbnail: null,
            count: 0,
            is_locked: false,
            is_all_photos_album: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { error: insertError } = await supabase
            .from('albums')
            .insert([newAlbum]);

          if (insertError) {
            console.error('❌ ensureAllPhotosAlbumExists: Error creating empty album:', insertError);
          } else {
            console.log('✅ ensureAllPhotosAlbumExists: Created empty album');
          }
        }
        return;
      }

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
      
      // Filter NSFW images if moderation is enabled
      const filteredPhotoIds = showModerated 
        ? allPhotoIds 
        : await NsfwImageManager.filterNsfwImages(allPhotoIds, showModerated);
      
      const imageIds = filteredPhotoIds.map((photo: any) => photo.id);
      
      // Generate thumbnail for the first image if available
      let thumbnail: string | undefined;
      if (filteredPhotoIds.length > 0) {
        thumbnail = filteredPhotoIds[0].uri;
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
            console.log(`✅ ensureAllPhotosAlbumExists: Updated album with ${imageIds.length} photos (${allPhotoIds.length - filteredPhotoIds.length} filtered)`);
          }
        } else {
          console.log('📁 ensureAllPhotosAlbumExists: No update needed');
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
          console.log(`✅ ensureAllPhotosAlbumExists: Created album with ${imageIds.length} photos (${allPhotoIds.length - filteredPhotoIds.length} filtered)`);
        }
      }
    } catch (error) {
      console.error('❌ ensureAllPhotosAlbumExists: Error:', error);
    } finally {
      this.isEnsuring = false;
    }
  }
}