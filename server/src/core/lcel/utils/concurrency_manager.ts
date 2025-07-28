/**
 * Concurrency Management Utilities for LCEL
 * 
 * Provides utilities for managing concurrent execution,
 * batch processing, and controlled parallelism.
 */

export interface ConcurrencyOptions {
  concurrency?: number;
  batchSize?: number;
  preserveOrder?: boolean;
}

export class ConcurrencyManager {
  /**
   * Execute functions with controlled concurrency
   */
  static async executeConcurrent<T, R>(
    items: T[],
    executor: (item: T, index: number) => Promise<R>,
    options: ConcurrencyOptions = {}
  ): Promise<R[]> {
    const {
      concurrency = 10,
      batchSize = 100,
      preserveOrder = true
    } = options;

    if (items.length === 0) return [];

    // If preserveOrder is false, use simple concurrent execution
    if (!preserveOrder) {
      return this.executeUnordered(items, executor, concurrency);
    }

    // For large datasets, use batch processing
    if (items.length > batchSize) {
      return this.executeBatched(items, executor, { ...options, batchSize });
    }

    // Standard concurrent execution with order preservation
    return this.executeOrdered(items, executor, concurrency);
  }

  /**
   * Execute with order preservation
   */
  private static async executeOrdered<T, R>(
    items: T[],
    executor: (item: T, index: number) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const semaphore = new Semaphore(concurrency);

    const promises = items.map(async (item, index) => {
      const release = await semaphore.acquire();
      try {
        results[index] = await executor(item, index);
      } finally {
        release();
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Execute without order preservation (faster)
   */
  private static async executeUnordered<T, R>(
    items: T[],
    executor: (item: T, index: number) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const semaphore = new Semaphore(concurrency);
    const promises = items.map(async (item, index) => {
      const release = await semaphore.acquire();
      try {
        return await executor(item, index);
      } finally {
        release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * Execute in batches
   */
  private static async executeBatched<T, R>(
    items: T[],
    executor: (item: T, index: number) => Promise<R>,
    options: ConcurrencyOptions
  ): Promise<R[]> {
    const { batchSize = 100, concurrency = 5 } = options;
    const results: R[] = [];

    // Split into batches
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process batches with concurrency
    const batchPromises = batches.map(async (batch, batchIndex) => {
      const batchResults = await this.executeOrdered(
        batch,
        (item, index) => executor(item, batchIndex * batchSize + index),
        concurrency
      );
      return { batchIndex, results: batchResults };
    });

    const batchResults = await Promise.all(batchPromises);

    // Merge results in order
    batchResults
      .sort((a, b) => a.batchIndex - b.batchIndex)
      .forEach(({ results: batchRes }) => {
        results.push(...batchRes);
      });

    return results;
  }

  /**
   * Create a stream processor for large datasets
   */
  static async* processStream<T, R>(
    items: T[],
    executor: (item: T, index: number) => Promise<R>,
    options: ConcurrencyOptions = {}
  ): AsyncGenerator<R[]> {
    const { batchSize = 50, concurrency = 10 } = options;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await this.executeOrdered(
        batch,
        (item, index) => executor(item, i + index),
        concurrency
      );
      yield batchResults;
    }
  }

  /**
   * Create a rate-limited executor
   */
  static createRateLimitedExecutor<T, R>(
    rateLimit: number, // requests per second
    executor: (item: T, index: number) => Promise<R>
  ): (item: T, index: number) => Promise<R> {
    const interval = 1000 / rateLimit;
    let lastExecution = 0;

    return async (item: T, index: number): Promise<R> => {
      const now = Date.now();
      const timeSinceLastExecution = now - lastExecution;
      
      if (timeSinceLastExecution < interval) {
        await new Promise(resolve => 
          setTimeout(resolve, interval - timeSinceLastExecution)
        );
      }
      
      lastExecution = Date.now();
      return executor(item, index);
    };
  }
}

/**
 * Simple semaphore implementation for concurrency control
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve(() => this.release());
      } else {
        this.waiting.push(() => {
          this.permits--;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

/**
 * Retry with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      
      if (attempt > maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}
