import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import { AppSettings, CustomThemeColors } from '../types';

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
      };
    } catch (error) {
      console.error('Error loading settings:', error);
      return {
        darkMode: false,
        autoSort: false,
        nsfwFilter: true,
        notifications: true,
        customColors: undefined,
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

  static async exportAlbum(albumId: string, albumName: string): Promise<string> {
    try {
      // Create a new album in the device's photo library
      const album = await MediaLibrary.createAlbumAsync(
        `SnapSort_${albumName}`,
        null,
        false
      );
      
      return album.id;
    } catch (error) {
      console.error('Error exporting album:', error);
      throw error;
    }
  }

  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.SETTINGS_KEY,
        this.PROCESSED_IMAGES_KEY,
        '@snapsort_albums',
        '@snapsort_sessions',
      ]);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}