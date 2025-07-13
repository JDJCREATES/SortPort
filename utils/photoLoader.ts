import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';
import { MediaStorage } from './mediaStorage';
import { ImageCacheManager } from './imageCache';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export class PhotoLoader {
  // Add a static property to inject the NSFW filter function
  private static nsfwFilterFunction: (() => Promise<string[]>) | null = null;

  // Method to inject the NSFW filter function (called from AlbumUtils)
  static setNsfwFilter(filterFn: () => Promise<string[]>): void {
    this.nsfwFilterFunction = filterFn;
  }

  static async requestPermissions(): Promise<PermissionStatus> {
    try {
      if (Platform.OS === 'web') {
        return 'denied';
      }
      
      // Request basic media library permissions first
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status !== 'granted') {
        return status as PermissionStatus;
      }
      
      // On Android, also request media location permission if available
      if (Platform.OS === 'android') {
        try {
          const { status: writeStatus } = await MediaLibrary.requestPermissionsAsync(true);
          console.log('📱 Media location permission status:', writeStatus);
          
          if (writeStatus !== 'granted') {
            console.warn('⚠️ Media location permission not granted, some features may be limited');
          }
        } catch (error) {
          console.warn('⚠️ Media location permission not available:', error);
        }
      }
      
      return status as PermissionStatus;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return 'denied';
    }
  }

  static async checkAndRequestPermissions(): Promise<{
    granted: boolean;
    shouldShowRationale: boolean;
    message: string;
  }> {
    try {
      const status = await this.requestPermissions();
      
      switch (status) {
        case 'granted':
          return {
            granted: true,
            shouldShowRationale: false,
            message: 'Permissions granted'
          };
        
        case 'denied':
          return {
            granted: false,
            shouldShowRationale: true,
            message: 'Photo access is required to view your albums. Please grant permission in your device settings.'
          };
        
        case 'undetermined':
          return {
            granted: false,
            shouldShowRationale: true,
            message: 'Photo access permission is needed to continue.'
          };
        
        default:
          return {
            granted: false,
            shouldShowRationale: true,
            message: 'Unable to access photos. Please check your permissions.'
          };
      }
    } catch (error) {
      return {
        granted: false,
        shouldShowRationale: true,
        message: 'Error checking permissions. Please try again.'
      };
    }
  }

  static async loadRecentPhotos(limit: number = 100): Promise<ImageMeta[]> {
    try {
      if (Platform.OS === 'web' || !MediaLibrary) {
        throw new Error('Photo access is not available on web. Please use the mobile app to access your photos.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        if (permissionStatus === 'denied') {
          throw new Error('Photo library access denied. Please enable photo permissions in your device settings to use AI sorting.');
        } else {
          throw new Error('Photo library permission required. Please grant access to your photos to continue.');
        }
      }

      // Get user's selected folders from settings
      const settings = await MediaStorage.loadSettings();
      const selectedFolders = settings.selectedFolders || ['all_photos'];

      let allAssets: MediaLibrary.Asset[] = [];

      if (selectedFolders.length === 0 || selectedFolders.includes('all_photos')) {
        // Load from all photos
        const assets = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: limit,
          sortBy: ['creationTime'],
        });
        allAssets = assets.assets;
      } else {
        // Load from specific albums/folders
        const albums = await MediaLibrary.getAlbumsAsync({
          includeSmartAlbums: true,
        });

        const selectedAlbums = albums.filter(album => 
          selectedFolders.includes(album.id) || selectedFolders.includes(album.title)
        );

        for (const album of selectedAlbums) {
          const assets = await MediaLibrary.getAssetsAsync({
            album: album.id,
            mediaType: 'photo',
            first: Math.ceil(limit / selectedAlbums.length),
            sortBy: ['creationTime'],
          });
          allAssets.push(...assets.assets);
        }

        // Sort by creation time and limit
        allAssets.sort((a, b) => b.creationTime - a.creationTime);
        allAssets = allAssets.slice(0, limit);
      }

      // Convert to ImageMeta format
      const result = allAssets.map(asset => ({
        id: asset.id,
        uri: asset.uri,
        thumbnailUri: asset.uri, // ✅ Use original URI, let Expo Image handle optimization
        filename: asset.filename,
        width: asset.width,
        height: asset.height,
        creationTime: asset.creationTime,
        modificationTime: asset.modificationTime,
      }));

      // Preload first batch of images for better performance
      const firstBatchUris = result.slice(0, 10).map(photo => photo.uri);
      ImageCacheManager.preloadImages(firstBatchUris, 'high');

      return result;
    } catch (error) {
      console.error('Error loading photos:', error);
      throw error; // Re-throw to let caller handle the error
    }
  }

  private static photoIdsCache: Map<string, { data: Array<{id: string, uri: string, folderId?: string}>; timestamp: number }> = new Map();
  private static CACHE_DURATION_MS = 30000; // 30 seconds

  static async loadAllPhotoIds(selectedFolders: string[] = ['all_photos']): Promise<Array<{id: string, uri: string, folderId?: string}>> {
    try {
      const cacheKey = JSON.stringify(selectedFolders.sort());
      const cached = this.photoIdsCache.get(cacheKey);
      
      // Return cached data if it's still fresh
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION_MS) {
        console.log('📸 loadAllPhotoIds: Using cached data, count:', cached.data.length);
        return cached.data;
      }

      console.log('📁 loadAllPhotoIds called with selectedFolders:', selectedFolders);
      
      if (Platform.OS === 'web') {
        throw new Error('Photo access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission not granted');
      }

      let allPhotoIds: Array<{id: string, uri: string, folderId?: string}> = [];

      if (selectedFolders.length === 0 || selectedFolders.includes('all_photos')) {
        console.log('📸 Loading all photos from device...');
        // Load all photos with pagination
        let after: string | undefined;
        const batchSize = 1000;

        do {
          const assets = await MediaLibrary.getAssetsAsync({
            mediaType: 'photo',
            first: batchSize,
            after,
            sortBy: ['creationTime'],
          });

          const photoIds = assets.assets.map(asset => ({
            id: asset.id,
            uri: asset.uri,
            folderId: 'all_photos', // Default folder ID
          }));

          allPhotoIds.push(...photoIds);
          after = assets.endCursor;

          // Break if we've loaded all photos
          if (!assets.hasNextPage) {
            console.log('📸 Finished loading all photos, total:', allPhotoIds.length);
            break;
          }
        } while (after);
      } else {
        console.log('📁 Loading photos from specific albums/folders...');
        // Load from specific albums/folders
        const albums = await MediaLibrary.getAlbumsAsync({
          includeSmartAlbums: true,
        });

        const selectedAlbums = albums.filter(album => 
          selectedFolders.includes(album.id) || selectedFolders.includes(album.title)
        );
        
        console.log('📁 Found matching albums:', selectedAlbums.map(a => ({ id: a.id, title: a.title, assetCount: a.assetCount })));

        for (const album of selectedAlbums) {
          console.log(`📁 Loading photos from album: ${album.title} (${album.assetCount} assets)`);
          let after: string | undefined;
          const batchSize = 1000;

          do {
            const assets = await MediaLibrary.getAssetsAsync({
              album: album.id,
              mediaType: 'photo',
              first: batchSize,
              after,
              sortBy: ['creationTime'],
            });

            const photoIds = assets.assets.map(asset => ({
              id: asset.id,
              uri: asset.uri,
              folderId: album.id, // Use the actual album/folder ID
            }));

            allPhotoIds.push(...photoIds);
            after = assets.endCursor;

            // Break if we've loaded all photos from this album
            if (!assets.hasNextPage) {
              console.log(`📁 Finished loading from album: ${album.title}, photos added: ${assets.assets.length}`);
              break;
            }
          } while (after);
        }

        // Remove duplicates (in case photos exist in multiple selected albums)
        const uniquePhotoIds = new Map();
        allPhotoIds.forEach(photo => {
          uniquePhotoIds.set(photo.id, photo);
        });
        allPhotoIds = Array.from(uniquePhotoIds.values());
      }

      console.log('📸 Final allPhotoIds count:', allPhotoIds.length);
      
      // Cache the result
      this.photoIdsCache.set(cacheKey, {
        data: allPhotoIds,
        timestamp: Date.now()
      });

      return allPhotoIds;
    } catch (error) {
      console.error('Error loading all photo IDs:', error);
      return [];
    }
  }

  static async loadPhotosByIds(
    imageIds: string[], 
    limit: number = 50, 
    afterId?: string,
    showModerated: boolean = false // ✅ Make sure this parameter exists
  ): Promise<{
    photos: ImageMeta[];
    nextAfterId: string | null;
    hasMore: boolean;
  }> {
    try {
      if (Platform.OS === 'web') {
        return { photos: [], nextAfterId: null, hasMore: false };
      }

      console.log('📸 PhotoLoader.loadPhotosByIds called:', {
        imageIdsCount: imageIds.length,
        limit,
        afterId,
        showModerated
      });

      // Get NSFW image IDs for filtering (use injected function if available)
      let nsfwImageIds: string[] = [];
      if (!showModerated && this.nsfwFilterFunction) {
        try {
          nsfwImageIds = await this.nsfwFilterFunction();
        } catch (error) {
          console.warn('Failed to load NSFW filter, continuing without filtering:', error);
        }
      }
      
      const nsfwSet = new Set(nsfwImageIds);

      // Filter out NSFW images from the imageIds if not showing moderated content
      const filteredImageIds = showModerated 
        ? imageIds 
        : imageIds.filter(id => !nsfwSet.has(id));

      console.log('📸 After NSFW filtering:', {
        originalCount: imageIds.length,
        filteredCount: filteredImageIds.length,
        removedCount: imageIds.length - filteredImageIds.length
      });

      // Find starting index
      let startIndex = 0;
      if (afterId) {
        const afterIndex = filteredImageIds.findIndex(id => id === afterId);
        startIndex = afterIndex >= 0 ? afterIndex + 1 : 0;
      }

      // Get batch of image IDs
      const batchIds = filteredImageIds.slice(startIndex, startIndex + limit);
      
      if (batchIds.length === 0) {
        return { photos: [], nextAfterId: null, hasMore: false };
      }

      // Load photos from device
      const photos: ImageMeta[] = [];
      
      for (const imageId of batchIds) {
        try {
          const asset = await MediaLibrary.getAssetInfoAsync(imageId);
          if (asset && asset.uri) {
            photos.push({
              id: asset.id,
              uri: asset.uri,
              filename: asset.filename,
              width: asset.width,
              height: asset.height,
              creationTime: asset.creationTime,
              modificationTime: asset.modificationTime,
            });
          }
        } catch (error) {
          console.warn(`Failed to load photo ${imageId}:`, error);
        }
      }

      // Determine if there are more photos
      const hasMore = startIndex + limit < filteredImageIds.length;
      const nextAfterId = hasMore ? batchIds[batchIds.length - 1] : null;

      return {
        photos,
        nextAfterId,
        hasMore,
      };
    } catch (error) {
      console.error('Error loading photos by IDs:', error);
      return { photos: [], nextAfterId: null, hasMore: false };
    }
  }

  static async getPhotoBase64(uri: string): Promise<string> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]); // Remove data:image/jpeg;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting photo to base64:', error);
      throw error;
    }
  }

  static async batchConvertToBase64(images: ImageMeta[]): Promise<Array<{id: string, base64: string}>> {
    const conversions = images.map(async (image) => {
      try {
        const base64 = await this.getPhotoBase64(image.uri);
        return { id: image.id, base64 };
      } catch (error) {
        console.error(`Error converting image ${image.id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(conversions);
    return results.filter(result => result !== null) as Array<{id: string, base64: string}>;
  }

  static async getAvailableFolders(): Promise<Array<{id: string, name: string, count: number}>> {
    try {
      if (Platform.OS === 'web') {
        throw new Error('Photo access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission required to access folders.');
      }

      const albums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      const folders = await Promise.all(
        albums.map(async (album: MediaLibrary.Album) => ({
          id: album.id,
          name: album.title,
          count: album.assetCount,
        }))
      );

      // Return only actual device folders (no "All Photos" option)
      return folders;
    } catch (error) {
      console.error('Error getting available folders:', error);
      throw error;
    }
  }

  /**
   * Load photos from a specific folder/album
   */
  static async loadPhotosFromFolder(folderId: string, limit?: number): Promise<ImageMeta[]> {
    try {
      if (Platform.OS === 'web') {
        throw new Error('Photo folder access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission required to access folder photos.');
      }

      console.log(`📁 Loading photos from folder: ${folderId}`);

      // Load photos from the specific album/folder
      let allAssets: MediaLibrary.Asset[] = [];
      let after: string | undefined;
      const batchSize = 1000;
      let totalLoaded = 0;

      do {
        const assets = await MediaLibrary.getAssetsAsync({
          album: folderId,
          mediaType: 'photo',
          first: limit ? Math.min(batchSize, limit - totalLoaded) : batchSize,
          after,
          sortBy: ['creationTime'],
        });

        allAssets.push(...assets.assets);
        after = assets.endCursor;
        totalLoaded += assets.assets.length;

        // Break if we've reached the limit or no more photos
        if ((limit && totalLoaded >= limit) || !assets.hasNextPage) {
          break;
        }
      } while (after);

      console.log(`📁 Loaded ${allAssets.length} photos from folder ${folderId}`);

      // Convert to ImageMeta format
      const result = allAssets.map((asset: MediaLibrary.Asset) => ({
        id: asset.id,
        uri: asset.uri,
        thumbnailUri: asset.uri,
        filename: asset.filename,
        width: asset.width,
        height: asset.height,
        creationTime: asset.creationTime,
        modificationTime: asset.modificationTime,
      }));

      return result;
    } catch (error) {
      console.error(`Error loading photos from folder ${folderId}:`, error);
      throw error;
    }
  }
}