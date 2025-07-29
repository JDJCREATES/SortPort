/**
 * Performance and Load Tests
 * 
 * Tests for endpoint performance, concurrency, and load handling
 */

import request from 'supertest';
import { app } from '../index';
import TestHelpers from './test-helpers';
import { virtualImageManager } from '../lib/imageProcessing/virtual_image_manager';
import { sortingDispatcher } from '../lib/langchain/index';

// Mock dependencies
jest.mock('../lib/supabase/client');
jest.mock('../lib/imageProcessing/virtual_image_manager');
jest.mock('../lib/langchain/index');

const mockVirtualImageManager = virtualImageManager as jest.Mocked<typeof virtualImageManager>;
const mockSortingDispatcher = sortingDispatcher as jest.Mocked<typeof sortingDispatcher>;

describe('Performance Tests', () => {
  const testUser = TestHelpers.createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    TestHelpers.setupAuthMock(app, testUser);

    // Setup default mocks
    mockSortingDispatcher.dispatch.mockResolvedValue(
      TestHelpers.createMockSortResponse()
    );
    mockVirtualImageManager.processImage.mockResolvedValue(
      TestHelpers.createMockVirtualImage()
    );
  });

  describe('Endpoint Response Times', () => {
    test('GET /api/health should respond quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(100); // Should respond in under 100ms
      expect(response.body.status).toBe('healthy');
    });

    test('POST /api/sort/ should complete within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/sort/')
        .send(TestHelpers.createMockSortRequest())
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(response.body.success).toBe(true);
    });

    test('POST /api/virtual-images/ should handle creation efficiently', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/virtual-images/')
        .send({
          user_id: testUser.id,
          original_path: '/uploads/test.jpg',
          original_name: 'test.jpg',
          rekognitionData: TestHelpers.createMockRekognitionData()
        })
        .expect(201);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(2000); // Should complete in under 2 seconds
      expect(response.body.success).toBe(true);
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle multiple simultaneous sort requests', async () => {
      const concurrentRequests = 10;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = request(app)
          .post('/api/sort/')
          .send({
            ...TestHelpers.createMockSortRequest(),
            query: `Sort request ${i}`,
            imageIds: [`img${i}1`, `img${i}2`]
          });
        promises.push(promise);
      }

      const responses = await Promise.all(promises);
      
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Verify all requests were handled
      expect(mockSortingDispatcher.dispatch).toHaveBeenCalledTimes(concurrentRequests);
    });

    test('should handle concurrent virtual image operations', async () => {
      const concurrentCreations = 5;
      const promises: Promise<request.Response>[] = [];

      mockVirtualImageManager.processBatch.mockResolvedValue([
        TestHelpers.createMockVirtualImage(),
        TestHelpers.createMockVirtualImage(),
        TestHelpers.createMockVirtualImage(),
        TestHelpers.createMockVirtualImage(),
        TestHelpers.createMockVirtualImage()
      ]);

      for (let i = 0; i < concurrentCreations; i++) {
        const promise = request(app)
          .post('/api/virtual-images/')
          .send({
            user_id: testUser.id,
            original_path: `/uploads/concurrent-test-${i}.jpg`,
            original_name: `concurrent-test-${i}.jpg`,
            rekognitionData: TestHelpers.createMockRekognitionData()
          });
        promises.push(promise);
      }

      const responses = await Promise.all(promises);
      
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    test('should handle mixed endpoint requests concurrently', async () => {
      const mixedPromises = [
        // Health checks
        request(app).get('/api/health'),
        request(app).get('/api/health'),
        
        // Sort requests
        request(app)
          .post('/api/sort/')
          .send(TestHelpers.createMockSortRequest()),
        
        // Virtual image operations
        request(app)
          .post('/api/virtual-images/')
          .send({
            user_id: testUser.id,
            original_path: '/uploads/mixed-test.jpg',
            original_name: 'mixed-test.jpg'
          }),
        
        // LCEL operations
        request(app)
          .post('/api/lcel/sort')
          .send({
            ...TestHelpers.createMockSortRequest(),
            chainConfig: { type: 'advanced' }
          })
      ];

      const responses = await Promise.all(mixedPromises);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(400);
      });
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory with repeated requests', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 50;

      // Make many requests to check for memory leaks
      for (let i = 0; i < iterations; i++) {
        await request(app)
          .post('/api/sort/')
          .send({
            ...TestHelpers.createMockSortRequest(),
            query: `Memory test ${i}`
          })
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      
      // Memory should not have grown excessively (allow for some growth)
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxAllowedGrowth = 50 * 1024 * 1024; // 50MB
      
      expect(memoryGrowth).toBeLessThan(maxAllowedGrowth);
    });

    test('should handle large payloads efficiently', async () => {
      const largeImageList = Array.from({ length: 100 }, (_, i) => `img${i}`);
      
      const response = await request(app)
        .post('/api/sort/')
        .send({
          ...TestHelpers.createMockSortRequest(),
          imageIds: largeImageList,
          maxResults: 100
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSortingDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          imageIds: largeImageList
        }),
        expect.any(Object)
      );
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary service failures', async () => {
      // First request fails
      mockSortingDispatcher.dispatch
        .mockRejectedValueOnce(new Error('Temporary service failure'))
        .mockResolvedValueOnce(TestHelpers.createMockSortResponse());

      // First request should fail
      await request(app)
        .post('/api/sort/')
        .send(TestHelpers.createMockSortRequest())
        .expect(500);

      // Second request should succeed (service recovered)
      const response = await request(app)
        .post('/api/sort/')
        .send(TestHelpers.createMockSortRequest())
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle partial failures in batch operations', async () => {
      const batchItems = [
        {
          user_id: testUser.id,
          original_path: '/uploads/batch1.jpg',
          original_name: 'batch1.jpg'
        },
        {
          user_id: testUser.id,
          original_path: '/uploads/batch2.jpg',
          original_name: 'batch2.jpg'
        }
      ];

      // Mock partial success (one item succeeds, one fails)
      mockVirtualImageManager.processBatch.mockResolvedValue([
        TestHelpers.createMockVirtualImage(),
        null // Represents a failed processing
      ]);

      const response = await request(app)
        .post('/api/virtual-images/batch')
        .send({
          operation: 'create',
          items: batchItems
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(response.body.data.successful).toBe(1);
      expect(response.body.data.failed).toBe(1);
    });
  });

  describe('Rate Limiting Behavior', () => {
    test('should enforce rate limits correctly', async () => {
      // This test simulates rate limiting behavior
      // In a real scenario, you'd need to configure actual rate limits
      
      const rapidRequests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/sort/')
          .send(TestHelpers.createMockSortRequest())
      );

      const responses = await Promise.allSettled(rapidRequests);
      
      // Most requests should succeed, but some might be rate limited
      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && 
                 (result.value as any).status === 200
      );
      
      const rateLimitedResponses = responses.filter(
        result => result.status === 'fulfilled' && 
                 (result.value as any).status === 429
      );

      // At least some requests should succeed
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      // If rate limiting is active, some requests should be limited
      if (rateLimitedResponses.length > 0) {
        rateLimitedResponses.forEach(result => {
          const response = (result as any).value;
          expect(response.body.error).toContain('rate');
        });
      }
    });
  });

  describe('Data Validation Performance', () => {
    test('should validate complex data structures efficiently', async () => {
      const complexRekognitionData = {
        ...TestHelpers.createMockRekognitionData(),
        Labels: Array.from({ length: 100 }, (_, i) => ({
          Name: `Label${i}`,
          Confidence: Math.random() * 100,
          Instances: Array.from({ length: 5 }, (_, j) => ({
            BoundingBox: {
              Width: Math.random(),
              Height: Math.random(),
              Left: Math.random(),
              Top: Math.random()
            }
          }))
        }))
      };

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/virtual-images/')
        .send({
          user_id: testUser.id,
          original_path: '/uploads/complex-data-test.jpg',
          original_name: 'complex-data-test.jpg',
          rekognitionData: complexRekognitionData
        })
        .expect(201);

      const validationTime = Date.now() - startTime;
      
      expect(validationTime).toBeLessThan(1000); // Should validate in under 1 second
      expect(response.body.success).toBe(true);
    });
  });
});

describe('Load Tests', () => {
  const testUser = TestHelpers.createMockUser();

  beforeEach(() => {
    jest.clearAllMocks();
    TestHelpers.setupAuthMock(app, testUser);

    // Setup mocks for load testing
    mockSortingDispatcher.dispatch.mockImplementation(async (request) => {
      // Simulate processing time
      await TestHelpers.wait(Math.random() * 100);
      return TestHelpers.createMockSortResponse();
    });

    mockVirtualImageManager.processImage.mockImplementation(async (input) => {
      // Simulate processing time
      await TestHelpers.wait(Math.random() * 50);
      return TestHelpers.createMockVirtualImage();
    });
  });

  test('should handle sustained load', async () => {
    const loadTestDuration = 5000; // 5 seconds
    const requestInterval = 100; // Request every 100ms
    const startTime = Date.now();
    const results: any[] = [];

    while (Date.now() - startTime < loadTestDuration) {
      const requestPromise = request(app)
        .post('/api/sort/')
        .send({
          ...TestHelpers.createMockSortRequest(),
          query: `Load test ${Date.now()}`
        });

      results.push(requestPromise);
      
      await TestHelpers.wait(requestInterval);
    }

    // Wait for all requests to complete
    const responses = await Promise.allSettled(results);
    
    // Analyze results
    const successful = responses.filter(
      result => result.status === 'fulfilled' && 
               (result.value as any).status === 200
    );
    
    const failed = responses.filter(
      result => result.status === 'rejected' || 
               (result.status === 'fulfilled' && (result.value as any).status >= 400)
    );

    console.log(`Load test results: ${successful.length} successful, ${failed.length} failed`);
    
    // At least 80% should succeed under load
    const successRate = successful.length / responses.length;
    expect(successRate).toBeGreaterThan(0.8);
  });
});
