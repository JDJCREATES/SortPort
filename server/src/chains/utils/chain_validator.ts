/**
 * Chain Validation Utilities
 * 
 * Provides validation logic for LCEL chain definitions
 * and execution configurations.
 */

import { ChainDefinition } from '../chain_engine';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  type: 'structural' | 'schema' | 'dependency' | 'configuration';
  message: string;
  path?: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  type: 'performance' | 'compatibility' | 'deprecation';
  message: string;
  suggestion?: string;
}

export class BasicChainValidator {
  /**
   * Validate a complete chain definition
   */
  static async validateChain(chainDefinition: ChainDefinition): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Basic structure validation
    this.validateStructure(chainDefinition, errors);
    
    // Schema validation
    this.validateSchema(chainDefinition, errors);
    
    // Runnable validation
    await this.validateRunnable(chainDefinition, errors, warnings);
    
    // Performance analysis
    this.analyzePerformance(chainDefinition, warnings, suggestions);

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Validate basic structure
   */
  private static validateStructure(
    chainDefinition: ChainDefinition,
    errors: ValidationError[]
  ): void {
    if (!chainDefinition.id) {
      errors.push({
        type: 'structural',
        message: 'Chain definition must have an id',
        severity: 'error'
      });
    }

    if (!chainDefinition.name) {
      errors.push({
        type: 'structural',
        message: 'Chain definition must have a name',
        severity: 'error'
      });
    }

    if (!chainDefinition.runnable) {
      errors.push({
        type: 'structural',
        message: 'Chain definition must have a runnable',
        severity: 'error'
      });
    }

    const validTypes = ['sequence', 'parallel', 'branch', 'lambda', 'assign', 'map', 'custom'];
    if (!validTypes.includes(chainDefinition.type)) {
      errors.push({
        type: 'structural',
        message: `Invalid chain type: ${chainDefinition.type}. Must be one of: ${validTypes.join(', ')}`,
        severity: 'error'
      });
    }
  }

  /**
   * Validate input/output schemas
   */
  private static validateSchema(
    chainDefinition: ChainDefinition,
    errors: ValidationError[]
  ): void {
    if (chainDefinition.schema) {
      // Basic schema validation - could be enhanced with JSON Schema
      if (chainDefinition.schema.input && typeof chainDefinition.schema.input !== 'object') {
        errors.push({
          type: 'schema',
          message: 'Input schema must be an object',
          path: 'schema.input',
          severity: 'error'
        });
      }

      if (chainDefinition.schema.output && typeof chainDefinition.schema.output !== 'object') {
        errors.push({
          type: 'schema',
          message: 'Output schema must be an object',
          path: 'schema.output',
          severity: 'error'
        });
      }
    }
  }

  /**
   * Validate runnable implementation
   */
  private static async validateRunnable(
    chainDefinition: ChainDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    const { runnable } = chainDefinition;

    // Check if runnable has required methods
    if (!runnable.invoke || typeof runnable.invoke !== 'function') {
      errors.push({
        type: 'structural',
        message: 'Runnable must implement invoke method',
        severity: 'error'
      });
    }

    // Check for streaming support
    if (!runnable.stream || typeof runnable.stream !== 'function') {
      warnings.push({
        type: 'compatibility',
        message: 'Runnable does not support streaming',
        suggestion: 'Consider implementing stream method for better performance'
      });
    }

    // Check for batch support
    if (!runnable.batch || typeof runnable.batch !== 'function') {
      warnings.push({
        type: 'performance',
        message: 'Runnable does not support batch processing',
        suggestion: 'Consider implementing batch method for improved throughput'
      });
    }

    // Type-specific validation
    await this.validateSpecificType(chainDefinition, errors, warnings);
  }

  /**
   * Validate specific chain types
   */
  private static async validateSpecificType(
    chainDefinition: ChainDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    switch (chainDefinition.type) {
      case 'sequence':
        this.validateSequence(chainDefinition, errors, warnings);
        break;
      case 'parallel':
        this.validateParallel(chainDefinition, errors, warnings);
        break;
      case 'branch':
        this.validateBranch(chainDefinition, errors, warnings);
        break;
      case 'map':
        this.validateMap(chainDefinition, errors, warnings);
        break;
    }
  }

  /**
   * Validate sequence chains
   */
  private static validateSequence(
    chainDefinition: ChainDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Sequence-specific validation
    if (chainDefinition.runnable && 'steps' in chainDefinition.runnable) {
      const steps = (chainDefinition.runnable as any).steps;
      if (!Array.isArray(steps) || steps.length === 0) {
        errors.push({
          type: 'structural',
          message: 'Sequence chain must have at least one step',
          severity: 'error'
        });
      }
    }
  }

  /**
   * Validate parallel chains
   */
  private static validateParallel(
    chainDefinition: ChainDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Parallel-specific validation
    if (chainDefinition.runnable && 'runnables' in chainDefinition.runnable) {
      const runnables = (chainDefinition.runnable as any).runnables;
      if (!runnables || Object.keys(runnables).length === 0) {
        errors.push({
          type: 'structural',
          message: 'Parallel chain must have at least one runnable',
          severity: 'error'
        });
      }
    }
  }

  /**
   * Validate branch chains
   */
  private static validateBranch(
    chainDefinition: ChainDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Branch-specific validation
    if (chainDefinition.runnable && 'getBranches' in chainDefinition.runnable) {
      const branches = (chainDefinition.runnable as any).getBranches();
      if (!Array.isArray(branches) || branches.length === 0) {
        warnings.push({
          type: 'performance',
          message: 'Branch chain has no branches defined',
          suggestion: 'Consider adding branches or using a simpler chain type'
        });
      }
    }
  }

  /**
   * Validate map chains
   */
  private static validateMap(
    chainDefinition: ChainDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Map-specific validation
    if (chainDefinition.runnable && 'getMapRunnable' in chainDefinition.runnable) {
      const mapRunnable = (chainDefinition.runnable as any).getMapRunnable();
      if (!mapRunnable) {
        errors.push({
          type: 'structural',
          message: 'Map chain must have a map runnable defined',
          severity: 'error'
        });
      }
    }
  }

  /**
   * Analyze performance characteristics
   */
  private static analyzePerformance(
    chainDefinition: ChainDefinition,
    warnings: ValidationWarning[],
    suggestions: string[]
  ): void {
    // Check for potential performance issues
    if (chainDefinition.type === 'sequence') {
      suggestions.push('Consider using parallel execution for independent steps');
    }

    if (chainDefinition.type === 'parallel' && !chainDefinition.runnable) {
      warnings.push({
        type: 'performance',
        message: 'Parallel chain with high concurrency may impact performance',
        suggestion: 'Consider limiting concurrency for resource-intensive operations'
      });
    }

    // Check for caching opportunities
    if (chainDefinition.description?.includes('expensive')) {
      suggestions.push('Consider enabling caching for expensive operations');
    }
  }

  /**
   * Validate chain compatibility with execution environment
   */
  static validateEnvironmentCompatibility(
    chainDefinition: ChainDefinition,
    environment: Record<string, any>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check required dependencies
    if (chainDefinition.type === 'custom') {
      warnings.push({
        type: 'compatibility',
        message: 'Custom chain types may not be portable across environments'
      });
    }

    // Check memory requirements
    if (chainDefinition.type === 'map' && environment.memoryLimit) {
      warnings.push({
        type: 'performance',
        message: 'Map operations may require significant memory for large datasets'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
}
