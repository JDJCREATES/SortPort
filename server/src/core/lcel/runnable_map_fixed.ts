/**
 * LCEL Runnable Map Implementation
 * 
 * Provides batch processing, array operations, and parallel mapping capabilities.
 * Applies operations to arrays of inputs with parallel processing support.
 * 
 * Input: Array of items to process
 * Output: Array of processed results
 * 
 * Key Methods:
 * - map(runnable): Apply runnable to each item
 * - invoke(input, config): Execute mapping operation
 * - batch(inputs, config): Execute on multiple input arrays
 * - withConcurrency(limit): Set concurrency limit
 * - filter(predicate): Filter items before mapping
 * - reduce(reducer, initial): Reduce mapped results
 */

import { Runnable, RunnableConfig, RunnableInterface } from '@langchain/core/runnables';
import { RunnableLambda } from './runnable_lambda';
import { ConcurrencyManager, ConcurrencyOptions } from './utils/concurrency_manager';

export interface MapConfig extends RunnableConfig {
  concurrency?: number;
  batchSize?: number;
  preserveOrder?: boolean;
}

export class RunnableMap<RunInput = any, RunOutput = any> extends Runnable<RunInput[], RunOutput[]> {
  private mapRunnable: RunnableInterface<RunInput, RunOutput>;
  private concurrencyLimit: number;
  private batchSize: number;
  private preserveOrder: boolean;
  public lc_namespace = ["runnable_map_fixed"];

  constructor(
    mapRunnable: RunnableInterface<RunInput, RunOutput>,
    options: {
      concurrency?: number;
      batchSize?: number;
      preserveOrder?: boolean;
    } = {}
  ) {
    super();
    this.mapRunnable = mapRunnable;
    this.concurrencyLimit = options.concurrency || 10;
    this.batchSize = options.batchSize || 100;
    this.preserveOrder = options.preserveOrder !== false;
  }

  /**
   * Execute mapping operation on array of inputs
   */
  async invoke(input: RunInput[], config?: MapConfig): Promise<RunOutput[]> {
    const startTime = Date.now();
    try {
      const concurrency = config?.concurrency || this.concurrencyLimit;
      const batchSize = config?.batchSize || this.batchSize;
      const preserveOrder = config?.preserveOrder !== false;

      const options: ConcurrencyOptions = {
        concurrency,
        batchSize,
        preserveOrder
      };

      const results = await ConcurrencyManager.executeConcurrent(
        input,
        async (item: RunInput, index: number) => {
          return await this.mapRunnable.invoke(item, config);
        },
        options
      );

      // Log execution metrics if config includes callbackManager
      if (config?.callbacks && typeof config.callbacks === 'object' && 'onChainEnd' in config.callbacks && typeof config.callbacks.onChainEnd === 'function') {
        const duration = Date.now() - startTime;
        config.callbacks.onChainEnd({
          chainId: 'runnable_map',
          inputs: { input, count: input.length },
          outputs: { results, count: results.length },
          executionTime: duration
        });
      }

      return results;
    } catch (error) {
      // Log error if config includes callbackManager
      if (config?.callbacks && typeof config.callbacks === 'object' && 'onChainError' in config.callbacks && typeof config.callbacks.onChainError === 'function') {
        config.callbacks.onChainError({
          chainId: 'runnable_map',
          inputs: { input, count: input.length },
          error: error as Error
        });
      }
      throw error;
    }
  }

  /**
   * Execute on multiple input arrays
   */
  async batch(inputs: RunInput[][], config?: MapConfig): Promise<RunOutput[][]> {
    const promises = inputs.map(inputArray => this.invoke(inputArray, config));
    return Promise.all(promises);
  }

  /**
   * Stream mapping results
   */
  async mapStream(input: RunInput[], config?: MapConfig): Promise<AsyncIterable<RunOutput[]>> {
    const concurrency = config?.concurrency || this.concurrencyLimit;
    const batchSize = config?.batchSize || Math.min(this.batchSize, 20);
    const options: ConcurrencyOptions = {
      concurrency,
      batchSize,
      preserveOrder: config?.preserveOrder !== false
    };
    return ConcurrencyManager.processStream(
      input,
      async (item: RunInput, index: number) => {
        return await this.mapRunnable.invoke(item, config);
      },
      options
    );
  }

  /**
   * Set concurrency limit
   */
  withConcurrency(limit: number): RunnableMap<RunInput, RunOutput> {
    return new RunnableMap(this.mapRunnable, {
      concurrency: limit,
      batchSize: this.batchSize,
      preserveOrder: this.preserveOrder
    });
  }

  /**
   * Set batch size for processing
   */
  withBatchSize(size: number): RunnableMap<RunInput, RunOutput> {
    return new RunnableMap(this.mapRunnable, {
      concurrency: this.concurrencyLimit,
      batchSize: size,
      preserveOrder: this.preserveOrder
    });
  }

  /**
   * Set order preservation preference
   */
  withOrderPreservation(preserve: boolean): RunnableMap<RunInput, RunOutput> {
    return new RunnableMap(this.mapRunnable, {
      concurrency: this.concurrencyLimit,
      batchSize: this.batchSize,
      preserveOrder: preserve
    });
  }

  /**
   * Create new map with config
   */
  mapWithConfig(config: Partial<MapConfig>): RunnableMap<RunInput, RunOutput> {
    return new RunnableMap(this.mapRunnable, {
      concurrency: config.concurrency || this.concurrencyLimit,
      batchSize: config.batchSize || this.batchSize,
      preserveOrder: config.preserveOrder !== false
    });
  }

  /**
   * Get map runnable
   */
  getMapRunnable(): RunnableInterface<RunInput, RunOutput> {
    return this.mapRunnable;
  }

  /**
   * Execute with controlled concurrency
   */
  private async executeWithConcurrency(inputs: RunInput[], config?: MapConfig): Promise<RunOutput[]> {
    const concurrency = config?.concurrency || this.concurrencyLimit;
    const preserveOrder = config?.preserveOrder !== false;

    return ConcurrencyManager.executeConcurrent(
      inputs,
      async (item: RunInput) => {
        return await this.mapRunnable.invoke(item, config);
      },
      { concurrency, preserveOrder }
    );
  }

  /**
   * Execute in batches
   */
  private async executeBatched(inputs: RunInput[], config?: MapConfig): Promise<RunOutput[]> {
    const batchSize = config?.batchSize || this.batchSize;
    const concurrency = config?.concurrency || this.concurrencyLimit;

    return ConcurrencyManager.executeConcurrent(
      inputs,
      async (item: RunInput) => {
        return await this.mapRunnable.invoke(item, config);
      },
      { batchSize, concurrency, preserveOrder: true }
    );
  }

  /**
   * Create map from function
   */
  static from<Input, Output>(
    mapFunction: (input: Input) => Promise<Output> | Output,
    options?: {
      concurrency?: number;
      batchSize?: number;
      preserveOrder?: boolean;
    }
  ): RunnableMap<Input, Output> {
    const lambdaRunnable = RunnableLambda.from(async (input: Input) => {
      const result = mapFunction(input);
      return await Promise.resolve(result);
    });
    return new RunnableMap(lambdaRunnable, options);
  }

  /**
   * Create parallel map with high concurrency
   */
  static parallel<Input, Output>(
    mapRunnable: RunnableInterface<Input, Output>,
    concurrency: number = 20
  ): RunnableMap<Input, Output> {
    return new RunnableMap(mapRunnable, { concurrency, preserveOrder: false });
  }

  /**
   * Create sequential map (concurrency = 1)
   */
  static sequential<Input, Output>(
    mapRunnable: RunnableInterface<Input, Output>
  ): RunnableMap<Input, Output> {
    return new RunnableMap(mapRunnable, { concurrency: 1, preserveOrder: true });
  }

  /**
   * Create batched map for large datasets
   */
  static batched<Input, Output>(
    mapRunnable: RunnableInterface<Input, Output>,
    batchSize: number = 50,
    concurrency: number = 5
  ): RunnableMap<Input, Output> {
    return new RunnableMap(mapRunnable, { batchSize, concurrency, preserveOrder: true });
  }

  /**
   * Combine with filter operation
   */
  withFilter(predicate: (input: RunInput) => boolean): RunnableMap<RunInput, RunOutput> {
    const filterLambda = RunnableLambda.from((inputs: RunInput[]) => {
      return inputs.filter(predicate);
    });

    // Create a composite runnable that filters then maps
    const compositeRunnable = RunnableLambda.from(async (inputs: RunInput[]) => {
      const filtered = inputs.filter(predicate);
      return this.invoke(filtered);
    });

    return new RunnableMap(compositeRunnable as any, {
      concurrency: this.concurrencyLimit,
      batchSize: this.batchSize,
      preserveOrder: this.preserveOrder
    });
  }

  /**
   * Combine with reduce operation
   */
  mapWithReduce<ReduceOutput>(
    reducer: (acc: ReduceOutput, current: RunOutput, index: number) => ReduceOutput,
    initialValue: ReduceOutput
  ): RunnableLambda<RunInput[], Promise<ReduceOutput>> {
    return RunnableLambda.from(async (inputs: RunInput[]) => {
      const mappedResults = await this.invoke(inputs);
      return mappedResults.reduce(reducer, initialValue);
    });
  }

  /**
   * Create a map that retries failed items
   */
  mapWithRetry(maxRetries: number = 3, baseDelay: number = 1000): RunnableMap<RunInput, RunOutput> {
    const retryRunnable = RunnableLambda.from(async (input: RunInput) => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const result = this.mapRunnable.invoke(input);
          return await Promise.resolve(result);
        } catch (error) {
          attempt++;
          if (attempt > maxRetries) throw error;
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      throw new Error('Max retries exceeded');
    });
    return new RunnableMap(retryRunnable, {
      concurrency: this.concurrencyLimit,
      batchSize: this.batchSize,
      preserveOrder: this.preserveOrder
    });
  }

  /**
   * Create a map with rate limiting
   */
  mapWithRateLimit(requestsPerSecond: number): RunnableMap<RunInput, RunOutput> {
    const rateLimitedRunnable = RunnableLambda.from(async (input: RunInput) => {
      const delay = 1000 / requestsPerSecond;
      await new Promise(resolve => setTimeout(resolve, delay));
      const result = this.mapRunnable.invoke(input);
      return await Promise.resolve(result);
    });
    return new RunnableMap(rateLimitedRunnable, {
      concurrency: Math.min(this.concurrencyLimit, requestsPerSecond),
      batchSize: this.batchSize,
      preserveOrder: this.preserveOrder
    });
  }
}
