/**
 * LCEL Runnable Assign Implementation
 * 
 * Provides variable assignment, context enrichment, and state management.
 * Adds new properties to input objects or enriches context with computed values.
 * 
 * Input: Object with properties to enrich
 * Output: Object with original properties plus assigned values
 * 
 * Key Methods:
 * - assign(assignments): Add property assignments
 * - invoke(input, config): Execute assignments on input
 * - batch(inputs, config): Execute assignments on multiple inputs
 * - getAssignments(): Get current assignment definitions
 * - withAssignment(key, runnable): Add single assignment
 * - merge(other): Merge with another assign runnable
 */

import { Runnable, RunnableConfig, RunnableInterface } from '@langchain/core/runnables';

export type AssignmentMap<RunInput = any> = {
  [key: string]: RunnableInterface<RunInput, any> | ((input: RunInput) => any) | any;
};

export class RunnableAssign<RunInput extends Record<string, any> = any, RunOutput = RunInput> extends Runnable<RunInput, RunOutput> {
  private assignments: AssignmentMap<RunInput>;
  
  lc_namespace = ['custom', 'runnable', 'assign'];
  
  constructor(assignments: AssignmentMap<RunInput> = {}) {
    super();
    this.assignments = assignments;
  }

  // Add property assignments (not part of RunnableInterface, so rename to avoid conflict)
  addAssignments(assignments: AssignmentMap<RunInput>): RunnableAssign<RunInput, RunOutput> {
    return new RunnableAssign({
      ...this.assignments,
      ...assignments
    });
  }

  /**
   * Execute assignments on input object
   */
  async invoke(input: RunInput, options?: Partial<RunnableConfig>): Promise<RunOutput> {
    const startTime = Date.now();
    try {
      // Execute all assignments
      const assignedValues = await this.executeAllAssignments(input, options);
      // Merge with original input
      const result = {
        ...input,
        ...assignedValues
      } as RunOutput;
      // Call handleChainEnd if available (removed - not part of standard interface)
      const duration = Date.now() - startTime;
      return result;
    } catch (error) {
      // Call handleChainError if available (removed - not part of standard interface)
      throw error;
    }
  }

  /**
   * Execute assignments on multiple inputs
   */
  async batch(inputs: RunInput[], options?: Partial<RunnableConfig>): Promise<RunOutput[]> {
    // Process all inputs in parallel
    const promises = inputs.map(input => this.invoke(input, options));
    return Promise.all(promises);
  }

  // Removed custom stream method to match base Runnable signature

  /**
   * Get current assignment definitions
   */
  getAssignments(): AssignmentMap<RunInput> {
    return { ...this.assignments };
  }

  /**
   * Add single assignment (renamed to avoid conflict)
   */
  withAssignment(key: string, runnable: RunnableInterface<RunInput, any> | ((input: RunInput) => any)): RunnableAssign<RunInput, RunOutput> {
    return this.addAssignments({ [key]: runnable });
  }

  /**
   * Merge with another assign runnable (renamed to avoid conflict)
   */
  mergeAssignments(other: RunnableAssign<RunInput, any>): RunnableAssign<RunInput, RunOutput> {
    return new RunnableAssign({
      ...this.assignments,
      ...other.getAssignments()
    });
  }

  // Removed withConfig to avoid conflict with base interface

  /**
   * Execute single assignment
   */
  private async executeAssignment(
    key: string,
    assignment: RunnableInterface<RunInput, any> | ((input: RunInput) => any) | any,
    input: RunInput,
    options?: Partial<RunnableConfig>
  ): Promise<any> {
    try {
      if (this.isRunnable(assignment)) {
        // Execute runnable assignment
        return await assignment.invoke(input, options);
      } else if (this.isFunction(assignment)) {
        // Execute function assignment
        const result = assignment(input);
        return result instanceof Promise ? await result : result;
      } else {
        // Static value assignment
        return assignment;
      }
    } catch (error) {
      console.error(`Error executing assignment for key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Execute all assignments in parallel
   */
  private async executeAllAssignments(input: RunInput, options?: Partial<RunnableConfig>): Promise<Record<string, any>> {
    const assignmentEntries = Object.entries(this.assignments);
    // Execute all assignments in parallel
    const promises = assignmentEntries.map(async ([key, assignment]) => {
      const value = await this.executeAssignment(key, assignment, input, options);
      return [key, value] as [string, any];
    });
    const results = await Promise.all(promises);
    // Convert to object
    return Object.fromEntries(results);
  }

  /**
   * Check if assignment is a runnable
   */
  private isRunnable(assignment: any): assignment is RunnableInterface<RunInput, any> {
    return assignment && typeof assignment.invoke === 'function';
  }

  /**
   * Check if assignment is a function
   */
  private isFunction(assignment: any): assignment is (input: RunInput) => any {
    return typeof assignment === 'function';
  }

  /**
   * Create assign from object
   */
  static from<Input extends Record<string, any>, Output = Input>(
    assignments: AssignmentMap<Input>
  ): RunnableAssign<Input, Output> {
    return new RunnableAssign(assignments);
  }

  /**
   * Create assign for context enrichment
   */
  static enrich<Input extends Record<string, any>>(
    enrichments: AssignmentMap<Input>
  ): RunnableAssign<Input, Input> {
    return new RunnableAssign(enrichments);
  }

  /**
   * Create assign for computed properties
   */
  static compute<Input extends Record<string, any>>(
    computations: Record<string, (input: Input) => any>
  ): RunnableAssign<Input, Input> {
    return new RunnableAssign(computations);
  }

  /**
   * Create assign for metadata addition
   */
  static addMetadata<Input extends Record<string, any>>(
    metadata: Record<string, any>
  ): RunnableAssign<Input, Input> {
    const assignments: AssignmentMap<Input> = {};
    for (const [key, value] of Object.entries(metadata)) {
      assignments[key] = () => value;
    }
    return new RunnableAssign(assignments);
  }
}
