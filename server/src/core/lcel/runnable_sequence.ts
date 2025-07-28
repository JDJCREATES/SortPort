/**
 * LCEL Runnable Sequence Implementation
 * 
 * Provides sequential chain execution with pipe operator support and error propagation.
 * Core primitive for building LCEL chains that execute steps in order.
 * 
 * Input: Any (passed through sequence)
 * Output: Result of final step in sequence
 * 
 * Key Methods:
 * - pipe(runnable): Add a runnable to the sequence
 * - invoke(input, config): Execute the sequence
 * - batch(inputs, config): Execute sequence on multiple inputs
 * - stream(input, config): Stream execution results
 * - withConfig(config): Create new sequence with config
 * - compose(other): Compose with another runnable
 */

import { Runnable, RunnableConfig, RunnableInterface, RunnableLike } from '@langchain/core/runnables';
import { IterableReadableStream } from '@langchain/core/utils/stream';

export class RunnableSequence<RunInput = any, RunOutput = any> extends Runnable<RunInput, RunOutput> {
  private steps: Runnable<any, any>[];
  
  lc_namespace = ['custom', 'runnable', 'sequence'];
  
  constructor(steps: Runnable<any, any>[]) {
    super();
    this.steps = steps;
  }

  /**
   * Add a runnable to the sequence using pipe operator
   */
  pipe<NewOutput>(coerceable: RunnableLike<RunOutput, NewOutput>): Runnable<RunInput, Exclude<NewOutput, Error>> {
    const newSteps = [...this.steps, coerceable as any];
    return new RunnableSequence(newSteps) as any;
  }

  /**
   * Execute the sequence with input
   */
  async invoke(input: RunInput, config?: RunnableConfig): Promise<RunOutput> {
    if (this.steps.length === 0) {
      throw new Error('Cannot invoke empty sequence');
    }

    let currentInput: any = input;
    const executionContext = {
      ...config,
      tags: config?.tags ? [...(config.tags as string[]), `seq_${Date.now()}`] : [`seq_${Date.now()}`]
    };

    try {
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        const stepConfig: RunnableConfig = {
          ...executionContext,
          tags: config?.tags ? [...(config.tags as string[]), `step:${i}`] : [`step:${i}`]
        };

        currentInput = await this.executeStep(step, currentInput, stepConfig);
        
        // Allow for cancellation between steps
        if (executionContext.signal?.aborted) {
          throw new Error('Sequence execution was cancelled');
        }
      }

      return currentInput as RunOutput;
    } catch (error) {
      const enhancedError = new Error(
        `Sequence execution failed at step ${this.getCurrentStepIndex(executionContext)}: ${error instanceof Error ? error.message : String(error)}`
      );
      enhancedError.cause = error;
      throw enhancedError;
    }
  }

  /**
   * Execute sequence on multiple inputs in parallel
   */
  async batch(inputs: RunInput[], config?: RunnableConfig): Promise<RunOutput[]> {
    if (inputs.length === 0) return [];

    const batchConfig = {
      ...config,
      batchId: `batch_${Date.now()}`,
      batchSize: inputs.length
    };

    const concurrency = config?.maxConcurrency || Math.min(inputs.length, 10);
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
            tags: config?.tags ? [...(config.tags as string[]), `batch:${globalIndex}`] : [`batch:${globalIndex}`]
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

    // Check for errors and decide how to handle them
    const errorCount = errors.filter(e => e !== null).length;
    if (errorCount > 0) {
      throw new Error(`Batch execution failed: ${errorCount}/${inputs.length} items failed`);
    }

    return results.filter(r => r !== null);
  }

  /**
   * Stream execution results
   */
  async stream(input: RunInput, options?: Partial<RunnableConfig>): Promise<IterableReadableStream<RunOutput>> {
    if (this.steps.length === 0) {
      throw new Error('Cannot stream empty sequence');
    }

    const self = this;
    return IterableReadableStream.fromAsyncGenerator(async function* () {
      let currentInput: any = input;
      const streamConfig = {
        ...options,
        tags: options?.tags ? [...(options.tags as string[]), `stream_${Date.now()}`] : [`stream_${Date.now()}`]
      };

      for (let i = 0; i < self.steps.length; i++) {
        const step = self.steps[i];
        const stepConfig: RunnableConfig = {
          ...streamConfig,
          tags: options?.tags ? [...(options.tags as string[]), `step:${i}`] : [`step:${i}`]
        };

        try {
          // For now, execute step normally and yield result
          currentInput = await self.executeStep(step, currentInput, stepConfig);
          yield currentInput as RunOutput;
        } catch (error) {
          throw new Error(`Stream failed at step ${i}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }());
  }

  /**
   * Create new sequence with config
   */
  withConfig(config: Partial<RunnableConfig>): Runnable<RunInput, RunOutput> {
    const newSequence = new RunnableSequence<RunInput, RunOutput>(this.steps);
    // Store config in a way that can be accessed during execution
    (newSequence as any)._defaultConfig = config;
    return newSequence as any;
  }

  /**
   * Compose with another runnable
   */
  compose<NewOutput>(other: RunnableInterface<RunOutput, NewOutput>): Runnable<RunInput, Exclude<NewOutput, Error>> {
    return this.pipe(other);
  }

  /**
   * Get sequence steps
   */
  getSteps(): Runnable<any, any>[] {
    return [...this.steps];
  }

  /**
   * Create sequence from runnables
   */
  static from<Input, Output>(runnables: Runnable<any, any>[]): RunnableSequence<Input, Output> {
    return new RunnableSequence(runnables);
  }

  /**
   * Execute a single step with proper error handling
   */
  private async executeStep(
    step: Runnable<any, any>,
    input: any,
    config: RunnableConfig
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const result = await step.invoke(input, config);
      
      // Log execution metrics if enabled
      this.logStepMetrics('step', Date.now() - startTime, true);
      
      return result;
    } catch (error) {
      // Log error metrics if enabled  
      this.logStepMetrics('step', Date.now() - startTime, false);
      
      throw error;
    }
  }

  /**
   * Get current step index from execution context
   */
  private getCurrentStepIndex(context: any): number {
    return context.stepIndex || 0;
  }

  /**
   * Log step execution metrics
   */
  private logStepMetrics(stepName: string, duration: number, success: boolean): void {
    // This could be enhanced to use a proper metrics collector
    console.debug(`Step ${stepName}: ${duration}ms, success: ${success}`);
  }

  /**
   * Validate sequence configuration
   */
  private validateSequence(): void {
    if (this.steps.length === 0) {
      throw new Error('Sequence must have at least one step');
    }

    // Validate that all steps are proper Runnable instances
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step || typeof step.invoke !== 'function') {
        throw new Error(`Step at index ${i} is not a valid Runnable`);
      }
    }
  }

  /**
   * Get sequence metadata
   */
  getMetadata(): {
    stepCount: number;
    stepTypes: string[];
    estimatedComplexity: number;
  } {
    return {
      stepCount: this.steps.length,
      stepTypes: this.steps.map(step => step.constructor.name),
      estimatedComplexity: this.calculateComplexity()
    };
  }

  /**
   * Calculate estimated complexity score
   */
  private calculateComplexity(): number {
    // Simple complexity calculation based on number of steps
    // Could be enhanced to consider step types and configurations
    return this.steps.length * 1.2;
  }
}
