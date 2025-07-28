/**
 * LCEL Runnable Lambda Implementation
 * 
 * Provides custom function wrappers for transform operations and data processing.
 * Wraps arbitrary functions to make them compatible with LCEL chains.
 * 
 * Input: Any (passed to wrapped function)
 * Output: Any (returned from wrapped function)
 * 
 * Key Methods:
 * - invoke(input, config): Execute wrapped function
 * - batch(inputs, config): Execute function on multiple inputs
 * - stream(input, config): Stream function execution
 * - withConfig(config): Create new lambda with config
 * - compose(other): Compose with another runnable
 * - getFunction(): Get wrapped function
 */

import { Runnable, RunnableConfig } from '@langchain/core/runnables';

// Import proper IterableReadableStream from LangChain
import { IterableReadableStream } from '@langchain/core/utils/stream';

export type LambdaFunction<RunInput = any, RunOutput = any> = 
  | ((input: RunInput) => RunOutput)
  | ((input: RunInput) => Promise<RunOutput>)
  | ((input: RunInput, config?: RunnableConfig) => RunOutput)
  | ((input: RunInput, config?: RunnableConfig) => Promise<RunOutput>);

export class RunnableLambda<RunInput = any, RunOutput = any> extends Runnable<RunInput, RunOutput> {
  private func: LambdaFunction<RunInput, RunOutput>;
  public name?: string;
  
  lc_namespace = ['custom', 'runnable', 'lambda'];
  
  constructor(func: LambdaFunction<RunInput, RunOutput>, name?: string) {
    super();
    this.func = func;
    this.name = name;
  }

  /**
   * Execute wrapped function
   */
  async invoke(input: RunInput, config?: RunnableConfig): Promise<RunOutput> {
    const executionContext = {
      ...config,
      // Only use standard config properties; add custom ones as needed
      functionName: this.name || 'anonymous',
      startTime: Date.now()
    };

    try {
      const result = await this.executeWithErrorHandling(input, executionContext);
      // Optionally log metrics here if you have a custom system
      return result;
    } catch (error) {
      const enhancedError = new Error(
        `Lambda '${this.name || 'anonymous'}' execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
      (enhancedError as any).cause = error;
      throw enhancedError;
    }
  }

  /**
   * Execute function on multiple inputs
   */
  async batch(inputs: RunInput[], config?: RunnableConfig): Promise<RunOutput[]> {
    if (inputs.length === 0) return [];

    const batchConfig = {
      ...config,
      batchId: `lambda_batch_${Date.now()}`,
      batchSize: inputs.length
    };

    const concurrency = (config as any)?.concurrency || Math.min(inputs.length, 20);
    const results: RunOutput[] = new Array(inputs.length);
    const errors: Array<Error | null> = new Array(inputs.length);

    // Process inputs in controlled batches
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchPromises = batch.map(async (input, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const itemConfig: RunnableConfig = {
            ...batchConfig,
            tags: config?.tags ? [...(config.tags as string[]), `batchIndex:${globalIndex}`] : [`batchIndex:${globalIndex}`]
          };
          return await this.invoke(input, itemConfig);
        } catch (error) {
          errors[globalIndex] = error instanceof Error ? error : new Error(String(error));
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach((result, batchIndex) => {
        const globalIndex = i + batchIndex;
        if (result !== null) {
          results[globalIndex] = result;
        }
      });
    }

    // Handle errors
    const errorCount = errors.filter(e => e !== null).length;
    if (errorCount > 0 && (config as any)?.throwOnError !== false) {
      throw new Error(`Lambda batch execution failed: ${errorCount}/${inputs.length} items failed`);
    }

    return results.filter(r => r !== null);
  }

  /**
   * Stream function execution - return LangChain compatible stream
   */
  async stream(input: RunInput, options?: Partial<RunnableConfig>): Promise<IterableReadableStream<RunOutput>> {
    const streamConfig = {
      ...options,
      streamId: `lambda_stream_${Date.now()}`
    };
    
    try {
      const result = await this.invoke(input, streamConfig);
      
      // Create a proper IterableReadableStream
      return IterableReadableStream.fromAsyncGenerator(async function* () {
        yield result;
      }());
    } catch (error) {
      return IterableReadableStream.fromAsyncGenerator(async function* () {
        throw error;
      }());
    }
  }

  /**
   * Create new lambda with config
   */
  withConfig(config: Partial<RunnableConfig>): RunnableLambda<RunInput, RunOutput> {
    const newLambda = new RunnableLambda<RunInput, RunOutput>(this.func, this.name);
    (newLambda as any)._defaultConfig = config;
    return newLambda;
  }

  /**
   * Get wrapped function
   */
  getFunction(): LambdaFunction<RunInput, RunOutput> {
    return this.func;
  }

  /**
   * Get function name
   */
  getName(): string {
    return this.name ?? 'unnamed_lambda';
  }

  /**
   * Create lambda from sync function
   */
  static from<Input, Output>(
    func: (input: Input) => Output,
    name?: string
  ): RunnableLambda<Input, Output> {
    return new RunnableLambda(func, name);
  }

  /**
   * Create lambda from async function
   */
  static fromAsync<Input, Output>(
    func: (input: Input) => Promise<Output>,
    name?: string
  ): RunnableLambda<Input, Awaited<Output>> {
    return new RunnableLambda(
      async (input: Input) => {
        const result = await func(input);
        return result as Awaited<Output>;
      },
      name
    ) as unknown as RunnableLambda<Input, Awaited<Output>>;
  }

  /**
   * Create lambda with config support
   */
  static withConfig<Input, Output>(
    func: (input: Input, config?: RunnableConfig) => Output | Promise<Output>,
    name?: string
  ): RunnableLambda<Input, Awaited<Output>> {
    return new RunnableLambda(
      async (input: Input, config?: RunnableConfig) => {
        const result = await func(input, config);
        return result as Awaited<Output>;
      },
      name
    ) as unknown as RunnableLambda<Input, Awaited<Output>>;
  }

  /**
   * Create identity lambda (pass-through)
   */
  static identity<T>(): RunnableLambda<T, T> {
    return new RunnableLambda((input: T) => input, 'identity');
  }

  /**
   * Create mapping lambda for transformations
   */
  static map<Input, Output>(
    transform: (input: Input) => Output
  ): RunnableLambda<Input[], Output[]> {
    return new RunnableLambda(
      (inputs: Input[]) => inputs.map(transform),
      'map'
    );
  }

  /**
   * Create filter lambda for conditional processing
   */
  static filter<T>(
    predicate: (input: T) => boolean
  ): RunnableLambda<T[], T[]> {
    return new RunnableLambda(
      (inputs: T[]) => inputs.filter(predicate),
      'filter'
    );
  }

  /**
   * Create reduce lambda for aggregation
   */
  static reduce<Input, Output>(
    reducer: (acc: Output, current: Input, index: number) => Output,
    initialValue: Output
  ): RunnableLambda<Input[], Output> {
    return new RunnableLambda(
      (inputs: Input[]) => inputs.reduce(reducer, initialValue),
      'reduce'
    );
  }

  /**
   * Execute function with error handling
   */
  private async executeWithErrorHandling(input: RunInput, config?: RunnableConfig): Promise<RunOutput> {
    try {
      // Check if function accepts config parameter
      const acceptsConfig = this.func.length >= 2;
      
      if (this.isAsyncFunction()) {
        // Handle async function
        if (acceptsConfig) {
          return await (this.func as any)(input, config);
        } else {
          return await (this.func as any)(input);
        }
      } else {
        // Handle sync function
        if (acceptsConfig) {
          return (this.func as any)(input, config);
        } else {
          return (this.func as any)(input);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(`Lambda execution failed: ${String(error)}`);
      }
    }
  }

  /**
   * Check if function is async
   */
  private isAsyncFunction(): boolean {
    return this.func.constructor.name === 'AsyncFunction' || 
           this.func.toString().includes('async ') ||
           this.func.toString().includes('return new Promise') ||
           this.func.toString().includes('await ');
  }

  /**
   * Log execution metrics
   */
  private logExecutionMetrics(duration: number, success: boolean): void {
    console.debug(`Lambda '${this.name || 'anonymous'}': ${duration}ms, success: ${success}`);
  }

  /**
   * Validate lambda function
   */
  private validateFunction(): void {
    if (typeof this.func !== 'function') {
      throw new Error('Lambda must wrap a valid function');
    }
  }

  /**
   * Get function metadata
   */
  getMetadata(): {
    name: string;
    isAsync: boolean;
    parameterCount: number;
    acceptsConfig: boolean;
  } {
    return {
      name: this.name || 'anonymous',
      isAsync: this.isAsyncFunction(),
      parameterCount: this.func.length,
      acceptsConfig: this.func.length >= 2
    };
  }
}
