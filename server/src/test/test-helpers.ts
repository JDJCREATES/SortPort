/**
 * Test Utilities
 * 
 * Shared utilities for testing API endpoints
 */

import { Express } from 'express';
import { supabaseService } from '../lib/supabase/client';
import { VirtualImage } from '../types/sorting';

export interface TestUser {
  id: string;
  email: string;
  credits: number;
}

export interface TestContext {
  requestId: string;
  startTime: number;
  user: TestUser;
}

export class TestHelpers {
  /**
   * Create a mock user for testing
   */
  static createMockUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      credits: 100,
      ...overrides
    };
  }

  /**
   * Create a mock context for testing
   */
  static createMockContext(user?: TestUser): TestContext {
    return {
      requestId: 'test-request-' + Math.random().toString(36).substr(2, 9),
      startTime: Date.now(),
      user: user || this.createMockUser()
    };
  }

  /**
   * Create a mock virtual image for testing
   */
  static createMockVirtualImage(overrides: Partial<VirtualImage> = {}): VirtualImage {
    const now = new Date().toISOString();
    
    return {
      id: 'virtual-img-' + Math.random().toString(36).substr(2, 9),
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      original_path: '/uploads/test-image.jpg',
      original_name: 'test-image.jpg',
      hash: 'abc123def456',
      thumbnail: null,
      virtual_name: 'AI Generated Name',
      virtual_tags: ['sunset', 'ocean'],
      virtual_albums: undefined,
      virtual_description: 'Beautiful sunset over the ocean',
      nsfw_score: 0.1,
      isflagged: false,
      caption: 'A beautiful sunset scene',
      vision_summary: 'Image shows a sunset over water',
      vision_sorted: false,
      embedding: null,
      metadata: {
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        rekognition: {
          raw: {
            Labels: [
              { Name: 'Sunset', Confidence: 95.5 },
              { Name: 'Ocean', Confidence: 88.2 }
            ]
          },
          processed: {
            objects: ['sunset', 'ocean'],
            faces: [],
            nsfwScore: 0.1,
            isNsfw: false
          }
        }
      },
      created_at: now,
      updated_at: now,
      sortorder: null,
      date_taken: '2024-01-15T18:30:00Z',
      date_modified: '2024-01-15T18:30:00Z',
      date_imported: now,
      location_lat: null,
      location_lng: null,
      location_name: null,
      location_country: null,
      location_city: null,
      dominant_colors: ['#FF6B35', '#F7931E'],
      detected_objects: ['sunset', 'ocean', 'sky'],
      detected_faces_count: 0,
      scene_type: 'Outdoors',
      brightness_score: 0.8,
      blur_score: 0.9,
      quality_score: 0.85,
      aesthetic_score: null,
      emotion_detected: null,
      activity_detected: null,
      image_orientation: null,
      ...overrides
    } as VirtualImage;
  }

  /**
   * Create mock Rekognition data
   */
  static createMockRekognitionData() {
    return {
      Labels: [
        {
          Name: 'Ocean',
          Confidence: 95.5,
          Instances: [{
            BoundingBox: { Width: 0.8, Height: 0.6, Left: 0.1, Top: 0.2 }
          }],
          Parents: [{ Name: 'Water' }],
          Categories: [{ Name: 'Nature' }]
        },
        {
          Name: 'Sunset',
          Confidence: 88.2,
          Instances: [],
          Parents: [{ Name: 'Sky' }],
          Categories: [{ Name: 'Nature' }]
        }
      ],
      ModerationLabels: [
        {
          Name: 'Safe Content',
          Confidence: 99.9,
          ParentName: undefined
        }
      ],
      FaceDetails: [],
      ImageProperties: {
        Quality: {
          Brightness: 75.5,
          Sharpness: 82.3,
          Contrast: 68.9
        },
        DominantColors: [
          {
            Red: 255,
            Green: 107,
            Blue: 53,
            HexCode: '#FF6B35',
            SimplifiedColor: 'Orange',
            CssColor: 'orange',
            PixelPercentage: 35.2
          },
          {
            Red: 247,
            Green: 147,
            Blue: 30,
            HexCode: '#F7931E',
            SimplifiedColor: 'Orange',
            CssColor: 'darkorange',
            PixelPercentage: 28.7
          }
        ]
      },
      TextDetections: []
    };
  }

  /**
   * Create mock sort request
   */
  static createMockSortRequest(overrides: any = {}) {
    return {
      query: 'Sort my photos by quality',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      imageIds: ['img1', 'img2', 'img3'],
      sortType: 'custom' as const,
      useVision: false,
      maxResults: 10,
      ...overrides
    };
  }

  /**
   * Create mock sort response
   */
  static createMockSortResponse(overrides: any = {}) {
    return {
      sortedImages: [
        {
          id: 'img1',
          originalPath: '/path/to/img1.jpg',
          virtualName: 'Beautiful sunset',
          sortScore: 0.95,
          reasoning: 'High quality image with good composition',
          position: 1,
          metadata: { tone: 'warm', scene: 'outdoor' }
        },
        {
          id: 'img2',
          originalPath: '/path/to/img2.jpg',
          virtualName: 'City lights',
          sortScore: 0.87,
          reasoning: 'Good urban night photography',
          position: 2,
          metadata: { tone: 'cool', scene: 'urban' }
        }
      ],
      reasoning: 'Sorted by image quality and composition',
      confidence: 0.9,
      usedVision: false,
      processingTime: 1250,
      cost: {
        credits: 1,
        breakdown: { embedding: 0, vision: 0, processing: 1 }
      },
      ...overrides
    };
  }

  /**
   * Setup authentication mock for Express app
   */
  static setupAuthMock(app: Express, user?: TestUser) {
    const mockUser = user || this.createMockUser();
    const mockContext = this.createMockContext(mockUser);

    // Mock authentication middleware
    (app as any)._router.stack.forEach((layer: any) => {
      if (layer.name === 'auth' || layer.handle.name === 'auth') {
        layer.handle = (req: any, res: any, next: any) => {
          req.user = mockUser;
          req.context = mockContext;
          next();
        };
      }
    });

    return { mockUser, mockContext };
  }

  /**
   * Setup no-auth mock (for testing unauthorized access)
   */
  static setupNoAuthMock(app: Express) {
    (app as any)._router.stack.forEach((layer: any) => {
      if (layer.name === 'auth' || layer.handle.name === 'auth') {
        layer.handle = (req: any, res: any, next: any) => {
          res.status(401).json({ success: false, error: 'Unauthorized' });
        };
      }
    });
  }

  /**
   * Setup insufficient credits mock
   */
  static setupInsufficientCreditsMock(app: Express) {
    const mockUser = this.createMockUser({ credits: 0 });
    const mockContext = this.createMockContext(mockUser);

    (app as any)._router.stack.forEach((layer: any) => {
      if (layer.name === 'auth' || layer.handle.name === 'auth') {
        layer.handle = (req: any, res: any, next: any) => {
          req.user = mockUser;
          req.context = mockContext;
          next();
        };
      }
    });

    return { mockUser, mockContext };
  }

  /**
   * Validate API response structure
   */
  static validateApiResponse(response: any, expectData: boolean = true) {
    expect(response.body).toHaveProperty('success');
    expect(typeof response.body.success).toBe('boolean');

    if (expectData && response.body.success) {
      expect(response.body).toHaveProperty('data');
    }

    if (!response.body.success) {
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    }

    if (response.body.meta) {
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('requestId');
      expect(response.body.meta).toHaveProperty('version');
    }
  }

  /**
   * Create mock Atlas response
   */
  static createMockAtlasResponse(imageIds: string[] = ['img1', 'img2']) {
    const imageMap: any = {};
    
    imageIds.forEach((id, index) => {
      imageMap[index.toString()] = {
        imageId: id,
        originalPath: `/path/to/${id}.jpg`,
        bounds: {
          x: index * 256,
          y: 0,
          width: 256,
          height: 256
        }
      };
    });

    return {
      atlasUrl: 'https://example.com/atlas/generated-atlas.jpg',
      imageMap,
      cacheKey: 'test-cache-key-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };
  }

  /**
   * Generate UUID for testing
   */
  static generateTestUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Wait for a specified amount of time (useful for async tests)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up test data (if needed)
   */
  static async cleanupTestData() {
    // This could be used to clean up any test data from the database
    // For now, it's a placeholder since we're using mocks
    console.log('Test cleanup completed');
  }
}

export default TestHelpers;
