/**
 * VirtualImageQueries Critical Tests
 *
 * Tests for Supabase queries and schema compliance
 */

import 'dotenv/config';
import { VirtualImageQueries } from '../lib/supabase/queries';

describe('VirtualImageQueries', () => {
  const testUserId = '47bbaa34-6a84-4ff3-90e5-9a3171e2cc54';

  it('should fetch images by user ID and include all schema fields', async () => {
    const images = await VirtualImageQueries.getByUserId(testUserId, { includeEmbeddings: true });
    expect(Array.isArray(images)).toBe(true);
    if (images.length > 0) {
      const img = images[0];
      expect(img).toHaveProperty('id');
      expect(img).toHaveProperty('user_id');
      expect(img).toHaveProperty('embedding');
      expect(img).toHaveProperty('vision_summary');
      expect(img).toHaveProperty('vision_sorted');
      expect(img).toHaveProperty('metadata');
      expect(img).toHaveProperty('created_at');
      expect(img).toHaveProperty('updated_at');
      expect(img).toHaveProperty('virtual_tags');
      expect(img).toHaveProperty('virtual_albums');
      expect(img).toHaveProperty('quality_score');
    }
  });

  it('should filter by album and tags', async () => {
    const images = await VirtualImageQueries.getByUserId(testUserId, { albumId: 'test-album', tags: ['nature'] });
    expect(Array.isArray(images)).toBe(true);
    // Optionally check that all images have the album/tag
    images.forEach(img => {
      expect(img.virtual_albums).toContain('test-album');
      expect(img.virtual_tags).toContain('nature');
    });
  });

  it('should sort images by quality_score descending', async () => {
    const images = await VirtualImageQueries.getByUserId(testUserId, { sortBy: 'quality_score', sortOrder: 'desc' });
    expect(Array.isArray(images)).toBe(true);
    // Optionally check sorting order
    for (let i = 1; i < images.length; i++) {
      expect((images[i-1].quality_score )).toBeGreaterThanOrEqual((images[i].quality_score || 0));
    }
  });

  it('should handle empty result sets gracefully', async () => {
    const images = await VirtualImageQueries.getByUserId('47bbaa34-6a84-4ff3-90e5-9a3171e2cc55');
    expect(Array.isArray(images)).toBe(true);
    expect(images.length).toBe(0);
  });
});
