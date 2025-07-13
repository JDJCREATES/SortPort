/**
 * Cache for NSFW image IDs to reduce database calls
 */
export class NsfwImageCache {
  private static cache: Set<string> | null = null;
  private static lastUpdated: number = 0;
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static isValid(): boolean {
    return this.cache !== null && (Date.now() - this.lastUpdated) < this.CACHE_DURATION;
  }

  static get(): Set<string> | null {
    return this.isValid() ? this.cache : null;
  }

  static set(imageIds: string[]): void {
    this.cache = new Set(imageIds);
    this.lastUpdated = Date.now();
  }

  static clear(): void {
    this.cache = null;
    this.lastUpdated = 0;
  }

  static add(imageId: string): void {
    if (this.cache) {
      this.cache.add(imageId);
    }
  }

  static remove(imageId: string): void {
    if (this.cache) {
      this.cache.delete(imageId);
    }
  }
}