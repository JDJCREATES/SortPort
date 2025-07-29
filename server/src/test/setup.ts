/**
 * Jest Setup File
 * 
 * Global setup and configuration for tests
 */

import { config } from 'dotenv';

// Load environment variables for testing
config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests (but keep errors visible)
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  // Only suppress specific noisy logs, keep errors visible
  console.warn = jest.fn();
  console.log = jest.fn((message) => {
    // Allow important logs through
    if (typeof message === 'string' && message.includes('Server running')) {
      originalLog(message);
    }
  });
  
  // Keep error logging for debugging
  console.error = (message, ...args) => {
    // Suppress known test-related errors
    if (typeof message === 'string' && 
        (message.includes('Failed to flush metrics') || 
         message.includes('supabase') ||
         message.includes('Cannot read properties of undefined'))) {
      return;
    }
    originalError(message, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Global test cleanup
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Mock fetch globally for tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    statusText: 'OK'
  })
) as jest.Mock;

// Don't use fake timers by default as they can interfere with async operations
// Tests can opt-in to fake timers when needed

export {};
