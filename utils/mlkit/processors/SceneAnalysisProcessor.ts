/**
 * Scene Analysis Processor for ML Kit
 * Analyzes scene type, activities, environment, and context using image labeling
 */

import { SceneAnalysis, ProcessingStatus } from '../types/MLKitTypes';
import { runImageLabeling } from './ImageLabelingProcessor';

export interface SceneAnalysisConfig {
  enableEnvironmentDetection: boolean;
  enableActivityDetection: boolean;
  enableTimeOfDayDetection: boolean;
  enableWeatherDetection: boolean;
}

export class SceneAnalysisProcessor {
  private config: SceneAnalysisConfig;

  constructor(config: SceneAnalysisConfig = {
    enableEnvironmentDetection: true,
    enableActivityDetection: true,
    enableTimeOfDayDetection: true,
    enableWeatherDetection: false
  }) {
    this.config = config;
  }

  /**
   * Process image for scene analysis using ML Kit image labeling
   */
  public async processImage(imagePath: string): Promise<SceneAnalysis> {
    try {
      const sceneAnalysis = await this.analyzeImageScene(imagePath);
      return sceneAnalysis;

    } catch (error) {
      console.error('❌ Error processing scene analysis:', error);
      return this.getFallbackSceneAnalysis();
    }
  }

  /**
   * Analyze image scene using ML Kit image labeling results
   */
  private async analyzeImageScene(imagePath: string): Promise<SceneAnalysis> {
    try {
      // Get image labels from ML Kit
      const labelResults = await runImageLabeling([imagePath]);
      const labels = labelResults[imagePath] || [];
      
      if (labels.length === 0) {
        console.warn('⚠️ No labels found, using fallback scene analysis');
        return this.getFallbackSceneAnalysis();
      }

      // Extract label texts for analysis
      const labelTexts = labels.map(label => label.text.toLowerCase());
      
      // Analyze scene based on labels
      const sceneAnalysis = this.interpretLabelsAsScene(labelTexts, imagePath);
      
      return sceneAnalysis;

    } catch (error) {
      console.error('❌ Error in scene analysis:', error);
      return this.getFallbackSceneAnalysis();
    }
  }

  /**
   * Interpret image labels to determine scene information
   */
  private interpretLabelsAsScene(labels: string[], imagePath: string): SceneAnalysis {
    const fileName = imagePath.split('/').pop()?.toLowerCase() || '';
    
    // Initialize scene analysis with proper types
    let primaryScene = 'unknown';
    let environment: 'indoor' | 'outdoor' | 'unknown' = 'unknown';
    let activities: string[] = [];
    let setting: string[] = [];
    let timeOfDay: 'unknown' | 'night' | 'morning' | 'afternoon' | 'evening' = 'unknown';
    let weather = 'unknown';
    
    // Analyze environment based on labels
    const outdoorLabels = ['sky', 'tree', 'grass', 'cloud', 'mountain', 'water', 'nature', 'landscape', 'outdoor', 'park', 'beach', 'forest'];
    const indoorLabels = ['room', 'wall', 'furniture', 'table', 'chair', 'bed', 'indoor', 'home', 'house', 'building'];
    
    if (labels.some(label => outdoorLabels.some(outdoor => label.includes(outdoor)))) {
      environment = 'outdoor';
      setting.push('nature');
    } else if (labels.some(label => indoorLabels.some(indoor => label.includes(indoor)))) {
      environment = 'indoor';
      setting.push('residential');
    }
    
    // Determine primary scene based on labels
    if (labels.some(label => ['food', 'meal', 'restaurant', 'kitchen', 'cooking'].some(food => label.includes(food)))) {
      primaryScene = 'food';
      activities.push('dining');
      setting.push('culinary');
    } else if (labels.some(label => ['person', 'face', 'people', 'human'].some(person => label.includes(person)))) {
      primaryScene = 'portrait';
      activities.push('social', 'photography');
      setting.push('personal');
    } else if (labels.some(label => ['vehicle', 'car', 'transport', 'road', 'street'].some(transport => label.includes(transport)))) {
      primaryScene = 'transportation';
      activities.push('travel');
      setting.push('urban');
    } else if (labels.some(label => ['animal', 'pet', 'dog', 'cat', 'wildlife'].some(animal => label.includes(animal)))) {
      primaryScene = 'animals';
      activities.push('nature', 'wildlife');
      setting.push('nature');
    } else if (environment === 'outdoor') {
      primaryScene = 'landscape';
      activities.push('outdoor', 'recreation');
    } else if (environment === 'indoor') {
      primaryScene = 'indoor';
      activities.push('daily_life');
    }
    
    // Determine time of day based on labels
    if (labels.some(label => ['sunset', 'sunrise', 'dawn', 'dusk'].some(time => label.includes(time)))) {
      timeOfDay = 'evening';
    } else if (labels.some(label => ['night', 'dark', 'lamp', 'light'].some(time => label.includes(time)))) {
      timeOfDay = 'night';
    } else if (labels.some(label => ['bright', 'sunny', 'daylight'].some(time => label.includes(time)))) {
      timeOfDay = 'afternoon';
    }
    
    // Determine weather based on labels
    if (this.config.enableWeatherDetection) {
      if (labels.some(label => ['rain', 'wet', 'umbrella'].some(weather => label.includes(weather)))) {
        weather = 'rainy';
      } else if (labels.some(label => ['snow', 'winter', 'cold'].some(weather => label.includes(weather)))) {
        weather = 'snowy';
      } else if (labels.some(label => ['cloud', 'cloudy', 'overcast'].some(weather => label.includes(weather)))) {
        weather = 'cloudy';
      } else if (labels.some(label => ['sunny', 'clear', 'bright'].some(weather => label.includes(weather)))) {
        weather = 'sunny';
      }
    }
    
    // Determine orientation based on typical patterns (simplified)
    const pathHash = this.simpleHash(imagePath);
    const orientation = (pathHash % 3 === 0) ? 'portrait' : 
                       (pathHash % 3 === 1) ? 'landscape' : 'square';

    return {
      primaryScene,
      activities,
      orientation,
      environment,
      timeOfDay,
      weather,
      setting
    };
  }

  /**
   * Get fallback scene analysis when ML Kit is not available
   */
  private getFallbackSceneAnalysis(): SceneAnalysis {
    return {
      primaryScene: 'unknown',
      activities: ['general'],
      orientation: 'landscape',
      environment: 'unknown',
      timeOfDay: 'unknown',
      weather: 'unknown',
      setting: ['general']
    };
  }

  /**
   * Process multiple images in batch
   */
  public async processBatch(
    imagePaths: string[],
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<{ path: string; scene: SceneAnalysis }[]> {
    const results: { path: string; scene: SceneAnalysis }[] = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      
      try {
        // Update progress
        if (onProgress) {
          onProgress({
            status: 'processing',
            progress: (i / imagePaths.length) * 100,
            currentStep: `Analyzing scene ${i + 1} of ${imagePaths.length}`,
            estimatedTimeRemaining: ((imagePaths.length - i) * 1500) // Rough estimate
          });
        }

        const scene = await this.processImage(imagePath);
        results.push({ path: imagePath, scene });

      } catch (error) {
        console.error(`❌ Error processing scene for ${imagePath}:`, error);
        results.push({ path: imagePath, scene: this.getFallbackSceneAnalysis() });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 100,
        currentStep: 'Scene analysis complete'
      });
    }

    return results;
  }

  /**
   * Simple hash function for deterministic results
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<SceneAnalysisConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): SceneAnalysisConfig {
    return { ...this.config };
  }
}
