import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { AppSettings, CustomThemeColors, ImageMeta } from '../types';

export class MediaStorage {
  private static SETTINGS_KEY = '@snapsort_settings';
  private static PROCESSED_IMAGES_KEY = '@snapsort_processed';

  static async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  static async loadSettings(): Promise<AppSettings> {
    try {
      const data = await AsyncStorage.getItem(this.SETTINGS_KEY);
      return data ? JSON.parse(data) : {
        darkMode: false,
        autoSort: false,
        nsfwFilter: true,
        notifications: true,
        customColors: undefined,
        selectedFolders: ['all_photos'],
        lastAutoSortTimestamp: 0,
        showModeratedContent: false,
        showModeratedInMainAlbums: false,
      };
    } catch (error) {
      console.error('Error loading settings:', error);
      return {
        darkMode: false,
        autoSort: false,
        nsfwFilter: true,
        notifications: true,
        customColors: undefined,
        selectedFolders: ['all_photos'],
        lastAutoSortTimestamp: 0,
        showModeratedContent: false,
        showModeratedInMainAlbums: false,
      };
    }
  }

  static async updateCustomColors(colors: CustomThemeColors): Promise<void> {
    try {
      const settings = await this.loadSettings();
      settings.customColors = colors;
      await this.saveSettings(settings);
    } catch (error) {
      console.error('Error updating custom colors:', error);
    }
  }

  static async updateSelectedFolders(folderIds: string[]): Promise<void> {
    try {
      const settings = await this.loadSettings();
      settings.selectedFolders = folderIds;
      await this.saveSettings(settings);
    } catch (error) {
      console.error('Error updating selected folders:', error);
    }
  }

  static async updateLastAutoSortTimestamp(timestamp: number): Promise<void> {
    try {
      const settings = await this.loadSettings();
      settings.lastAutoSortTimestamp = timestamp;
      await this.saveSettings(settings);
    } catch (error) {
      console.error('Error updating last auto-sort timestamp:', error);
    }
  }

  static async markImageAsProcessed(imageId: string): Promise<void> {
    try {
      const processed = await this.getProcessedImages();
      processed.add(imageId);
      await AsyncStorage.setItem(
        this.PROCESSED_IMAGES_KEY,
        JSON.stringify([...processed])
      );
    } catch (error) {
      console.error('Error marking image as processed:', error);
    }
  }

  static async getProcessedImages(): Promise<Set<string>> {
    try {
      const data = await AsyncStorage.getItem(this.PROCESSED_IMAGES_KEY);
      const processed = data ? JSON.parse(data) : [];
      return new Set(processed);
    } catch (error) {
      console.error('Error getting processed images:', error);
      return new Set();
    }
  }

  static async saveAlbumToDevice(photos: ImageMeta[], folderName: string): Promise<void> {
    try {
      // Check if running on web
      if (Platform.OS === 'web') {
        throw new Error('Album export is only available on mobile devices. Please use the mobile app to export albums.');
      }

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Media library permission is required to export albums. Please grant permission in your device settings.');
      }

      if (photos.length === 0) {
        throw new Error('No photos to export. The album appears to be empty.');
      }

      // Create assets from photo URIs
      const createdAssets: MediaLibrary.Asset[] = [];
      const failedPhotos: string[] = [];

      for (const photo of photos) {
        try {
          const asset = await MediaLibrary.createAssetAsync(photo.uri);
          createdAssets.push(asset);
        } catch (error) {
          console.warn(`Failed to create asset for photo ${photo.filename}:`, error);
          failedPhotos.push(photo.filename);
        }
      }

      if (createdAssets.length === 0) {
        throw new Error('Failed to create any assets from the photos. Please check that the photos are accessible.');
      }

      // Check if album already exists
      let targetAlbum: MediaLibrary.Album | null = null;
      try {
        targetAlbum = await MediaLibrary.getAlbumAsync(folderName);
      } catch (error) {
        // Album doesn't exist, we'll create it
        console.log(`Album "${folderName}" doesn't exist, will create new one`);
      }

      if (targetAlbum) {
        // Add assets to existing album
        await MediaLibrary.addAssetsToAlbumAsync(createdAssets, targetAlbum.id);
        console.log(`✅ Added ${createdAssets.length} photos to existing album "${folderName}"`);
      } else {
        // Create new album with first asset, then add remaining assets
        const firstAsset = createdAssets[0];
        const newAlbum = await MediaLibrary.createAlbumAsync(folderName, firstAsset, false);
        
        // Add remaining assets if any
        if (createdAssets.length > 1) {
          const remainingAssets = createdAssets.slice(1);
          await MediaLibrary.addAssetsToAlbumAsync(remainingAssets, newAlbum.id);
        }
        
        console.log(`✅ Created new album "${folderName}" with ${createdAssets.length} photos`);
      }

      // Log any failed photos
      if (failedPhotos.length > 0) {
        console.warn(`⚠️ Failed to export ${failedPhotos.length} photos:`, failedPhotos);
      }

    } catch (error) {
      console.error('Error saving album to device:', error);
      throw error;
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.SETTINGS_KEY,
        this.PROCESSED_IMAGES_KEY,
      ]);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}