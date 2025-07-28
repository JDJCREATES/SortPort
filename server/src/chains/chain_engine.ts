/**
 * LCEL Chain Engine
 * 
 * Enhanced LCEL chain executor with parallel processing, streaming support,
 * and RunnableSequence & RunnableParallel orchestration.
 * 
 * Input: ChainExecutionRequest with chain definition and input data
 * Output: ChainExecutionResult with processed data and metadata
 * 
 * Key Methods:
 * - executeChain(chainDef, input, config): Execute LCEL chain
 * - executeSequence(sequence, input, config): Execute sequential chain
 * - executeParallel(parallel, input, config): Execute parallel chain
 * - streamExecution(chainDef, input, config): Stream chain execution
 * - validateChain(chainDef): Validate chain definition
 * - optimizeChain(chainDef): Optimize chain for performance
 * - getExecutionMetrics(): Get performance metrics
 */

import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { RunnableSequence } from '../core/lcel/runnable_sequence.js';
import { RunnableParallel } from '../core/lcel/runnable_parallel.js';
import { RunnableBranch } from '../core/lcel/runnable_branch.js';
import { RunnableLambda } from '../core/lcel/runnable_lambda.js';
import { RunnableAssign } from '../core/lcel/runnable_assign.js';
import { RunnableMap } from '../core/lcel/runnable_map.js';
// import { BasicChainValidator, ValidationResult as ChainValidationResult } from './utils/chain_validator';

export interface ChainExecutionRequest {
  chainDefinition: ChainDefinition;
  input: any;
  config?: ChainExecutionConfig;
  metadata?: Record<string, any>;
}

export interface ChainExecutionResult {
  output: any;
  success: boolean;
  error?: Error;
  metadata: ExecutionMetadata;
  metrics: ExecutionMetrics;
}

export interface ChainDefinition {
  id: string;
  name: string;
  description?: string;
  type: 'sequence' | 'parallel' | 'branch' | 'lambda' | 'assign' | 'map' | 'custom';
  runnable: Runnable<any, any>;
  schema?: {
    input?: any;
    output?: any;
  };
  version?: string;
}

export interface ChainExecutionConfig extends RunnableConfig {
  enableStreaming?: boolean;
  enableCaching?: boolean;
  enableMetrics?: boolean;
  timeout?: number;
  retryAttempts?: number;
  concurrency?: number;
}

export interface ExecutionMetadata {
  chainId: string;
  executionId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  stepCount: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface ExecutionMetrics {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  averageStepDuration: number;
  memoryUsage: number;
  cpuUsage: number;
  apiCalls: {
    total: number;
    byModel: Record<string, number>;
    totalCost: number;
  };
  cacheHits?: number;
  cacheMisses?: number;
}

export class ChainEngine {
  private executionCache: Map<string, any>;
  private metricsCollector: ExecutionMetricsCollector;
  private executionTracker: ExecutionTracker;
  
  constructor() {
    this.executionCache = new Map();
    this.metricsCollector = new ExecutionMetricsCollector();
    this.executionTracker = new ExecutionTracker();
  }

  /**
   * Execute LCEL chain with full orchestration
   */
  async executeChain(
    chainDefinition: ChainDefinition,
    input: any,
    config: ChainExecutionConfig = {}
  ): Promise<ChainExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    
    // Start execution tracking
    this.executionTracker.trackExecution(executionId, {
      chainId: chainDefinition.id,
      chainName: chainDefinition.name,
      startTime,
      config
    });
    
    // Start metrics collection
    this.metricsCollector.startExecution(executionId);
    
    try {
      // Validate chain before execution
      const validation = await this.validateChain(chainDefinition);
      if (!validation.valid) {
        throw new Error(`Chain validation failed: ${validation.errors.join(', ')}`);
      }

      // Apply optimization (always, or add to config if needed)
      const optimizedChain = await this.optimizeChain(chainDefinition);

      // Execute with caching if enabled
      let output: any;
      if (config.enableCaching) {
        const cacheKey = this.generateCacheKey(optimizedChain, input);
        output = await this.withCaching(cacheKey, 
          () => this.executeChainInternal(optimizedChain, input, config),
          config
        );
      } else {
        output = await this.executeChainInternal(optimizedChain, input, config);
      }
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // Collect final metrics
      const metrics = this.metricsCollector.getMetrics(executionId);
      this.metricsCollector.endExecution(executionId, true);
      
      // Build execution metadata
      const metadata: ExecutionMetadata = {
        chainId: optimizedChain.id,
        executionId,
        startTime,
        endTime,
        duration,
        stepCount: this.calculateStepCount(optimizedChain),
        cacheHits: metrics?.cacheHits || 0,
        cacheMisses: metrics?.cacheMisses || 0
      };
      
      return {
        output,
        success: true,
        metadata,
        metrics: metrics || this.getDefaultMetrics()
      };
      
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // Record error metrics
      this.metricsCollector.endExecution(executionId, false, error as Error);
      
      const metadata: ExecutionMetadata = {
        chainId: chainDefinition.id,
        executionId,
        startTime,
        endTime,
        duration,
        stepCount: 0,
        cacheHits: 0,
        cacheMisses: 0
      };
      
      return {
        output: null,
        success: false,
        error: error as Error,
        metadata,
        metrics: this.getDefaultMetrics()
      };
    } finally {
      this.executionTracker.completeExecution(executionId);
    }
  }

  /**
   * Execute sequential chain
   */
  async executeSequence(
    sequence: RunnableSequence,
    input: any,
    config: ChainExecutionConfig = {}
  ): Promise<any> {
    const executionConfig = {
      ...config,
      enableMetrics: config.enableMetrics !== false,
      concurrency: 1, // Sequential execution
      tags: Object.assign({}, config.tags, { executionType: 'sequence' })
    };
    
    try {
      // Apply timeout if specified
      if (config.timeout) {
        return await this.executeWithTimeout(
          () => sequence.invoke(input, executionConfig),
          config.timeout
        );
      } else {
        return await sequence.invoke(input, executionConfig);
      }
    } catch (error) {
      // Apply retry logic if enabled
      if (config.retryAttempts && config.retryAttempts > 0) {
        return await this.executeWithRetry(
          () => sequence.invoke(input, executionConfig),
          config.retryAttempts
        );
      }
      throw error;
    }
  }

  /**
   * Execute parallel chain
   */
  async executeParallel(
    parallel: RunnableParallel,
    input: any,
    config: ChainExecutionConfig = {}
  ): Promise<any> {
    const executionConfig = {
      ...config,
      enableMetrics: config.enableMetrics !== false,
      concurrency: config.concurrency ?? 10,
      tags: Object.assign({}, config.tags, { executionType: 'parallel' })
    };
    
    try {
      // Apply timeout if specified
      if (config.timeout) {
        return await this.executeWithTimeout(
          () => parallel.invoke(input, executionConfig),
          config.timeout
        );
      } else {
        return await parallel.invoke(input, executionConfig);
      }
    } catch (error) {
      // Apply retry logic if enabled
      if (config.retryAttempts && config.retryAttempts > 0) {
        return await this.executeWithRetry(
          () => parallel.invoke(input, executionConfig),
          config.retryAttempts
        );
      }
      throw error;
    }
  }

  /**
   * Stream chain execution with real-time results
   */
  async *streamExecution(
    chainDefinition: ChainDefinition,
    input: any,
    config: ChainExecutionConfig = {}
  ): AsyncGenerator<Partial<ChainExecutionResult>> {
    const executionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    
    try {
      // Yield initial execution state
      yield {
        output: null,
        success: false,
        metadata: {
          chainId: chainDefinition.id,
          executionId,
          startTime,
          endTime: new Date(),
          duration: 0,
          stepCount: 0,
          cacheHits: 0,
          cacheMisses: 0
        }
      };

      // Check if runnable supports streaming
      if ('stream' in chainDefinition.runnable && typeof chainDefinition.runnable.stream === 'function') {
        let stepCount = 0;
        // Stream from the runnable directly, ensure it's an async iterable
        const streamResultRaw = chainDefinition.runnable.stream(input, config);
        let streamResult: any;
        if (streamResultRaw && typeof (streamResultRaw as any).then === 'function') {
          streamResult = await streamResultRaw;
        } else {
          streamResult = streamResultRaw;
        }
        if (streamResult && typeof streamResult[Symbol.asyncIterator] === 'function') {
          for await (const chunk of streamResult) {
            stepCount++;
            const currentTime = new Date();
            yield {
              output: chunk,
              success: true,
              metadata: {
                chainId: chainDefinition.id,
                executionId,
                startTime,
                endTime: currentTime,
                duration: currentTime.getTime() - startTime.getTime(),
                stepCount,
                cacheHits: 0,
                cacheMisses: 0
              }
            };
          }
        } else {
          // Fallback to regular execution for non-async-iterable stream
          const result = await chainDefinition.runnable.invoke(input, config);
          const endTime = new Date();
          yield {
            output: result,
            success: true,
            metadata: {
              chainId: chainDefinition.id,
              executionId,
              startTime,
              endTime,
              duration: endTime.getTime() - startTime.getTime(),
              stepCount: 1,
              cacheHits: 0,
              cacheMisses: 0
            }
          };
        }
      } else {
        // Fallback to regular execution for non-streaming runnables
        const result = await chainDefinition.runnable.invoke(input, config);
        const endTime = new Date();
        
        yield {
          output: result,
          success: true,
          metadata: {
            chainId: chainDefinition.id,
            executionId,
            startTime,
            endTime,
            duration: endTime.getTime() - startTime.getTime(),
            stepCount: 1,
            cacheHits: 0,
            cacheMisses: 0
          }
        };
      }
    } catch (error) {
      const endTime = new Date();
      
      yield {
        output: null,
        success: false,
        error: error as Error,
        metadata: {
          chainId: chainDefinition.id,
          executionId,
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          stepCount: 0,
          cacheHits: 0,
          cacheMisses: 0
        }
      };
    }
  }

  /**
   * Validate chain definition
   */
  async validateChain(chainDefinition: ChainDefinition): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Basic structure validation
      if (!chainDefinition.id) {
        errors.push('Chain definition must have an id');
      }
      
      if (!chainDefinition.name) {
        errors.push('Chain definition must have a name');
      }
      
      if (!chainDefinition.runnable) {
        errors.push('Chain definition must have a runnable');
      }
      
      // Validate runnable has required methods
      if (chainDefinition.runnable) {
        if (typeof chainDefinition.runnable.invoke !== 'function') {
          errors.push('Runnable must implement invoke method');
        }
        
        if (typeof chainDefinition.runnable.stream !== 'function') {
          warnings.push('Runnable does not support streaming');
        }
        
        if (typeof chainDefinition.runnable.batch !== 'function') {
          warnings.push('Runnable does not support batch processing');
        }
      }
      
      // Type-specific validation
      switch (chainDefinition.type) {
        case 'sequence':
          if (chainDefinition.runnable && 'steps' in chainDefinition.runnable) {
            const steps = (chainDefinition.runnable as any).steps;
            if (!Array.isArray(steps) || steps.length === 0) {
              errors.push('Sequence chain must have at least one step');
            }
          }
          break;
          
        case 'parallel':
          if (chainDefinition.runnable && 'runnables' in chainDefinition.runnable) {
            const runnables = (chainDefinition.runnable as any).runnables;
            if (!runnables || Object.keys(runnables).length === 0) {
              errors.push('Parallel chain must have at least one runnable');
            }
          }
          break;
          
        case 'branch':
          if (chainDefinition.runnable && 'getBranches' in chainDefinition.runnable) {
            const branches = (chainDefinition.runnable as any).getBranches();
            if (!Array.isArray(branches) || branches.length === 0) {
              warnings.push('Branch chain has no branches defined');
            }
          }
          break;
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error}`],
        warnings,
        suggestions: []
      };
    }
  }

  /**
   * Optimize chain for performance
   */
  async optimizeChain(chainDefinition: ChainDefinition): Promise<ChainDefinition> {
    try {
      // Create optimized copy
      const optimized: ChainDefinition = {
        ...chainDefinition,
        id: `${chainDefinition.id}_optimized`,
        name: `${chainDefinition.name} (Optimized)`,
        description: `${chainDefinition.description || ''} - Performance optimized version`
      };

      // Type-specific optimizations
      switch (chainDefinition.type) {
        case 'sequence':
          optimized.runnable = this.optimizeSequence(chainDefinition.runnable as any);
          break;
          
        case 'parallel':
          optimized.runnable = this.optimizeParallel(chainDefinition.runnable as any);
          break;
          
        case 'map':
          optimized.runnable = this.optimizeMap(chainDefinition.runnable as any);
          break;
          
        case 'branch':
          optimized.runnable = this.optimizeBranch(chainDefinition.runnable as any);
          break;
          
        default:
          // For other types, return as-is
          break;
      }

      return optimized;
    } catch (error) {
      console.warn(`Chain optimization failed: ${error}`);
      return chainDefinition; // Return original if optimization fails
    }
  }

  /**
   * Get execution metrics
   */
  getExecutionMetrics(): ExecutionMetrics {
    // Implementation placeholder
    throw new Error('ChainEngine.getExecutionMetrics not implemented');
  }

  /**
   * Register custom runnable type
   */
  registerRunnableType(type: string, factory: (config: any) => Runnable<any, any>): void {
    // Implementation placeholder
    throw new Error('ChainEngine.registerRunnableType not implemented');
  }

  /**
   * Clear execution cache
   */
  clearCache(): void {
    this.executionCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number } {
    // Implementation placeholder
    throw new Error('ChainEngine.getCacheStats not implemented');
  }

  /**
   * Execute chain internal logic
   */
  private async executeChainInternal(
    chainDefinition: ChainDefinition,
    input: any,
    config: ChainExecutionConfig
  ): Promise<any> {
    const runnable = chainDefinition.runnable;
    
    switch (chainDefinition.type) {
      case 'sequence':
        if (runnable instanceof RunnableSequence) {
          return await this.executeSequence(runnable, input, config);
        }
        break;
      case 'parallel':
        if (runnable instanceof RunnableParallel) {
          return await this.executeParallel(runnable, input, config);
        }
        break;
      default:
        // For other types, execute directly
        return await runnable.invoke(input, config);
    }
    
    throw new Error(`Unsupported chain type: ${chainDefinition.type}`);
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    executor: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      executor()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(
    executor: () => Promise<T>,
    maxAttempts: number,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await executor();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        // Wait before retry with exponential backoff
        const waitTime = delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw lastError!;
  }

  /**
   * Apply caching if enabled
   */
  private async withCaching(
    key: string,
    executor: () => Promise<any>,
    config: ChainExecutionConfig
  ): Promise<any> {
    // Check cache first
    if (this.executionCache.has(key)) {
      return this.executionCache.get(key);
    }
    
    // Execute and cache result
    const result = await executor();
    
    // Cache with TTL (default 1 hour)
    const ttl = 3600000; // 1 hour default, config.cacheTTL removed
    this.executionCache.set(key, result);
    
    // Set up cache expiration
    setTimeout(() => {
      this.executionCache.delete(key);
    }, ttl);
    
    return result;
  }

  /**
   * Generate cache key for chain execution
   */
  private generateCacheKey(chainDefinition: ChainDefinition, input: any): string {
    const inputHash = this.hashObject(input);
    const chainHash = this.hashObject({
      id: chainDefinition.id,
      version: chainDefinition.version || 'default'
    });
    return `${chainHash}_${inputHash}`;
  }

  /**
   * Hash object for caching
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Calculate step count for chain
   */
  private calculateStepCount(chainDefinition: ChainDefinition): number {
    // Simple implementation - could be more sophisticated
    return chainDefinition.type === 'sequence' ? 1 : 1;
  }

  /**
   * Get default metrics for fallback
   */
  private getDefaultMetrics(): ExecutionMetrics {
    return {
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      averageStepDuration: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      apiCalls: {
        total: 0,
        byModel: {},
        totalCost: 0
      }
    };
  }

  /**
   * Track execution metrics
   */
  private trackExecution(
    chainId: string,
    startTime: Date,
    endTime: Date,
    success: boolean,
    error?: Error
  ): void {
    const duration = endTime.getTime() - startTime.getTime();
    console.debug(`Chain ${chainId} executed in ${duration}ms, success: ${success}`);
    
    if (error) {
      console.error(`Chain ${chainId} failed:`, error.message);
    }
  }

  /**
   * Optimize sequence runnable
   */
  private optimizeSequence(runnable: any): any {
    // For sequences, we can optimize by reducing unnecessary steps
    return runnable; // Simple implementation - return as-is
  }

  /**
   * Optimize parallel runnable
   */
  private optimizeParallel(runnable: any): any {
    // For parallel, we can optimize concurrency settings
    if ('withConcurrency' in runnable) {
      // Adjust concurrency based on available resources
      return runnable.withConcurrency(Math.min(10, Object.keys(runnable.runnables || {}).length));
    }
    return runnable;
  }

  /**
   * Optimize map runnable
   */
  private optimizeMap(runnable: any): any {
    // For maps, optimize batch size and concurrency
    if ('withConcurrency' in runnable && 'withBatchSize' in runnable) {
      return runnable.withConcurrency(10).withBatchSize(50);
    }
    return runnable;
  }

  /**
   * Optimize branch runnable
   */
  private optimizeBranch(runnable: any): any {
    // For branches, ensure conditions are optimized for performance
    return runnable; // Simple implementation - return as-is
  }
}

export class ExecutionMetricsCollector {
  private metrics: Map<string, ExecutionMetrics>;

  constructor() {
    this.metrics = new Map();
  }

  /**
   * Start tracking execution
   */
  startExecution(executionId: string): void {
    // Implementation placeholder
  }

  /**
   * End tracking execution
   */
  endExecution(executionId: string, success: boolean, error?: Error): void {
    // Implementation placeholder
  }

  /**
   * Record step execution
   */
  recordStep(executionId: string, stepName: string, duration: number, success: boolean): void {
    // Implementation placeholder
  }

  /**
   * Record API call
   */
  recordApiCall(executionId: string, model: string, cost: number): void {
    // Implementation placeholder
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(executionId: string): ExecutionMetrics | undefined {
    return this.metrics.get(executionId);
  }
}

export class ExecutionTracker {
  private activeExecutions: Map<string, any>;

  constructor() {
    this.activeExecutions = new Map();
  }

  /**
   * Track active execution
   */
  trackExecution(executionId: string, metadata: any): void {
    // Implementation placeholder
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId: string): any {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Complete execution tracking
   */
  completeExecution(executionId: string): void {
    this.activeExecutions.delete(executionId);
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}
