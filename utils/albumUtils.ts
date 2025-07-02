import AsyncStorage from '@react-native-async-storage/async-storage';
import { Album, SortSession } from '../types';

export class AlbumUtils {
  private static ALBUMS_KEY = '@snapsort_albums';
  private static SESSIONS_KEY = '@snapsort_sessions';

  static async saveAlbums(albums: Album[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.ALBUMS_KEY, JSON.stringify(albums));
    } catch (error) {
      console.error('Error saving albums:', error);
    }
  }

  static async loadAlbums(): Promise<Album[]> {
    try {
      const data = await AsyncStorage.getItem(this.ALBUMS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading albums:', error);
      return [];
    }
  }

  static async addAlbum(album: Album): Promise<void> {
    const albums = await this.loadAlbums();
    albums.push(album);
    await this.saveAlbums(albums);
  }

  static async removeAlbum(albumId: string): Promise<void> {
    const albums = await this.loadAlbums();
    const filtered = albums.filter(album => album.id !== albumId);
    await this.saveAlbums(filtered);
  }

  static async updateAlbum(albumId: string, updates: Partial<Album>): Promise<void> {
    const albums = await this.loadAlbums();
    const index = albums.findIndex(album => album.id === albumId);
    if (index !== -1) {
      albums[index] = { ...albums[index], ...updates };
      await this.saveAlbums(albums);
    }
  }

  static async saveSortSession(session: SortSession): Promise<void> {
    try {
      const sessions = await this.loadSortSessions();
      sessions.unshift(session); // Add to beginning
      
      // Keep only last 50 sessions
      const trimmedSessions = sessions.slice(0, 50);
      
      await AsyncStorage.setItem(this.SESSIONS_KEY, JSON.stringify(trimmedSessions));
    } catch (error) {
      console.error('Error saving sort session:', error);
    }
  }

  static async loadSortSessions(): Promise<SortSession[]> {
    try {
      const data = await AsyncStorage.getItem(this.SESSIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading sort sessions:', error);
      return [];
    }
  }

  static async getSmartAlbums(): Promise<Album[]> {
    const albums = await this.loadAlbums();
    
    // Create improved default smart albums if none exist
    if (albums.length === 0) {
      const defaultAlbums: Album[] = [
        {
          id: 'smart_documents',
          name: 'Documents & Receipts',
          imageIds: [],
          tags: ['receipt', 'bill', 'invoice', 'document', 'text'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_travel',
          name: 'Travel & Adventures',
          imageIds: [],
          tags: ['travel', 'vacation', 'trip', 'adventure', 'landscape'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_screenshots',
          name: 'Screenshots & Apps',
          imageIds: [],
          tags: ['screenshot', 'screen', 'app', 'interface'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_food',
          name: 'Food & Dining',
          imageIds: [],
          tags: ['food', 'meal', 'restaurant', 'cooking', 'dining'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_people',
          name: 'People & Portraits',
          imageIds: [],
          tags: ['people', 'portrait', 'selfie', 'family', 'friends'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_nature',
          name: 'Nature & Outdoors',
          imageIds: [],
          tags: ['nature', 'outdoor', 'landscape', 'trees', 'sky', 'animals'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
      ];
      
      await this.saveAlbums(defaultAlbums);
      return defaultAlbums;
    }
    
    return albums;
  }
}