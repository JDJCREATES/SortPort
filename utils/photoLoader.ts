import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { ImageMeta } from '../types';
import { MediaStorage } from './mediaStorage';

export class PhotoLoader {
  static async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        // Web doesn't need media library permissions
        return true;
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
        // For web demo, return mock photos with Pexels URLs
        return this.getMockPhotos(limit);
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
      return this.getMockPhotos(Math.min(limit, 20)); // Fallback to mock photos
    }
  }

  private static getMockPhotos(count: number): ImageMeta[] {
    const pexelsPhotos = [
      'https://images.pexels.com/photos/2387793/pexels-photo-2387793.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1591373/pexels-photo-1591373.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2850287/pexels-photo-2850287.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1624496/pexels-photo-1624496.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1766604/pexels-photo-1766604.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1308624/pexels-photo-1308624.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1092644/pexels-photo-1092644.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1640772/pexels-photo-1640772.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1366957/pexels-photo-1366957.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1366942/pexels-photo-1366942.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1366944/pexels-photo-1366944.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1366945/pexels-photo-1366945.jpeg?auto=compress&cs=tinysrgb&w=800',
    ];

    return Array.from({ length: count }, (_, index) => ({
      id: `mock_${index}`,
      uri: pexelsPhotos[index % pexelsPhotos.length],
      filename: `photo_${index}.jpg`,
      width: 800,
      height: 600,
      creationTime: Date.now() - (index * 24 * 60 * 60 * 1000),
      modificationTime: Date.now() - (index * 24 * 60 * 60 * 1000),
    }));
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
        // Return mock folders for web
        return [
          { id: 'all_photos', name: 'All Photos', count: 1247 },
          { id: 'camera', name: 'Camera', count: 892 },
          { id: 'downloads', name: 'Downloads', count: 156 },
          { id: 'screenshots', name: 'Screenshots', count: 234 },
        ];
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