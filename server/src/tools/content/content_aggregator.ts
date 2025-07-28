/**
 * Content Aggregator
 * 
 * NEW: Multi-tool content fusion, metadata merging, and conflict resolution.
 */

import { RunnableSequence, RunnableLambda, RunnableParallel } from '@langchain/core/runnables';

export interface ContentSource {
  tool: string;
  data: any;
  confidence: number;
  timestamp: Date;
}

export interface AggregatedContent {
  mergedData: any;
  sources: ContentSource[];
  confidence: number;
  conflicts: any[];
}

export class ContentAggregator {
  private aggregationChain!: RunnableSequence;
  
  constructor() {
    this.setupAggregationChain();
  }

  async aggregateContent(sources: ContentSource[]): Promise<AggregatedContent> {
    if (!sources || sources.length === 0) {
      throw new Error('No content sources provided for aggregation');
    }

    try {
      const result = await this.aggregationChain.invoke({
        sources,
        timestamp: new Date().toISOString()
      });

      return {
        mergedData: result.mergedData,
        sources: sources,
        confidence: this.calculateOverallConfidence(sources, result.conflicts),
        conflicts: result.conflicts || []
      };
    } catch (error) {
      throw new Error(`Content aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async resolveConflicts(conflicts: any[]): Promise<any> {
    if (!conflicts || conflicts.length === 0) {
      return {};
    }

    const resolutions: any = {};

    for (const conflict of conflicts) {
      const resolution = this.resolveConflict(conflict);
      if (resolution.resolved) {
        resolutions[conflict.field] = resolution.value;
      }
    }

    return resolutions;
  }

  private setupAggregationChain(): void {
    this.aggregationChain = RunnableSequence.from([
      RunnableLambda.from((input: any) => this.identifyConflicts(input)),
      RunnableLambda.from((input: any) => this.mergeCompatibleData(input)),
      RunnableLambda.from((input: any) => this.resolveRemainingConflicts(input)),
      RunnableLambda.from((input: any) => this.finalizeAggregation(input))
    ]);
  }

  private identifyConflicts(input: any): any {
    const { sources } = input;
    const conflicts: any[] = [];
    const fieldMap = new Map<string, ContentSource[]>();

    // Group sources by field
    sources.forEach((source: ContentSource) => {
      this.extractFields(source.data).forEach((field: string) => {
        if (!fieldMap.has(field)) {
          fieldMap.set(field, []);
        }
        fieldMap.get(field)!.push(source);
      });
    });

    // Identify conflicts
    fieldMap.forEach((sources, field) => {
      if (sources.length > 1) {
        const values = sources.map(s => this.getFieldValue(s.data, field));
        const uniqueValues = [...new Set(values.filter(v => v !== undefined))];

        if (uniqueValues.length > 1) {
          conflicts.push({
            field,
            sources: sources.map(s => ({
              tool: s.tool,
              value: this.getFieldValue(s.data, field),
              confidence: s.confidence
            })),
            conflictType: this.determineConflictType(uniqueValues)
          });
        }
      }
    });

    return {
      ...input,
      conflicts,
      fieldMap: Object.fromEntries(fieldMap)
    };
  }

  private mergeCompatibleData(input: any): any {
    const { sources, conflicts } = input;
    const conflictFields = new Set<string>(conflicts.map((c: any) => c.field));
    const merged: any = {};

    // Merge non-conflicting data
    sources.forEach((source: ContentSource) => {
      this.mergeSourceData(merged, source.data, conflictFields);
    });

    // Merge arrays and collections
    this.mergeCollections(merged, sources);

    return {
      ...input,
      mergedData: merged
    };
  }

  private resolveRemainingConflicts(input: any): any {
    const { conflicts, mergedData } = input;
    const resolutions: any = {};

    conflicts.forEach((conflict: any) => {
      const resolution = this.resolveConflict(conflict);
      if (resolution.resolved) {
        this.setFieldValue(mergedData, conflict.field, resolution.value);
        resolutions[conflict.field] = resolution;
      }
    });

    return {
      ...input,
      mergedData,
      resolutions,
      remainingConflicts: conflicts.filter((c: any) => !resolutions[c.field])
    };
  }

  private finalizeAggregation(input: any): any {
    const { mergedData, sources, resolutions, remainingConflicts } = input;

    // Add aggregation metadata
    const metadata = {
      aggregationTimestamp: new Date().toISOString(),
      sourceCount: sources.length,
      toolsUsed: [...new Set(sources.map((s: ContentSource) => s.tool))],
      conflictsResolved: Object.keys(resolutions || {}).length,
      remainingConflicts: remainingConflicts?.length || 0,
      avgConfidence: this.calculateAverageConfidence(sources)
    };

    return {
      mergedData: {
        ...mergedData,
        _aggregationMetadata: metadata
      },
      conflicts: remainingConflicts || [],
      resolutions: resolutions || {}
    };
  }

  // Helper methods
  private extractFields(data: any, prefix = ''): string[] {
    const fields: string[] = [];
    
    if (typeof data === 'object' && data !== null) {
      Object.keys(data).forEach(key => {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fields.push(fieldPath);
        
        if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
          fields.push(...this.extractFields(data[key], fieldPath));
        }
      });
    }
    
    return fields;
  }

  private getFieldValue(data: any, fieldPath: string): any {
    return fieldPath.split('.').reduce((obj, key) => obj?.[key], data);
  }

  private setFieldValue(data: any, fieldPath: string, value: any): void {
    const keys = fieldPath.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, data);
    target[lastKey] = value;
  }

  private determineConflictType(values: any[]): string {
    const types = values.map(v => typeof v);
    const uniqueTypes = [...new Set(types)];

    if (uniqueTypes.length > 1) return 'type_mismatch';
    if (uniqueTypes[0] === 'number') return 'numeric_difference';
    if (uniqueTypes[0] === 'string') return 'text_difference';
    if (uniqueTypes[0] === 'boolean') return 'boolean_conflict';
    return 'value_difference';
  }

  private mergeSourceData(target: any, source: any, conflictFields: Set<string>, prefix = ''): void {
    if (typeof source !== 'object' || source === null) return;

    Object.keys(source).forEach(key => {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      
      if (conflictFields.has(fieldPath)) {
        // Skip conflicted fields - they'll be resolved separately
        return;
      }

      if (target[key] === undefined) {
        target[key] = source[key];
      } else if (typeof source[key] === 'object' && typeof target[key] === 'object' && 
                 !Array.isArray(source[key]) && !Array.isArray(target[key])) {
        this.mergeSourceData(target[key], source[key], conflictFields, fieldPath);
      }
    });
  }

  private mergeCollections(target: any, sources: ContentSource[]): void {
    const arrayFields = new Map<string, any[]>();

    // Collect all array fields
    sources.forEach(source => {
      this.findArrayFields(source.data).forEach(({ path, array }) => {
        if (!arrayFields.has(path)) {
          arrayFields.set(path, []);
        }
        arrayFields.get(path)!.push(...array);
      });
    });

    // Merge arrays (deduplicate and sort by relevance)
    arrayFields.forEach((items, path) => {
      const merged = this.deduplicateArray(items);
      this.setFieldValue(target, path, merged);
    });
  }

  private findArrayFields(data: any, prefix = ''): Array<{ path: string; array: any[] }> {
    const arrayFields: Array<{ path: string; array: any[] }> = [];

    if (typeof data === 'object' && data !== null) {
      Object.keys(data).forEach(key => {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        
        if (Array.isArray(data[key])) {
          arrayFields.push({ path: fieldPath, array: data[key] });
        } else if (typeof data[key] === 'object') {
          arrayFields.push(...this.findArrayFields(data[key], fieldPath));
        }
      });
    }

    return arrayFields;
  }

  private deduplicateArray(items: any[]): any[] {
    const seen = new Set();
    const result: any[] = [];

    items.forEach(item => {
      const key = this.getDeduplicationKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    });

    return result.sort((a, b) => {
      // Sort by confidence if available
      const confA = a.confidence || 0;
      const confB = b.confidence || 0;
      return confB - confA;
    });
  }

  private getDeduplicationKey(item: any): string {
    if (typeof item === 'string') return item.toLowerCase().trim();
    if (typeof item === 'object' && item !== null) {
      if (item.id) return `id:${item.id}`;
      if (item.name) return `name:${item.name.toLowerCase().trim()}`;
      if (item.value) return `value:${item.value}`;
      return JSON.stringify(item);
    }
    return String(item);
  }

  private resolveConflict(conflict: any): { resolved: boolean; value?: any; reason?: string } {
    const { field, sources, conflictType } = conflict;

    switch (conflictType) {
      case 'numeric_difference':
        return this.resolveNumericConflict(sources);
      
      case 'text_difference':
        return this.resolveTextConflict(sources);
      
      case 'boolean_conflict':
        return this.resolveBooleanConflict(sources);
      
      case 'type_mismatch':
        return this.resolveTypeMismatch(sources);
      
      default:
        return this.resolveByConfidence(sources);
    }
  }

  private resolveNumericConflict(sources: any[]): { resolved: boolean; value?: any; reason?: string } {
    // Use weighted average based on confidence
    let weightedSum = 0;
    let totalWeight = 0;

    sources.forEach(source => {
      if (typeof source.value === 'number') {
        weightedSum += source.value * source.confidence;
        totalWeight += source.confidence;
      }
    });

    if (totalWeight > 0) {
      return {
        resolved: true,
        value: weightedSum / totalWeight,
        reason: 'weighted_average'
      };
    }

    return { resolved: false };
  }

  private resolveTextConflict(sources: any[]): { resolved: boolean; value?: any; reason?: string } {
    // Choose the longest text from the most confident source
    const textSources = sources.filter(s => typeof s.value === 'string');
    
    if (textSources.length === 0) {
      return { resolved: false };
    }

    const best = textSources.reduce((best, current) => {
      if (current.confidence > best.confidence) return current;
      if (current.confidence === best.confidence && current.value.length > best.value.length) return current;
      return best;
    });

    return {
      resolved: true,
      value: best.value,
      reason: 'highest_confidence_longest'
    };
  }

  private resolveBooleanConflict(sources: any[]): { resolved: boolean; value?: any; reason?: string } {
    // Use majority vote weighted by confidence
    let trueWeight = 0;
    let falseWeight = 0;

    sources.forEach(source => {
      if (typeof source.value === 'boolean') {
        if (source.value) {
          trueWeight += source.confidence;
        } else {
          falseWeight += source.confidence;
        }
      }
    });

    if (trueWeight + falseWeight > 0) {
      return {
        resolved: true,
        value: trueWeight > falseWeight,
        reason: 'weighted_majority'
      };
    }

    return { resolved: false };
  }

  private resolveTypeMismatch(sources: any[]): { resolved: boolean; value?: any; reason?: string } {
    // Choose the value from the most confident source
    const best = sources.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return {
      resolved: true,
      value: best.value,
      reason: 'highest_confidence'
    };
  }

  private resolveByConfidence(sources: any[]): { resolved: boolean; value?: any; reason?: string } {
    if (sources.length === 0) {
      return { resolved: false };
    }

    const best = sources.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return {
      resolved: true,
      value: best.value,
      reason: 'highest_confidence'
    };
  }

  private calculateOverallConfidence(sources: ContentSource[], conflicts: any[]): number {
    if (sources.length === 0) return 0;

    // Base confidence from sources
    const avgSourceConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;
    
    // Penalty for unresolved conflicts
    const conflictPenalty = conflicts.length * 0.1;
    
    // Bonus for source agreement
    const agreementBonus = sources.length > 1 ? 0.1 : 0;

    return Math.max(0, Math.min(1, avgSourceConfidence - conflictPenalty + agreementBonus));
  }

  private calculateAverageConfidence(sources: ContentSource[]): number {
    if (sources.length === 0) return 0;
    return sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;
  }
}
