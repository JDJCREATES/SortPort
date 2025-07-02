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
    
    // Create default smart albums if none exist
    if (albums.length === 0) {
      const defaultAlbums: Album[] = [
        {
          id: 'smart_receipts',
          name: 'Receipts & Bills',
          imageIds: [],
          tags: ['receipt', 'bill', 'invoice'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_travel',
          name: 'Travel Memories',
          imageIds: [],
          tags: ['travel', 'vacation', 'trip'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_screenshots',
          name: 'Screenshots',
          imageIds: [],
          tags: ['screenshot', 'screen'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: 'smart_private',
          name: 'Private / NSFW',
          imageIds: [],
          tags: ['private', 'nsfw'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
          isLocked: true,
        },
      ];
      
      await this.saveAlbums(defaultAlbums);
      return defaultAlbums;
    }
    
    return albums;
  }
}