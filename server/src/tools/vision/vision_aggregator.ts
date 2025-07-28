/**
 * Vision Aggregator
 * 
 * NEW: Multi-model vision fusion, consensus building, and confidence scoring.
 */

import { RunnableSequence, RunnableLambda, RunnableParallel } from '@langchain/core/runnables';

export interface VisionResult {
  model: string;
  analysis: any;
  confidence: number;
  processingTime: number;
}

export interface AggregatedVisionResult {
  consensus: any;
  confidence: number;
  individualResults: VisionResult[];
  metadata: any;
}

export class VisionAggregator {
  private aggregationChain!: RunnableParallel<any>;
  
  constructor() {
    this.setupAggregationChain();
  }

  async aggregateResults(visionResults: VisionResult[]): Promise<AggregatedVisionResult> {
    if (!visionResults || visionResults.length === 0) {
      throw new Error('No vision results provided for aggregation');
    }

    try {
      const aggregated = await this.aggregationChain.invoke({
        results: visionResults,
        timestamp: new Date().toISOString()
      });

      return {
        consensus: aggregated.consensus,
        confidence: aggregated.confidence,
        individualResults: visionResults,
        metadata: {
          ...aggregated.metadata,
          aggregationMethod: 'weighted_consensus',
          totalResults: visionResults.length,
          processingTime: aggregated.metadata.processingTime
        }
      };
    } catch (error) {
      throw new Error(`Vision aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async buildConsensus(results: VisionResult[]): Promise<any> {
    const consensus = this.calculateWeightedConsensus(results);
    const confidence = this.calculateOverallConfidence(results);
    
    return {
      ...consensus,
      overallConfidence: confidence,
      modelAgreement: this.calculateModelAgreement(results),
      qualityMetrics: this.calculateQualityMetrics(results)
    };
  }

  private setupAggregationChain(): void {
    this.aggregationChain = RunnableParallel.from({
      consensus: RunnableLambda.from((input: any) => this.calculateConsensus(input)),
      confidence: RunnableLambda.from((input: any) => this.calculateConfidence(input)),
      metadata: RunnableLambda.from((input: any) => this.extractMetadata(input))
    });
  }

  private calculateConsensus(input: any): any {
    const { results } = input;
    
    if (!results || results.length === 0) {
      return { error: 'No results to process' };
    }

    // Single result - return as is
    if (results.length === 1) {
      return results[0].analysis;
    }

    // Multiple results - build weighted consensus
    return this.calculateWeightedConsensus(results);
  }

  private calculateConfidence(input: any): number {
    const { results } = input;
    
    if (!results || results.length === 0) {
      return 0;
    }

    return this.calculateOverallConfidence(results);
  }

  private extractMetadata(input: any): any {
    const { results } = input;
    const startTime = Date.now();
    
    return {
      processingTime: Date.now() - startTime,
      modelCount: results?.length || 0,
      models: results?.map((r: VisionResult) => r.model) || [],
      avgProcessingTime: this.calculateAverageProcessingTime(results),
      qualityScore: this.calculateAggregateQuality(results),
      consensusStrength: this.calculateConsensusStrength(results)
    };
  }

  private calculateWeightedConsensus(results: VisionResult[]): any {
    const consensus: any = {
      objects: this.aggregateObjects(results),
      scenes: this.aggregateScenes(results),
      emotions: this.aggregateEmotions(results),
      attributes: this.aggregateAttributes(results),
      descriptions: this.aggregateDescriptions(results)
    };

    return consensus;
  }

  private calculateOverallConfidence(results: VisionResult[]): number {
    if (!results || results.length === 0) return 0;

    // Weighted average based on individual model confidence
    const totalWeight = results.reduce((sum, result) => sum + result.confidence, 0);
    const weightedSum = results.reduce((sum, result) => {
      return sum + (result.confidence * result.confidence); // Square for emphasis
    }, 0);

    const baseConfidence = weightedSum / Math.max(totalWeight, 1);
    
    // Adjust based on model agreement
    const agreement = this.calculateModelAgreement(results);
    const adjustedConfidence = baseConfidence * (0.7 + 0.3 * agreement);

    return Math.min(Math.max(adjustedConfidence, 0), 1);
  }

  private calculateModelAgreement(results: VisionResult[]): number {
    if (results.length <= 1) return 1.0;

    let totalAgreement = 0;
    let comparisons = 0;

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const agreement = this.compareAnalyses(results[i].analysis, results[j].analysis);
        totalAgreement += agreement;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalAgreement / comparisons : 0;
  }

  private compareAnalyses(analysis1: any, analysis2: any): number {
    let agreement = 0;
    let factors = 0;

    // Compare objects
    if (analysis1.objects && analysis2.objects) {
      agreement += this.compareArrays(analysis1.objects, analysis2.objects);
      factors++;
    }

    // Compare scenes
    if (analysis1.scenes && analysis2.scenes) {
      agreement += this.compareArrays(analysis1.scenes, analysis2.scenes);
      factors++;
    }

    // Compare descriptions
    if (analysis1.description && analysis2.description) {
      agreement += this.compareStrings(analysis1.description, analysis2.description);
      factors++;
    }

    return factors > 0 ? agreement / factors : 0;
  }

  private compareArrays(arr1: any[], arr2: any[]): number {
    if (!arr1 || !arr2) return 0;
    
    const set1 = new Set(arr1.map(item => this.normalizeItem(item)));
    const set2 = new Set(arr2.map(item => this.normalizeItem(item)));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private compareStrings(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    // Simple similarity based on common words
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private normalizeItem(item: any): string {
    if (typeof item === 'string') return item.toLowerCase().trim();
    if (typeof item === 'object' && item.name) return item.name.toLowerCase().trim();
    return String(item).toLowerCase().trim();
  }

  private aggregateObjects(results: VisionResult[]): any[] {
    const objectMap = new Map<string, { count: number; confidence: number; sources: string[] }>();

    results.forEach(result => {
      if (result.analysis.objects) {
        result.analysis.objects.forEach((obj: any) => {
          const key = this.normalizeItem(obj);
          const existing = objectMap.get(key) || { count: 0, confidence: 0, sources: [] };
          
          existing.count++;
          existing.confidence += (obj.confidence || result.confidence);
          existing.sources.push(result.model);
          
          objectMap.set(key, existing);
        });
      }
    });

    return Array.from(objectMap.entries()).map(([name, data]) => ({
      name,
      confidence: data.confidence / data.count,
      consensus: data.count / results.length,
      sources: data.sources
    })).sort((a, b) => b.confidence * b.consensus - a.confidence * a.consensus);
  }

  private aggregateScenes(results: VisionResult[]): any[] {
    const sceneMap = new Map<string, { count: number; confidence: number }>();

    results.forEach(result => {
      if (result.analysis.scenes) {
        result.analysis.scenes.forEach((scene: any) => {
          const key = this.normalizeItem(scene);
          const existing = sceneMap.get(key) || { count: 0, confidence: 0 };
          
          existing.count++;
          existing.confidence += (scene.confidence || result.confidence);
          
          sceneMap.set(key, existing);
        });
      }
    });

    return Array.from(sceneMap.entries()).map(([name, data]) => ({
      name,
      confidence: data.confidence / data.count,
      consensus: data.count / results.length
    })).sort((a, b) => b.confidence * b.consensus - a.confidence * a.consensus);
  }

  private aggregateEmotions(results: VisionResult[]): any[] {
    const emotionMap = new Map<string, { count: number; confidence: number }>();

    results.forEach(result => {
      if (result.analysis.emotions) {
        result.analysis.emotions.forEach((emotion: any) => {
          const key = this.normalizeItem(emotion);
          const existing = emotionMap.get(key) || { count: 0, confidence: 0 };
          
          existing.count++;
          existing.confidence += (emotion.confidence || result.confidence);
          
          emotionMap.set(key, existing);
        });
      }
    });

    return Array.from(emotionMap.entries()).map(([name, data]) => ({
      name,
      confidence: data.confidence / data.count,
      consensus: data.count / results.length
    })).sort((a, b) => b.confidence * b.consensus - a.confidence * a.consensus);
  }

  private aggregateAttributes(results: VisionResult[]): any {
    const attributes: any = {};

    results.forEach(result => {
      if (result.analysis.attributes) {
        Object.keys(result.analysis.attributes).forEach(key => {
          if (!attributes[key]) {
            attributes[key] = { values: [], confidence: 0, count: 0 };
          }
          
          attributes[key].values.push(result.analysis.attributes[key]);
          attributes[key].confidence += result.confidence;
          attributes[key].count++;
        });
      }
    });

    // Average the attributes
    Object.keys(attributes).forEach(key => {
      const attr = attributes[key];
      attr.confidence = attr.confidence / attr.count;
      attr.value = this.aggregateAttributeValues(attr.values);
      delete attr.values;
      delete attr.count;
    });

    return attributes;
  }

  private aggregateAttributeValues(values: any[]): any {
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];

    // If all values are numbers, return average
    if (values.every(v => typeof v === 'number')) {
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    // If all values are strings, return most common
    if (values.every(v => typeof v === 'string')) {
      const counts = new Map<string, number>();
      values.forEach(v => {
        counts.set(v, (counts.get(v) || 0) + 1);
      });
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Return first value as fallback
    return values[0];
  }

  private aggregateDescriptions(results: VisionResult[]): string {
    const descriptions = results
      .map(result => result.analysis.description)
      .filter(desc => desc && typeof desc === 'string');

    if (descriptions.length === 0) return '';
    if (descriptions.length === 1) return descriptions[0];

    // Extract common phrases and combine
    const commonPhrases = this.extractCommonPhrases(descriptions);
    return commonPhrases.join('. ') + '.';
  }

  private extractCommonPhrases(descriptions: string[]): string[] {
    const phrases = new Map<string, number>();
    
    descriptions.forEach(desc => {
      const words = desc.toLowerCase().split(/\s+/);
      
      // Extract 2-3 word phrases
      for (let i = 0; i < words.length - 1; i++) {
        const phrase2 = `${words[i]} ${words[i + 1]}`;
        phrases.set(phrase2, (phrases.get(phrase2) || 0) + 1);
        
        if (i < words.length - 2) {
          const phrase3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
          phrases.set(phrase3, (phrases.get(phrase3) || 0) + 1);
        }
      }
    });

    // Return phrases that appear in multiple descriptions
    return Array.from(phrases.entries())
      .filter(([phrase, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([phrase]) => phrase);
  }

  private calculateQualityMetrics(results: VisionResult[]): any {
    return {
      averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      modelConsistency: this.calculateModelAgreement(results),
      processingEfficiency: this.calculateProcessingEfficiency(results),
      coverageScore: this.calculateCoverageScore(results)
    };
  }

  private calculateAverageProcessingTime(results: VisionResult[]): number {
    if (!results || results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
  }

  private calculateAggregateQuality(results: VisionResult[]): number {
    if (!results || results.length === 0) return 0;
    
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const agreement = this.calculateModelAgreement(results);
    
    return (avgConfidence * 0.7) + (agreement * 0.3);
  }

  private calculateConsensusStrength(results: VisionResult[]): number {
    if (!results || results.length <= 1) return 1.0;
    
    return this.calculateModelAgreement(results);
  }

  private calculateProcessingEfficiency(results: VisionResult[]): number {
    if (!results || results.length === 0) return 0;
    
    const avgTime = this.calculateAverageProcessingTime(results);
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    // Efficiency = confidence per second (normalized)
    return avgTime > 0 ? Math.min(avgConfidence / (avgTime / 1000), 1.0) : 0;
  }

  private calculateCoverageScore(results: VisionResult[]): number {
    const allFeatures = new Set<string>();
    
    results.forEach(result => {
      if (result.analysis.objects) {
        result.analysis.objects.forEach((obj: any) => allFeatures.add('object'));
      }
      if (result.analysis.scenes) {
        result.analysis.scenes.forEach((scene: any) => allFeatures.add('scene'));
      }
      if (result.analysis.emotions) {
        result.analysis.emotions.forEach((emotion: any) => allFeatures.add('emotion'));
      }
      if (result.analysis.description) {
        allFeatures.add('description');
      }
      if (result.analysis.attributes) {
        Object.keys(result.analysis.attributes).forEach(attr => allFeatures.add(`attr_${attr}`));
      }
    });

    // Score based on feature diversity
    const maxFeatures = 10; // Expected maximum feature types
    return Math.min(allFeatures.size / maxFeatures, 1.0);
  }
}
