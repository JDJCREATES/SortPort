/**
 * Condition Evaluation Utilities for LCEL
 * 
 * Provides utilities for evaluating various types of conditions
 * used in RunnableBranch and other conditional logic.
 */

import { BranchCondition } from '../runnable_branch';

export class ConditionEvaluator {
  /**
   * Evaluate any type of condition against input
   */
  static async evaluate<T>(input: T, condition: BranchCondition<T>): Promise<boolean> {
    try {
      if (typeof condition === 'function') {
        return await condition(input);
      }
      
      if (typeof condition === 'string') {
        return this.evaluateJsonPath(input, condition);
      }
      
      if (condition instanceof RegExp) {
        return this.evaluateRegex(input, condition);
      }
      
      return false;
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return false;
    }
  }

  /**
   * Evaluate JSONPath-like string condition
   */
  private static evaluateJsonPath<T>(input: T, path: string): boolean {
    try {
      // Handle simple property access: "property.subProperty"
      if (path.includes('.')) {
        const value = this.getNestedProperty(input, path);
        return this.isTruthy(value);
      }
      
      // Handle equality checks: "property=value"
      if (path.includes('=')) {
        const [propertyPath, expectedValue] = path.split('=', 2);
        const actualValue = this.getNestedProperty(input, propertyPath.trim());
        return String(actualValue) === expectedValue.trim();
      }
      
      // Handle existence checks: "property"
      const value = this.getNestedProperty(input, path);
      return this.isTruthy(value);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate regex condition against string input
   */
  private static evaluateRegex<T>(input: T, regex: RegExp): boolean {
    const stringInput = String(input);
    return regex.test(stringInput);
  }

  /**
   * Get nested property value using dot notation
   */
  private static getNestedProperty<T>(obj: T, path: string): any {
    return path.split('.').reduce((current: any, key: string) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Check if value is truthy for condition evaluation
   */
  private static isTruthy(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  }

  /**
   * Create a condition that checks multiple properties (AND logic)
   */
  static and<T>(...conditions: BranchCondition<T>[]): BranchCondition<T> {
    return async (input: T) => {
      for (const condition of conditions) {
        const result = await this.evaluate(input, condition);
        if (!result) return false;
      }
      return true;
    };
  }

  /**
   * Create a condition that checks multiple properties (OR logic)
   */
  static or<T>(...conditions: BranchCondition<T>[]): BranchCondition<T> {
    return async (input: T) => {
      for (const condition of conditions) {
        const result = await this.evaluate(input, condition);
        if (result) return true;
      }
      return false;
    };
  }

  /**
   * Create a condition that negates another condition
   */
  static not<T>(condition: BranchCondition<T>): BranchCondition<T> {
    return async (input: T) => {
      const result = await this.evaluate(input, condition);
      return !result;
    };
  }

  /**
   * Create a condition that checks if a property equals a value
   */
  static equals<T>(propertyPath: string, expectedValue: any): BranchCondition<T> {
    return (input: T) => {
      const actualValue = this.getNestedProperty(input, propertyPath);
      return actualValue === expectedValue;
    };
  }

  /**
   * Create a condition that checks if a property contains a value
   */
  static contains<T>(propertyPath: string, searchValue: any): BranchCondition<T> {
    return (input: T) => {
      const value = this.getNestedProperty(input, propertyPath);
      if (Array.isArray(value)) {
        return value.includes(searchValue);
      }
      if (typeof value === 'string') {
        return value.includes(String(searchValue));
      }
      return false;
    };
  }

  /**
   * Create a condition that checks if a numeric property is in range
   */
  static inRange<T>(propertyPath: string, min: number, max: number): BranchCondition<T> {
    return (input: T) => {
      const value = Number(this.getNestedProperty(input, propertyPath));
      return !isNaN(value) && value >= min && value <= max;
    };
  }
}
