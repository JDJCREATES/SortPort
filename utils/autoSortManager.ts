import { PhotoLoader } from './photoLoader';
import { LangChainAgent } from './langchainAgent';
import { AlbumUtils } from './albumUtils';
import { MediaStorage } from './mediaStorage';
import { UserFlags } from '../types';

export class AutoSortManager {
  private static isRunning = false;
  private static lastRunTime = 0;
  private static readonly MIN_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours minimum between runs

  static async triggerAutoSort(userFlags: UserFlags): Promise<boolean> {
    // Check if auto-sort is enabled and user has subscription
    if (!userFlags.isSubscribed) {
      console.log('Auto-sort requires SnapSort Pro subscription');
      return false;
    }

    // Prevent multiple simultaneous runs
    if (this.isRunning) {
      console.log('Auto-sort already running');
      return false;
    }

    // Check minimum interval
    const now = Date.now();
    if (now - this.lastRunTime < this.MIN_INTERVAL) {
      console.log('Auto-sort ran recently, skipping');
      return false;
    }

    try {
      this.isRunning = true;
      this.lastRunTime = now;

      console.log('Starting auto-sort process...');

      // Load settings to get last auto-sort timestamp
      const settings = await MediaStorage.loadSettings();
      if (!settings.autoSort) {
        console.log('Auto-sort disabled in settings');
        return false;
      }

      const lastAutoSortTimestamp = settings.lastAutoSortTimestamp || 0;

      // Load new photos since last auto-sort
      const newPhotos = await PhotoLoader.loadRecentPhotos(100);
      const filteredPhotos = newPhotos.filter(photo => 
        photo.creationTime > lastAutoSortTimestamp
      );

      if (filteredPhotos.length === 0) {
        console.log('No new photos to sort');
        return true;
      }

      console.log(`Found ${filteredPhotos.length} new photos to sort`);

      // Initialize LangChain agent
      const agent = new LangChainAgent();

      // Sort new photos using existing albums as context
      const existingAlbums = await AlbumUtils.loadAlbums();
      const sortPrompt = this.generateAutoSortPrompt(existingAlbums);

      const sortResults = await agent.sortImages(
        sortPrompt,
        filteredPhotos,
        userFlags,
        (completed, total) => {
          console.log(`Auto-sort progress: ${completed}/${total}`);
        }
      );

      // Process results and update existing albums
      for (const newAlbum of sortResults.albums) {
        await this.upsertAlbumIntelligently(newAlbum, existingAlbums);
      }

      // Update last auto-sort timestamp
      await MediaStorage.updateLastAutoSortTimestamp(now);

      console.log(`Auto-sort completed: ${sortResults.albums.length} albums updated`);
      return true;

    } catch (error) {
      console.error('Auto-sort failed:', error);
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  private static generateAutoSortPrompt(existingAlbums: any[]): string {
    if (existingAlbums.length === 0) {
      return 'Automatically organize these new photos into smart albums based on content, location, and context.';
    }

    const albumNames = existingAlbums.map(album => album.name).join(', ');
    return `Organize these new photos into existing albums (${albumNames}) or create new albums if the content doesn't fit existing categories. Maintain consistency with existing organization patterns.`;
  }

  private static async upsertAlbumIntelligently(newAlbum: any, existingAlbums: any[]): Promise<void> {
    // Find the best matching existing album
    const matchingAlbum = this.findBestMatchingAlbum(newAlbum, existingAlbums);

    if (matchingAlbum) {
      // Merge with existing album
      const updatedImageIds = [...new Set([...matchingAlbum.imageIds, ...newAlbum.imageIds])];
      const updatedTags = [...new Set([...matchingAlbum.tags, ...newAlbum.tags])];
      
      await AlbumUtils.updateAlbum(matchingAlbum.id, {
        imageIds: updatedImageIds,
        tags: updatedTags,
        count: updatedImageIds.length,
        thumbnail: newAlbum.thumbnail || matchingAlbum.thumbnail,
      });

      console.log(`Updated existing album: ${matchingAlbum.name} (+${newAlbum.imageIds.length} photos)`);
    } else {
      // Create new album
      await AlbumUtils.addAlbum(newAlbum);
      console.log(`Created new album: ${newAlbum.name} (${newAlbum.count} photos)`);
    }
  }

  private static findBestMatchingAlbum(newAlbum: any, existingAlbums: any[]): any | null {
    let bestMatch = null;
    let bestScore = 0;

    for (const existingAlbum of existingAlbums) {
      const score = this.calculateAlbumSimilarity(newAlbum, existingAlbum);
      if (score > bestScore && score > 0.6) { // 60% similarity threshold
        bestScore = score;
        bestMatch = existingAlbum;
      }
    }

    return bestMatch;
  }

  private static calculateAlbumSimilarity(album1: any, album2: any): number {
    // Calculate similarity based on name and tags
    const nameScore = this.calculateStringSimilarity(
      album1.name.toLowerCase(), 
      album2.name.toLowerCase()
    );

    const tagScore = this.calculateTagSimilarity(album1.tags, album2.tags);

    // Weighted average: name 40%, tags 60%
    return (nameScore * 0.4) + (tagScore * 0.6);
  }

  private static calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    
    let matches = 0;
    for (const word1 of words1) {
      if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
        matches++;
      }
    }

    return matches / Math.max(words1.length, words2.length);
  }

  private static calculateTagSimilarity(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 && tags2.length === 0) return 1;
    if (tags1.length === 0 || tags2.length === 0) return 0;

    const set1 = new Set(tags1.map(tag => tag.toLowerCase()));
    const set2 = new Set(tags2.map(tag => tag.toLowerCase()));
    
    const intersection = new Set([...set1].filter(tag => set2.has(tag)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  static canRunAutoSort(userFlags: UserFlags): boolean {
    return userFlags.isSubscribed && !this.isRunning;
  }

  static getLastRunTime(): number {
    return this.lastRunTime;
  }

  static isCurrentlyRunning(): boolean {
    return this.isRunning;
  }
}