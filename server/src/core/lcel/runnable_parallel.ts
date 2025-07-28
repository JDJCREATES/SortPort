/**
 * LCEL Runnable Parallel Implementation
 * 
 * Provides parallel execution engine for concurrent processing and result aggregation.
 * Executes multiple runnables simultaneously and aggregates results.
 * 
 * Input: Any (distributed to all parallel runnables)
 * Output: Aggregated results from all parallel executions
 * 
 * Key Methods:
 * - invoke(input, config): Execute all runnables in parallel
 * - batch(inputs, config): Execute on multiple inputs in parallel
 * - stream(input, config): Stream parallel execution results
 * - withConfig(config): Create new parallel with config
 * - getSteps(): Get parallel runnable definitions
 * - addStep(key, runnable): Add a new parallel step
 */

import { Runnable, RunnableConfig, RunnableInterface } from '@langchain/core/runnables';

// Extend RunnableConfig to support throwOnError for parallel execution
export interface ParallelRunnableConfig extends RunnableConfig {
  throwOnError?: boolean;
  batchConcurrency?: number;
}

export type ParallelSteps<RunInput = any> = {
  [key: string]: RunnableInterface<RunInput, any>;
};

export class RunnableParallel<RunInput = any, RunOutput = any> extends Runnable<RunInput, RunOutput> {
  private steps: ParallelSteps<RunInput>;
  
  lc_namespace = ['custom', 'runnable', 'parallel'];
  
  constructor(steps: ParallelSteps<RunInput>) {
    super();
    this.steps = steps;
  }

  /**
   * Execute all runnables in parallel and aggregate results
   */
  async invoke(input: RunInput, config?: ParallelRunnableConfig): Promise<RunOutput> {
    const stepKeys = Object.keys(this.steps);
    if (stepKeys.length === 0) {
      return {} as RunOutput;
    }

    const executionContext = {
      ...config,
      tags: config?.tags ? [...(config.tags as string[]), `parallel_${Date.now()}`] : [`parallel_${Date.now()}`]
    };

    const concurrency = config?.maxConcurrency || 10;
    const results = new Map<string, any>();
    const errors = new Map<string, Error>();

    try {
      // Execute steps in controlled parallel batches
      await this.executeInBatches(stepKeys, input, executionContext, concurrency, results, errors);

      // Check for errors
      if (errors.size > 0 && (config?.throwOnError ?? true)) {
        const errorMessages = Array.from(errors.entries())
          .map(([key, error]) => `${key}: ${error.message}`)
          .join('; ');
        throw new Error(`Parallel execution failed: ${errorMessages}`);
      }

      return this.aggregateResults(results) as RunOutput;
    } catch (error) {
      const enhancedError = new Error(
        `Parallel execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
      enhancedError.cause = error;
      throw enhancedError;
    }
  }

  /**
   * Execute on multiple inputs with parallel processing
   */
  async batch(inputs: RunInput[], config?: ParallelRunnableConfig): Promise<RunOutput[]> {
    if (inputs.length === 0) return [];

    const batchConfig = {
      ...config,
      batchId: `parallel_batch_${Date.now()}`,
      batchSize: inputs.length
    };

    const concurrency = Math.min(config?.batchConcurrency || 5, inputs.length);
    const results: RunOutput[] = new Array(inputs.length);

    // Process inputs in parallel, but limit concurrency
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchPromises = batch.map(async (input, batchIndex) => {
        const globalIndex = i + batchIndex;
      const itemConfig = {
        ...batchConfig,
        itemIndex: globalIndex,
        tags: Array.isArray(config?.tags)
          ? [...(config?.tags as string[]), `batchIndex_${globalIndex}`]
          : [`batchIndex_${globalIndex}`]
      };
      return await this.invoke(input, itemConfig);
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result, batchIndex) => {
        results[i + batchIndex] = result;
      });
    }

    return results;
  }

  /**
   * Custom stream method for parallel execution results
   */
  async *streamParallel(input: RunInput, config?: Partial<RunnableConfig>): AsyncGenerator<RunOutput> {
    const stepKeys = Object.keys(this.steps);
    if (stepKeys.length === 0) {
      yield {} as RunOutput;
      return;
    }

    const streamConfig = {
      ...config,
      streamId: `parallel_stream_${Date.now()}`,
      enableStreaming: true
    };

    const results = new Map<string, any>();
    // Create promises for all parallel executions
    const stepPromises = stepKeys.map(async (key) => {
      const step = this.steps[key];
      const stepConfig = {
        ...streamConfig,
        stepKey: key,
        stepName: step.constructor.name,
        tags: Array.isArray(streamConfig?.tags)
          ? [...(streamConfig?.tags as string[]), `stepKey_${key}`]
          : [`stepKey_${key}`]
      };

      try {
        if (typeof step.stream === 'function') {
          // If step supports streaming, collect all results
          const stepResults: any[] = [];
          // @ts-ignore: Accept any async iterable for streaming
          for await (const result of step.stream(input, stepConfig)) {
            stepResults.push(result);
          }
          return { key, result: stepResults[stepResults.length - 1] };
        } else {
          const result = await step.invoke(input, stepConfig);
          return { key, result };
        }
      } catch (error) {
        return { key, error: error instanceof Error ? error : new Error(String(error)) };
      }
    });

    // Yield results as they complete
    for await (const { key, result, error } of this.streamResults(stepPromises)) {
      if (error) {
        throw new Error(`Parallel stream failed for ${key}: ${error.message}`);
      }
      results.set(key, result);
      yield this.aggregateResults(results) as RunOutput;
    }
  }

  // Removed withConfig override to avoid base class signature conflict

  /**
   * Get parallel step definitions
   */
  getSteps(): ParallelSteps<RunInput> {
    return { ...this.steps };
  }

  /**
   * Add a new parallel step
   */
  addStep(key: string, runnable: RunnableInterface<RunInput, any>): RunnableParallel<RunInput, RunOutput> {
    return new RunnableParallel({
      ...this.steps,
      [key]: runnable
    });
  }

  /**
   * Remove a parallel step
   */
  removeStep(key: string): RunnableParallel<RunInput, RunOutput> {
    const newSteps = { ...this.steps };
    delete newSteps[key];
    return new RunnableParallel(newSteps);
  }

  /**
   * Create parallel from object of runnables
   */
  static from<Input, Output>(steps: ParallelSteps<Input>): RunnableParallel<Input, Output> {
    return new RunnableParallel(steps);
  }

  /**
   * Execute steps in controlled batches with concurrency limit
   */
  private async executeInBatches(
    stepKeys: string[],
    input: RunInput,
    config: Partial<RunnableConfig>,
    concurrency: number,
    results: Map<string, any>,
    errors: Map<string, Error>
  ): Promise<void> {
    for (let i = 0; i < stepKeys.length; i += concurrency) {
      const batch = stepKeys.slice(i, i + concurrency);
      const batchPromises = batch.map(async (key) => {
        const step = this.steps[key];
        const stepConfig = {
          ...config,
          stepKey: key,
          stepName: step.constructor.name,
          tags: Array.isArray(config?.tags)
            ? [...(config?.tags as string[]), `stepKey_${key}`]
            : [`stepKey_${key}`]
        };

        try {
          const result = await step.invoke(input, stepConfig);
          results.set(key, result);
        } catch (error) {
          errors.set(key, error instanceof Error ? error : new Error(String(error)));
        }
      });

      await Promise.all(batchPromises);
      
      // Allow for cancellation between batches
      if (config.signal?.aborted) {
        throw new Error('Parallel execution was cancelled');
      }
    }
  }

  /**
   * Aggregate results from parallel execution
   */
  private aggregateResults(results: Map<string, any>): RunOutput {
    const aggregated: Record<string, any> = {};
    
    for (const [key, value] of results.entries()) {
      aggregated[key] = value;
    }
    
    return aggregated as RunOutput;
  }

  /**
   * Stream results as they complete
   */
  private async *streamResults(
    promises: Promise<{ key: string; result?: any; error?: Error }>[]
  ): AsyncGenerator<{ key: string; result?: any; error?: Error }> {
    const pending = new Set(promises);
    
    while (pending.size > 0) {
      const race = Promise.race(
        Array.from(pending).map(async (promise, index) => {
          const result = await promise;
          return { result, promise, index };
        })
      );

      const { result, promise } = await race;
      pending.delete(promise);
      yield result;
    }
  }

  /**
   * Validate parallel configuration
   */
  private validateParallel(): void {
    if (Object.keys(this.steps).length === 0) {
      throw new Error('Parallel must have at least one step');
    }

    // Validate that all steps are proper Runnable instances
    for (const [key, step] of Object.entries(this.steps)) {
      if (!step || typeof step.invoke !== 'function') {
        throw new Error(`Step '${key}' is not a valid Runnable`);
      }
    }
  }

  /**
   * Get parallel metadata
   */
  getMetadata(): {
    stepCount: number;
    stepKeys: string[];
    estimatedComplexity: number;
    parallelizable: boolean;
  } {
    return {
      stepCount: Object.keys(this.steps).length,
      stepKeys: Object.keys(this.steps),
      estimatedComplexity: this.calculateComplexity(),
      parallelizable: true
    };
  }

  /**
   * Calculate estimated complexity score
   */
  private calculateComplexity(): number {
    // Parallel complexity is roughly max of individual step complexities
    // since they run concurrently
    const stepCount = Object.keys(this.steps).length;
    return Math.max(stepCount * 0.5, 1.0); // Lower than sequence since parallel
  }
}
