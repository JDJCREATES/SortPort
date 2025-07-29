/**
 * Simple Integration Test
 * 
 * Basic test to verify the test setup works correctly
 */

// Import mocks first
import './mocks';

import request from 'supertest';
import { app } from '../index';

describe('Basic Integration', () => {
  // Clean up async operations after each test
  afterEach(() => {
    // Clear any timers that might be running
    jest.clearAllTimers();
  });

  // Clean up after all tests
  afterAll(async () => {
    // Give time for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('should be able to start the app', () => {
    expect(app).toBeDefined();
  });

  test('health endpoint should work', async () => {
    const response = await request(app)
      .get('/health') // Note: it's /health not /api/health
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('status');
    expect(response.body.data.status).toBe('healthy');
  });

  test('should handle 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/unknown-endpoint')
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});
