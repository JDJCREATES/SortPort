/**
 * Runnable Utilities
 * 
 * NEW: Runnable helpers, pipe operations, batch processing, and async/streaming support.
 */

import { Runnable, RunnableConfig, RunnableInterface } from '@langchain/core/runnables';
import { RunnableSequence } from '../core/lcel/runnable_sequence';
import { RunnableParallel } from '../core/lcel/runnable_parallel';
import { RunnableBranch } from '../core/lcel/runnable_branch';
import { RunnableLambda } from '../core/lcel/runnable_lambda';

export class RunnableUtils {
  /**
   * Create a pipe of runnables
   */
  static pipe<T, U>(...runnables: Runnable<any, any>[]): RunnableSequence<T, U> {
    return RunnableSequence.from(runnables);
  }

  /**
   * Execute runnables in parallel
   */
  static parallel<T>(runnables: Record<string, RunnableInterface<T, any>>): RunnableParallel<T, any> {
    return RunnableParallel.from(runnables);
  }

  /**
   * Create conditional branching
   */
  static branch<T, U>(
    branches: Array<[(input: T) => boolean, RunnableInterface<T, U>]>,
    defaultBranch?: RunnableInterface<T, U>
  ): RunnableBranch<T, U> {
    return RunnableBranch.create(branches, defaultBranch);
  }

  /**
   * Create a lambda runnable from function
   */
  static lambda<T, U>(func: (input: T) => U | Promise<U>): RunnableLambda<T, Promise<U>> {
    return RunnableLambda.from((input: T) => Promise.resolve(func(input)));
  }

  /**
   * Batch process with concurrency control
   */
  static async batchProcess<T, U>(
    inputs: T[],
    runnable: RunnableInterface<T, U>,
    options: {
      concurrency?: number;
      batchSize?: number;
      preserveOrder?: boolean;
    } = {}
  ): Promise<U[]> {
    const { concurrency = 10, batchSize = 100, preserveOrder = true } = options;
    
    if (inputs.length <= batchSize) {
      return runnable.batch(inputs);
    }
    
    // Process in batches
    const results: U[] = [];
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const batchResults = await runnable.batch(batch);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Stream processing with backpressure control
   *
   * Note: This is a standalone async generator, not a RunnableInterface wrapper.
   */
  static async *streamProcess<T, U>(
    inputs: T[],
    runnable: RunnableInterface<T, U>,
    options: {
      batchSize?: number;
      delay?: number;
    } = {}
  ): AsyncGenerator<U[]> {
    const { batchSize = 10, delay = 0 } = options;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const results = await runnable.batch(batch);
      yield results;
      if (delay > 0 && i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Retry with exponential backoff
   */
  static withRetry<T, U>(
    runnable: RunnableInterface<T, Promise<U>>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
    } = {}
  ): RunnableInterface<T, Promise<U>> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2
    } = options;

    const lambda = RunnableLambda.from(async (input: T, config?: RunnableConfig) => {
      let attempt = 0;
      let delay = baseDelay;
      while (attempt <= maxRetries) {
        try {
          return await runnable.invoke(input, config);
        } catch (error) {
          attempt++;
          if (attempt > maxRetries) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, Math.min(delay, maxDelay)));
          delay *= backoffFactor;
        }
      }
      throw new Error('Max retries exceeded');
    });
    // Remove incompatible stream method
    // @ts-expect-error
    lambda.stream = undefined;
    return lambda as unknown as RunnableInterface<T, Promise<U>>;
  }

  /**
   * Add timeout to runnable
   */
  static withTimeout<T, U>(
    runnable: RunnableInterface<T, Promise<U>>,
    timeoutMs: number
  ): RunnableInterface<T, Promise<U>> {
    const lambda = RunnableLambda.from((input: T, config?: RunnableConfig) => {
      return Promise.race([
        runnable.invoke(input, config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
    });
    // Remove incompatible stream method
    // @ts-expect-error
    lambda.stream = undefined;
    return lambda as unknown as RunnableInterface<T, Promise<U>>;
  }

  /**
   * Add caching to runnable
   */
  static withCache<T, U>(
    runnable: RunnableInterface<T, Promise<U>>,
    options: {
      ttl?: number;
      maxSize?: number;
      keyGenerator?: (input: T) => string;
    } = {}
  ): RunnableInterface<T, Promise<U>> {
    const {
      ttl = 300000, // 5 minutes
      maxSize = 1000,
      keyGenerator = (input: T) => JSON.stringify(input)
    } = options;

    const cache = new Map<string, { value: U; timestamp: number }>();

    const lambda = RunnableLambda.from(async (input: T, config?: RunnableConfig) => {
      const key = keyGenerator(input);
      const now = Date.now();
      // Check cache
      const cached = cache.get(key);
      if (cached && now - cached.timestamp < ttl) {
        return cached.value;
      }
      // Execute and cache
      const result = await runnable.invoke(input, config);
      // Manage cache size
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
        }
      }
      cache.set(key, { value: result, timestamp: now });
      return result;
    });
    // Remove incompatible stream method
    // @ts-expect-error
    lambda.stream = undefined;
    return lambda as unknown as RunnableInterface<T, Promise<U>>;
  }

  /**
   * Add metrics collection to runnable
   */
  static withMetrics<T, U>(
    runnable: RunnableInterface<T, Promise<U>>,
    metricsCollector?: (metrics: ExecutionMetrics) => void
  ): RunnableInterface<T, Promise<U>> {
    const lambda = RunnableLambda.from((input: T, config?: RunnableConfig) => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      return runnable.invoke(input, config)
        .then(result => {
          const endTime = Date.now();
          const endMemory = process.memoryUsage().heapUsed;
          const metrics: ExecutionMetrics = {
            executionTime: endTime - startTime,
            memoryDelta: endMemory - startMemory,
            success: true,
            timestamp: new Date()
          };
          if (metricsCollector) {
            metricsCollector(metrics);
          }
          return result;
        })
        .catch(error => {
          const endTime = Date.now();
          const metrics: ExecutionMetrics = {
            executionTime: endTime - startTime,
            memoryDelta: 0,
            success: false,
            error: error as Error,
            timestamp: new Date()
          };
          if (metricsCollector) {
            metricsCollector(metrics);
          }
          throw error;
        });
    });
    // Remove incompatible stream method
    // @ts-expect-error
    lambda.stream = undefined;
    return lambda as unknown as RunnableInterface<T, Promise<U>>;
  }

  /**
   * Compose multiple transformations
   */
  static compose<T>(...functions: Array<(input: T) => T>): (input: T) => T {
    return (input: T) => functions.reduce((acc, fn) => fn(acc), input);
  }

  /**
   * Create a fallback chain
   */
  static withFallback<T, U>(
    primary: RunnableInterface<T, Promise<U>>,
    fallback: RunnableInterface<T, Promise<U>>
  ): RunnableInterface<T, Promise<U>> {
    const lambda = RunnableLambda.from(async (input: T, config?: RunnableConfig) => {
      try {
        return await primary.invoke(input, config);
      } catch (error) {
        console.warn('Primary runnable failed, using fallback:', error);
        return await fallback.invoke(input, config);
      }
    });
    // Remove incompatible stream method
    // @ts-expect-error
    lambda.stream = undefined;
    return lambda as unknown as RunnableInterface<T, Promise<U>>;
  }
}

interface ExecutionMetrics {
  executionTime: number;
  memoryDelta: number;
  success: boolean;
  error?: Error;
  timestamp: Date;
}
