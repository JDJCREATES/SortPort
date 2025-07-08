/**
 * NSFW Moderation Manager
 * Handles scanning device folders for NSFW content using AWS Rekognition
 * Manages the entire moderation workflow including database persistence and album creation
 */

import { supabase } from './supabase';
import { supabaseUrl, supabaseAnonKey } from './supabase';
import { PhotoLoader } from './photoLoader';
import { AlbumUtils } from './albumUtils';
import { 
  ModeratedFolder, 
  ModeratedImage, 
  ModerationResult, 
  Album, 
  ImageMeta,
  ModerationLabel 
} from '../types';

// Configuration constants
const BATCH_SIZE = 5; // Process 5 images at a time to avoid overwhelming the API
const API_DELAY = 1000; // 1 second delay between API calls to respect rate limits
const RESCAN_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const MAX_RETRIES = 3;

export class NsfwModerationManager {
  /**
   * Check and moderate folders for NSFW content
   * This is the main entry point for the moderation process
   */
  static async checkAndModerateFolders(
    folderIds: string[], 
    userId: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<void> {
    console.log('🔍 NsfwModerationManager: Starting moderation for', folderIds.length, 'folders');
    
    try {
      let processedFolders = 0;
      const totalFolders = folderIds.length;

      for (const folderId of folderIds) {
        onProgress?.(processedFolders, totalFolders, `Checking folder ${folderId}...`);
        
        // Only scan folders that haven't been scanned before or need re-scanning
        const needsScanning = await this.checkIfFolderNeedsScanning(folderId, userId);
        
        if (needsScanning) {
          console.log(`📁 Folder ${folderId} needs scanning`);
          await this.moderateFolder(folderId, userId, onProgress);
        } else {
          console.log(`✅ Folder ${folderId} already scanned recently`);
        }
        
        processedFolders++;
      }

      // Create/update NSFW albums after all folders are processed
      onProgress?.(totalFolders, totalFolders, 'Creating moderated albums...');
      await this.createNsfwAlbums(userId);
      
      console.log('✅ NsfwModerationManager: Moderation complete');
      onProgress?.(totalFolders, totalFolders, 'Moderation complete');
      
    } catch (error) {
      console.error('❌ NsfwModerationManager: Error during moderation:', error);
      throw error;
    }
  }

  /**
   * Check if a folder needs scanning based on last scan time and status
   */
  private static async checkIfFolderNeedsScanning(
    folderId: string, 
    userId: string
  ): Promise<boolean> {
    try {
      const { data: folder, error } = await supabase
        .from('moderated_folders')
        .select('*')
        .eq('user_id', userId)
        .eq('folder_id', folderId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking folder scan status:', error);
        return true; // Assume needs scanning on error
      }

      if (!folder) {
        console.log(`📁 Folder ${folderId} has never been scanned - needs scanning`);
        return true; // New folder, needs scanning
      }

      // Check if folder was scanned recently
      const lastScanned = new Date(folder.last_scanned_at).getTime();
      const now = Date.now();
      const timeSinceLastScan = now - lastScanned;

      // Only rescan if previous scan failed or if it's been too long
      const needsRescan = timeSinceLastScan > RESCAN_THRESHOLD || folder.status === 'error';
      
      if (needsRescan) {
        console.log(`📁 Folder ${folderId} needs re-scanning - last scan: ${new Date(lastScanned).toISOString()}, status: ${folder.status}`);
      } else {
        console.log(`📁 Folder ${folderId} was scanned recently (${Math.round(timeSinceLastScan / (1000 * 60 * 60))} hours ago) - skipping`);
      }
      
      return needsRescan;
      
    } catch (error) {
      console.error('Error checking folder scan status:', error);
      return true; // Assume needs scanning on error
    }
  }

  /**
   * Moderate a single folder by scanning all its images
   */
  private static async moderateFolder(
    folderId: string, 
    userId: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<void> {
    console.log(`🔍 Starting moderation for folder: ${folderId}`);
    
    try {
      // Get folder info
      const availableFolders = await PhotoLoader.getAvailableFolders();
      const folderInfo = availableFolders.find(f => f.id === folderId);
      const folderName = folderInfo?.name || folderId;

      // Create or update folder record
      await this.upsertModeratedFolder(folderId, folderName, userId, 'scanning');

      // Load all photos from the folder
      const photos = await PhotoLoader.loadPhotosFromFolder(folderId);
      console.log(`📸 Found ${photos.length} photos in folder ${folderName}`);

      if (photos.length === 0) {
        await this.updateFolderStatus(folderId, userId, 'scanned');
        return;
      }

      // Process photos in batches
      let processedCount = 0;
      const totalPhotos = photos.length;

      for (let i = 0; i < photos.length; i += BATCH_SIZE) {
        const batch = photos.slice(i, i + BATCH_SIZE);
        
        onProgress?.(
          processedCount, 
          totalPhotos, 
          `Scanning ${folderName}: ${processedCount}/${totalPhotos} photos`
        );

        // Convert batch to base64
        const base64Batch = await PhotoLoader.batchConvertToBase64(batch);
        
        // Process each image in the batch
        for (const { id: imageId, base64 } of base64Batch) {
          try {
            // Check if image was already processed
            const existingResult = await this.getExistingModerationResult(imageId, userId);
            if (existingResult) {
              console.log(`⏭️ Skipping already processed image: ${imageId}`);
              processedCount++;
              continue;
            }

            // Call Rekognition API
            const moderationResult = await this.callRekognitionAPI(imageId, base64);
            
            // Store result in database
            await this.storeModerationResult(
              imageId, 
              folderId, 
              userId, 
              moderationResult
            );

            processedCount++;
            
            // Add delay to respect API rate limits
            if (processedCount < totalPhotos) {
              await new Promise(resolve => setTimeout(resolve, API_DELAY));
            }
            
          } catch (error) {
            console.error(`❌ Error processing image ${imageId}:`, error);
            processedCount++;
            // Continue with next image instead of failing the entire batch
          }
        }
      }

      // Update folder status to completed
      await this.updateFolderStatus(folderId, userId, 'scanned');
      console.log(`✅ Completed moderation for folder: ${folderName}`);
      
    } catch (error) {
      console.error(`❌ Error moderating folder ${folderId}:`, error);
      await this.updateFolderStatus(folderId, userId, 'error');
      throw error;
    }
  }

  /**
   * Call the Rekognition API route to analyze an image
   */
  private static async callRekognitionAPI(
    imageId: string, 
    base64: string
  ): Promise<ModerationResult> {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing. Please check your environment variables.');
    }
    
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/rekognition-moderation`;
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            image_base64: base64,
            image_id: imageId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API error: ${errorData.error} - ${errorData.details}`);
        }

        const result: ModerationResult = await response.json();
        return result;
        
      } catch (error) {
        retries++;
        console.error(`❌ Rekognition API call failed (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, API_DELAY * retries));
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  /**
   * Store moderation result in the database
   */
  private static async storeModerationResult(
    imageId: string,
    folderId: string,
    userId: string,
    result: ModerationResult
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('moderated_images')
        .upsert({
          user_id: userId,
          image_id: imageId,
          folder_id: folderId,
          is_nsfw: result.is_nsfw,
          moderation_labels: result.moderation_labels,
        }, {
          onConflict: 'user_id,image_id'
        });

      if (error) {
        throw error;
      }
      
    } catch (error) {
      console.error('Error storing moderation result:', error);
      throw error;
    }
  }

  /**
   * Check if an image has already been moderated
   */
  private static async getExistingModerationResult(
    imageId: string,
    userId: string
  ): Promise<ModeratedImage | null> {
    try {
      const { data, error } = await supabase
        .from('moderated_images')
        .select('*')
        .eq('user_id', userId)
        .eq('image_id', imageId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking existing moderation result:', error);
        return null;
      }

      return data;
      
    } catch (error) {
      console.error('Error checking existing moderation result:', error);
      return null;
    }
  }

  /**
   * Create or update a moderated folder record
   */
  private static async upsertModeratedFolder(
    folderId: string,
    folderName: string,
    userId: string,
    status: ModeratedFolder['status']
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('moderated_folders')
        .upsert({
          user_id: userId,
          folder_id: folderId,
          folder_name: folderName,
          status,
          last_scanned_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,folder_id'
        });

      if (error) {
        throw error;
      }
      
    } catch (error) {
      console.error('Error upserting moderated folder:', error);
      throw error;
    }
  }

  /**
   * Update folder scanning status
   */
  private static async updateFolderStatus(
    folderId: string,
    userId: string,
    status: ModeratedFolder['status']
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('moderated_folders')
        .update({
          status,
          last_scanned_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('folder_id', folderId);

      if (error) {
        throw error;
      }
      
    } catch (error) {
      console.error('Error updating folder status:', error);
      throw error;
    }
  }

  /**
   * Create NSFW albums based on moderation results
   */
  private static async createNsfwAlbums(userId: string): Promise<void> {
    console.log('📁 Creating NSFW albums...');
    
    try {
      // Get all NSFW images for this user
      const { data: nsfwImages, error } = await supabase
        .from('moderated_images')
        .select('*')
        .eq('user_id', userId)
        .eq('is_nsfw', true);

      if (error) {
        throw error;
      }

      if (!nsfwImages || nsfwImages.length === 0) {
        console.log('📁 No NSFW images found, skipping album creation');
        return;
      }

      // Group images by primary moderation label
      const albumGroups = this.groupImagesByModerationLabel(nsfwImages);

      // Create or update albums for each group
      for (const [labelName, images] of Object.entries(albumGroups)) {
        await this.createOrUpdateNsfwAlbum(labelName, images, userId);
      }

      console.log(`✅ Created/updated ${Object.keys(albumGroups).length} NSFW albums`);
      
    } catch (error) {
      console.error('❌ Error creating NSFW albums:', error);
      throw error;
    }
  }

  /**
   * Group NSFW images by their primary moderation label
   */
  private static groupImagesByModerationLabel(
    nsfwImages: ModeratedImage[]
  ): Record<string, ModeratedImage[]> {
    const groups: Record<string, ModeratedImage[]> = {};

    for (const image of nsfwImages) {
      // Find the highest confidence moderation label
      let primaryLabel = 'Moderated Content';
      let highestConfidence = 0;

      for (const label of image.moderation_labels) {
        if (label.Confidence > highestConfidence) {
          highestConfidence = label.Confidence;
          primaryLabel = this.formatLabelName(label.Name);
        }
      }

      if (!groups[primaryLabel]) {
        groups[primaryLabel] = [];
      }
      groups[primaryLabel].push(image);
    }

    return groups;
  }

  /**
   * Format moderation label names for album titles
   */
  private static formatLabelName(labelName: string): string {
    const labelMap: Record<string, string> = {
      'Explicit Nudity': 'Adult Content',
      'Suggestive': 'Suggestive Content',
      'Violence': 'Violent Content',
      'Visually Disturbing': 'Disturbing Content',
      'Rude Gestures': 'Inappropriate Gestures',
      'Drugs': 'Drug-Related Content',
      'Tobacco': 'Tobacco Content',
      'Alcohol': 'Alcohol Content',
      'Gambling': 'Gambling Content',
      'Hate Symbols': 'Hate Symbols',
    };

    return labelMap[labelName] || labelName;
  }

  /**
   * Create or update an NSFW album
   */
  private static async createOrUpdateNsfwAlbum(
    albumName: string,
    images: ModeratedImage[],
    userId: string
  ): Promise<void> {
    try {
      const imageIds = images.map(img => img.image_id);
      const tags = ['nsfw', 'moderated', albumName.toLowerCase().replace(/\s+/g, '-')];

      // Check if album already exists
      const { data: existingAlbums, error: searchError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', userId)
        .eq('is_moderated_album', true)
        .ilike('name', `%${albumName}%`);

      if (searchError) {
        throw searchError;
      }

      if (existingAlbums && existingAlbums.length > 0) {
        // Update existing album
        const existingAlbum = existingAlbums[0];
        const updatedImageIds = [...new Set([...existingAlbum.image_ids, ...imageIds])];
        
        await AlbumUtils.updateAlbum(existingAlbum.id, {
          imageIds: updatedImageIds,
          count: updatedImageIds.length,
          thumbnail: imageIds[0] || existingAlbum.thumbnail,
        });

        console.log(`📁 Updated NSFW album: ${albumName} (+${imageIds.length} images)`);
      } else {
        // Create new album
        const newAlbum: Album = {
          id: `nsfw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: albumName,
          imageIds,
          tags,
          createdAt: Date.now(),
          isLocked: true,
          isModeratedAlbum: true,
          thumbnail: imageIds[0],
          count: imageIds.length,
        };

        await AlbumUtils.addAlbum(newAlbum);
        console.log(`📁 Created NSFW album: ${albumName} (${imageIds.length} images)`);
      }
      
    } catch (error) {
      console.error(`❌ Error creating/updating NSFW album ${albumName}:`, error);
      throw error;
    }
  }

  /**
   * Get all NSFW albums for a user
   */
  static async getNsfwAlbums(userId: string): Promise<Album[]> {
    try {
      const { data: albums, error } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', userId)
        .eq('is_moderated_album', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (albums || []).map(album => ({
        id: album.id,
        name: album.name,
        imageIds: album.image_ids || [],
        tags: album.tags || [],
        createdAt: new Date(album.created_at).getTime(),
        isLocked: album.is_locked || false,
        isModeratedAlbum: album.is_moderated_album || false,
        thumbnail: album.thumbnail || '',
        count: album.count || 0,
      }));
      
    } catch (error) {
      console.error('Error getting NSFW albums:', error);
      return [];
    }
  }

  /**
   * Check if a folder has been scanned
   */
  static async isFolderScanned(folderId: string, userId: string): Promise<boolean> {
    try {
      const { data: folder, error } = await supabase
        .from('moderated_folders')
        .select('status')
        .eq('user_id', userId)
        .eq('folder_id', folderId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking folder scan status:', error);
        return false;
      }

      return folder?.status === 'scanned';
      
    } catch (error) {
      console.error('Error checking folder scan status:', error);
      return false;
    }
  }
}