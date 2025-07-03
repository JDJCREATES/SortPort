import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';
import { MediaStorage } from './mediaStorage';

export class PhotoLoader {
  static async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        // Web doesn't need media library permissions but can't access photos
        return false;
      }
      
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  static async loadRecentPhotos(limit: number = 100): Promise<ImageMeta[]> {
    try {
      if (Platform.OS === 'web') {
        // Web cannot access device photos - return empty array
        return [];
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Photo library permission not granted');
      }

      // Get user's selected folders from settings
      const settings = await MediaStorage.loadSettings();
      const selectedFolders = settings.selectedFolders || ['all_photos'];

      let allAssets: MediaLibrary.Asset[] = [];

      if (selectedFolders.includes('all_photos')) {
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
      return []; // Return empty array instead of mock data
    }
  }

  static async loadAllPhotoIds(selectedFolders: string[] = ['all_photos']): Promise<Array<{id: string, uri: string}>> {
    try {
      if (Platform.OS === 'web') {
        // Web cannot access device photos
        return [];
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Photo library permission not granted');
      }

      let allPhotoIds: Array<{id: string, uri: string}> = [];

      if (selectedFolders.includes('all_photos')) {
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
            break;
          }
        } while (after);
      } else {
        // Load from specific albums/folders
        const albums = await MediaLibrary.getAlbumsAsync({
          includeSmartAlbums: true,
        });

        const selectedAlbums = albums.filter(album => 
          selectedFolders.includes(album.id) || selectedFolders.includes(album.title)
        );

        for (const album of selectedAlbums) {
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

      return allPhotoIds;
    } catch (error) {
      console.error('Error loading all photo IDs:', error);
      return [];
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
        // Web cannot access device folders - return empty array
        return [];
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return [];
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

      // Add "All Photos" option
      const allPhotosAssets = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 1,
      });

      return [
        { id: 'all_photos', name: 'All Photos', count: allPhotosAssets.totalCount },
        ...folders,
      ];
    } catch (error) {
      console.error('Error getting available folders:', error);
      return [];
    }
  }
}