/**
 * LCEL Runnable Branch Implementation
 * 
 * Provides conditional routing and decision trees for dynamic path selection.
 * Routes execution to different branches based on input conditions.
 * 
 * Input: Any (evaluated against branch conditions)
 * Output: Result from selected branch
 * 
 * Key Methods:
 * - addBranch(condition, runnable): Add conditional branch
 * - setDefault(runnable): Set default branch when no conditions match
 * - invoke(input, config): Execute branch selection and routing
 * - batch(inputs, config): Execute branching on multiple inputs
 * - evaluateCondition(input, condition): Evaluate branch condition
 * - getBranches(): Get all branch definitions
 */

import { Runnable, RunnableConfig, RunnableInterface } from '@langchain/core/runnables';
import { IterableReadableStream } from '@langchain/core/utils/stream';
import { ConditionEvaluator } from './utils/condition_evaluator';

export type BranchCondition<RunInput = any> = 
  | ((input: RunInput) => boolean)
  | ((input: RunInput) => Promise<boolean>)
  | string // JSONPath-like condition
  | RegExp; // Regex pattern for string inputs

export interface BranchDefinition<RunInput = any, RunOutput = any> {
  condition: BranchCondition<RunInput>;
  runnable: RunnableInterface<RunInput, RunOutput>;
  name?: string;
}

export class RunnableBranch<RunInput = any, RunOutput = any> extends Runnable<RunInput, RunOutput> {
  private branches: BranchDefinition<RunInput, RunOutput>[];
  private defaultBranch?: RunnableInterface<RunInput, RunOutput>;
  
  lc_namespace = ['custom', 'runnable', 'branch'];
  
  constructor(branches: BranchDefinition<RunInput, RunOutput>[] = []) {
    super();
    this.branches = branches;
  }

  /**
   * Add a conditional branch
   */
  addBranch(
    condition: BranchCondition<RunInput>,
    runnable: RunnableInterface<RunInput, RunOutput>,
    name?: string
  ): RunnableBranch<RunInput, RunOutput> {
    const newBranches = [...this.branches, { condition, runnable, name }];
    const newBranch = new RunnableBranch(newBranches);
    newBranch.defaultBranch = this.defaultBranch;
    return newBranch;
  }

  /**
   * Set default branch when no conditions match
   */
  setDefault(runnable: RunnableInterface<RunInput, RunOutput>): RunnableBranch<RunInput, RunOutput> {
    const newBranch = new RunnableBranch(this.branches);
    newBranch.defaultBranch = runnable;
    return newBranch;
  }

  /**
   * Execute branch selection and routing
   */
  async invoke(input: RunInput, config?: RunnableConfig): Promise<RunOutput> {
    const startTime = Date.now();
    
    try {
      // Find the first matching branch
      const matchingBranch = await this.findMatchingBranch(input);
      
      if (!matchingBranch) {
        throw new Error('No matching branch found and no default branch specified');
      }
      
      // Execute the selected branch
      const result = await matchingBranch.invoke(input, config);
      
      // Log execution metrics if config includes callbacks
      if (config?.callbacks) {
        const duration = Date.now() - startTime;
        // Handle both CallbackManager and array of callbacks
        if (Array.isArray(config.callbacks)) {
          config.callbacks.forEach((callback: any) => {
            if ('onChainEnd' in callback && typeof callback.onChainEnd === 'function') {
              callback.onChainEnd?.({
                chainId: 'runnable_branch',
                inputs: { input },
                outputs: { result },
                executionTime: duration
              });
            }
          });
        }
      }
      
      return result;
    } catch (error) {
      // Log error if config includes callbacks
      if (config?.callbacks && Array.isArray(config.callbacks)) {
        config.callbacks.forEach((callback: any) => {
          if ('onChainError' in callback && typeof callback.onChainError === 'function') {
            callback.onChainError?.({
              chainId: 'runnable_branch',
              inputs: { input },
              error: error as Error
            });
          }
        });
      }
      
      throw error;
    }
  }

  /**
   * Execute branching on multiple inputs
   */
  async batch(inputs: RunInput[], config?: RunnableConfig): Promise<RunOutput[]> {
    // Process all inputs in parallel
    const promises = inputs.map(input => this.invoke(input, config));
    return Promise.all(promises);
  }

  /**
   * Stream branch execution results
   */
  async stream(input: RunInput, options?: Partial<RunnableConfig>): Promise<IterableReadableStream<RunOutput>> {
    const self = this;
    return IterableReadableStream.fromAsyncGenerator(async function* () {
      // Find matching branch
      const matchingBranch = await self.findMatchingBranch(input);
      
      if (!matchingBranch) {
        throw new Error('No matching branch found and no default branch specified');
      }
      
      // Stream from the selected branch if it supports streaming
      if ('stream' in matchingBranch && typeof matchingBranch.stream === 'function') {
        const streamResult = await matchingBranch.stream(input, options);
        for await (const chunk of streamResult) {
          yield chunk;
        }
      } else {
        // Fallback to single result if streaming not supported
        const result = await matchingBranch.invoke(input, options);
        yield result;
      }
    }());
  }

  /**
   * Evaluate branch condition against input
   */
  async evaluateCondition(input: RunInput, condition: BranchCondition<RunInput>): Promise<boolean> {
    return ConditionEvaluator.evaluate(input, condition);
  }

  /**
   * Get all branch definitions
   */
  getBranches(): BranchDefinition<RunInput, RunOutput>[] {
    return [...this.branches];
  }

  /**
   * Get default branch
   */
  getDefault(): RunnableInterface<RunInput, RunOutput> | undefined {
    return this.defaultBranch;
  }

  /**
   * Find matching branch for input
   */
  private async findMatchingBranch(input: RunInput): Promise<RunnableInterface<RunInput, RunOutput> | null> {
    // Check each branch condition in order
    for (const branch of this.branches) {
      try {
        const matches = await this.evaluateCondition(input, branch.condition);
        if (matches) {
          return branch.runnable;
        }
      } catch (error) {
        console.warn(`Error evaluating branch condition: ${error}`);
        continue;
      }
    }
    
    // Return default branch if no conditions matched
    return this.defaultBranch || null;
  }

  /**
   * Create branch with static conditions
   */
  static create<Input, Output>(
    branches: Array<[BranchCondition<Input>, RunnableInterface<Input, Output>]>,
    defaultBranch?: RunnableInterface<Input, Output>
  ): RunnableBranch<Input, Output> {
    const branchDefs = branches.map(([condition, runnable], index) => ({
      condition,
      runnable,
      name: `branch_${index}`
    }));
    
    const branch = new RunnableBranch(branchDefs);
    if (defaultBranch) {
      branch.defaultBranch = defaultBranch;
    }
    return branch;
  }

  /**
   * Create switch-like branch based on input property
   */
  static switch<Input, Output>(
    propertyPath: string,
    cases: Record<string, RunnableInterface<Input, Output>>,
    defaultCase?: RunnableInterface<Input, Output>
  ): RunnableBranch<Input, Output> {
    const branches: BranchDefinition<Input, Output>[] = Object.entries(cases).map(([value, runnable]) => ({
      condition: ConditionEvaluator.equals(propertyPath, value),
      runnable,
      name: `case_${value}`
    }));
    
    const branch = new RunnableBranch(branches);
    if (defaultCase) {
      branch.defaultBranch = defaultCase;
    }
    return branch;
  }
}
