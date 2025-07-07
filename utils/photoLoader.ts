import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';
import { MediaStorage } from './mediaStorage';
import { ImageCacheManager } from './imageCache';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export class PhotoLoader {
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
      if (Platform.OS === 'web') {
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

  static async loadAllPhotoIds(selectedFolders: string[] = ['all_photos']): Promise<Array<{id: string, uri: string}>> {
    try {
      console.log('📁 loadAllPhotoIds called with selectedFolders:', selectedFolders);
      
      if (Platform.OS === 'web') {
        throw new Error('Photo access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission not granted');
      }

      let allPhotoIds: Array<{id: string, uri: string}> = [];

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
      return allPhotoIds;
    } catch (error) {
      console.error('Error loading all photo IDs:', error);
      return [];
    }
  }

  static async loadPhotosByIds(
    photoIds: string[], 
    first: number = 20, 
    afterId?: string
  ): Promise<{
    photos: ImageMeta[];
    nextAfterId: string | null;
    hasMore: boolean;
  }> {
    try {
      console.log('📸 loadPhotosByIds called with:', photoIds.length, 'IDs, first:', first);
      
      if (Platform.OS === 'web') {
        throw new Error('Photo access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission not granted');
      }

      // Find starting index
      let startIndex = 0;
      if (afterId) {
        const afterIndex = photoIds.findIndex(id => id === afterId);
        if (afterIndex !== -1) {
          startIndex = afterIndex + 1;
        }
      }

      // Get batch of IDs
      const batchIds = photoIds.slice(startIndex, startIndex + first);
      
      if (batchIds.length === 0) {
        return { photos: [], nextAfterId: null, hasMore: false };
      }

      console.log('📸 Looking for photos with IDs:', batchIds.slice(0, 5), '...');

      // Load assets to find our photos
      const photos: ImageMeta[] = [];
      let after: string | undefined;
      let foundCount = 0;
      let attempts = 0;
      const maxAttempts = 10;

      while (foundCount < batchIds.length && attempts < maxAttempts) {
        const assets = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 2000,
          after,
          sortBy: ['creationTime'],
        });

        // Find photos in this batch
        const foundInBatch = assets.assets.filter(asset => 
          batchIds.includes(asset.id)
        );

        // Add found photos
        foundInBatch.forEach(asset => {
          photos.push({
            id: asset.id,
            uri: asset.uri,
            thumbnailUri: asset.uri, // ✅ Use original URI, let Expo Image handle optimization
            filename: asset.filename,
            width: asset.width,
            height: asset.height,
            creationTime: asset.creationTime,
            modificationTime: asset.modificationTime,
          });
        });

        foundCount = photos.length;
        attempts++;

        console.log(`📸 Attempt ${attempts}: Found ${foundInBatch.length} photos in this batch, total found: ${foundCount}/${batchIds.length}`);

        // If no more pages, break
        if (!assets.hasNextPage) {
          console.log('📸 Reached end of photos');
          break;
        }

        after = assets.endCursor;
      }

      console.log('📸 Final result: Found', photos.length, 'photos out of', batchIds.length, 'requested');

      // Preload images for better performance
      if (photos.length > 0) {
        ImageCacheManager.preloadUpcomingImages(photos, 0, 5);
      }

      // Calculate next batch info
      const actualNextIndex = startIndex + photos.length;
      const hasMore = actualNextIndex < photoIds.length;
      const nextAfterId = hasMore && photos.length > 0 ? photoIds[actualNextIndex] : null;

      return {
        photos,
        nextAfterId,
        hasMore,
      };
    } catch (error) {
      console.error('❌ Error loading photos by IDs:', error);
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
        throw new Error('Photo folder access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission required to access folders.');
      }

      const albums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      const folders = await Promise.all(
        albums.map(async (album) => ({
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
}