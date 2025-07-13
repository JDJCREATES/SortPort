import { Album } from '../../types';
import { AlbumManager } from './albumManager';
import { generateUUID } from '../helpers/uuid';

export class SmartAlbumManager {
  /**
   * Get smart albums with improved defaults
   */
  static async getSmartAlbums(): Promise<Album[]> {
    try {
      const albums = await AlbumManager.loadAlbums();
      
      // If user has albums, return them
      if (albums.length > 0) {
        return albums;
      }

      // For new users, create default smart albums
      const defaultAlbums: Album[] = [
        {
          id: generateUUID(),
          name: 'Documents & Receipts',
          imageIds: [],
          tags: ['receipt', 'bill', 'invoice', 'document', 'text'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Travel & Adventures',
          imageIds: [],
          tags: ['travel', 'vacation', 'trip', 'adventure', 'landscape'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Screenshots & Apps',
          imageIds: [],
          tags: ['screenshot', 'screen', 'app', 'interface'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Food & Dining',
          imageIds: [],
          tags: ['food', 'meal', 'restaurant', 'cooking', 'dining'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'People & Portraits',
          imageIds: [],
          tags: ['people', 'portrait', 'selfie', 'family', 'friends'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
        {
          id: generateUUID(),
          name: 'Nature & Outdoors',
          imageIds: [],
          tags: ['nature', 'outdoor', 'landscape', 'trees', 'sky', 'animals'],
          createdAt: Date.now(),
          count: 0,
          thumbnail: '',
        },
      ];
      
      // Save default albums to database
      await AlbumManager.saveAlbums(defaultAlbums);
      return defaultAlbums;
    } catch (error) {
      console.error('Error getting smart albums:', error);
      return [];
    }
  }
}