import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';
import { MediaStorage } from './mediaStorage';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export class PhotoLoader {
  static async requestPermissions(): Promise<PermissionStatus> {
    try {
      if (Platform.OS === 'web') {
        // Web doesn't need media library permissions but can't access photos  
        return 'denied';
      }
      
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status as PermissionStatus;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return 'denied';
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

      return allAssets.map(asset => ({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename,
        width: asset.width,
        height: asset.height,
        creationTime: asset.creationTime,
        modificationTime: asset.modificationTime,
      }));
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
      if (Platform.OS === 'web') {
        throw new Error('Photo access is not available on web.');
      }

      const permissionStatus = await this.requestPermissions();
      if (permissionStatus !== 'granted') {
        throw new Error('Photo library permission not granted');
      }

      // Find the starting index
      let startIndex = 0;
      if (afterId) {
        const afterIndex = photoIds.findIndex(id => id === afterId);
        if (afterIndex !== -1) {
          startIndex = afterIndex + 1;
        }
      }

      // Get the batch of photo IDs
      const batchIds = photoIds.slice(startIndex, startIndex + first);
      
      if (batchIds.length === 0) {
        return {
          photos: [],
          nextAfterId: null,
          hasMore: false,
        };
      }

      // Load the actual photo assets
      const photos: ImageMeta[] = [];
      
      for (const photoId of batchIds) {
        try {
          const assets = await MediaLibrary.getAssetsAsync({
            mediaType: 'photo',
            first: 1,
            sortBy: ['creationTime'],
          });

          // Find the specific asset by ID
          const asset = assets.assets.find(a => a.id === photoId);
          if (asset) {
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
          console.error(`Error loading photo ${photoId}:`, error);
          // Continue with other photos
        }
      }

      const nextIndex = startIndex + first;
      const hasMore = nextIndex < photoIds.length;
      const nextAfterId = hasMore && photos.length > 0 ? photos[photos.length - 1].id : null;

      return {
        photos,
        nextAfterId,
        hasMore,
      };
    } catch (error) {
      console.error('Error loading photos by IDs:', error);
      return {
        photos: [],
        nextAfterId: null,
        hasMore: false,
      };
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