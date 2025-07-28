/**
 * Validation Suite
 * 
 *  Chain input/output validation, schema enforcement, and error detection.
 */

import { RunnableSequence, RunnableLambda, RunnableParallel } from '@langchain/core/runnables';

export interface ValidationRule {
  name: string;
  type: 'required' | 'type' | 'format' | 'range' | 'custom';
  constraint: any;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  score: number;
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export class ValidationSuite {
  private validationChain!: RunnableParallel<Record<string, unknown>>;

  constructor() {
    this.setupValidationChain();
  }

  async validateData<T extends Record<string, unknown>>(data: T, rules: ValidationRule[]): Promise<ValidationResult> {
    // Build a parallel chain of rule runnables
    const ruleRunnables: Record<string, RunnableLambda<T, ValidationError[]>> = {};
    for (const rule of rules) {
      ruleRunnables[rule.name] = RunnableLambda.from((input: T) => this.applyRule(input, rule));
    }
    const parallel = RunnableParallel.from(ruleRunnables);

    // Run all validations in parallel
    const results = await parallel.invoke(data);

    // Also run the default validationChain for structure/content/integrity (side effect)
    await this.validationChain.invoke(data);

    // Flatten errors and warnings
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    Object.values(results).forEach((errs) => {
      if (Array.isArray(errs)) {
        errs.forEach((err) => {
          if (err.severity === 'error') errors.push(err);
          else if (err.severity === 'warning') warnings.push(err.message);
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: errors.length === 0 ? 1 : 0
    };
  }

  async enforceSchema<T extends Record<string, unknown>, S extends Record<string, { required?: boolean; type?: string }>>(
    data: T,
    schema: S
  ): Promise<T> {
    for (const key in schema) {
      if (schema[key].required && !(key in data)) {
        throw new Error(`Missing required field: ${key}`);
      }
      if (schema[key].type && typeof data[key] !== schema[key].type) {
        throw new Error(`Field ${key} should be of type ${schema[key].type}`);
      }
    }
    return data;
  }

  private setupValidationChain(): void {
    this.validationChain = RunnableParallel.from({
      structure: RunnableLambda.from((input: Record<string, unknown>) => this.validateStructure(input)),
      content: RunnableLambda.from((input: Record<string, unknown>) => this.validateContent(input)),
      integrity: RunnableLambda.from((input: Record<string, unknown>) => this.validateIntegrity(input))
    });
  }

  private applyRule<T extends Record<string, unknown>>(input: T, rule: ValidationRule): ValidationError[] {
    const errors: ValidationError[] = [];
    const value = input[rule.name];
    switch (rule.type) {
      case 'required':
        if (value == null || value === '') {
          errors.push({
            field: rule.name,
            rule: 'required',
            message: rule.message || `${rule.name} is required`,
            severity: 'error'
          });
        }
        break;
      case 'type':
        if (typeof value !== rule.constraint) {
          errors.push({
            field: rule.name,
            rule: 'type',
            message: rule.message || `${rule.name} must be of type ${rule.constraint}`,
            severity: 'error'
          });
        }
        break;
      case 'format':
        if (typeof rule.constraint === 'function' && !rule.constraint(value)) {
          errors.push({
            field: rule.name,
            rule: 'format',
            message: rule.message || `${rule.name} format is invalid`,
            severity: 'error'
          });
        }
        break;
      case 'range':
        if (
          typeof value === 'number' &&
          (value < rule.constraint.min || value > rule.constraint.max)
        ) {
          errors.push({
            field: rule.name,
            rule: 'range',
            message: rule.message || `${rule.name} out of range`,
            severity: 'error'
          });
        }
        break;
      case 'custom':
        if (typeof rule.constraint === 'function') {
          const result = rule.constraint(value, input);
          if (result !== true) {
            errors.push({
              field: rule.name,
              rule: 'custom',
              message: rule.message || result || `${rule.name} failed custom validation`,
              severity: 'error'
            });
          }
        }
        break;
    }
    return errors;
  }

  private validateStructure(input: Record<string, unknown>): ValidationError[] {
    // Placeholder: always valid
    return [];
  }
  private validateContent(input: Record<string, unknown>): ValidationError[] {
    // Placeholder: always valid
    return [];
  }
  private validateIntegrity(input: Record<string, unknown>): ValidationError[] {
    // Placeholder: always valid
    return [];
  }
}
