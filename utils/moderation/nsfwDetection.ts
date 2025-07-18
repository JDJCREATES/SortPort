// NSFW Detection based on AWS Rekognition labels and our CSV mapping
interface ModerationLabel {
  Name: string;
  Confidence: number;
  ParentName?: string;
  TaxonomyLevel?: number;
}

interface NsfwDetectionResult {
  isNsfw: boolean;
  confidence: number;
  categories: string[];
  primaryCategory: string;
  severity: 'low' | 'medium' | 'high';
}

// Based on assets/rekognition-moderation-labels.csv
const NSFW_LABEL_MAPPING: { [key: string]: { category: string; severity: 'low' | 'medium' | 'high' } } = {
  // Explicit Content (High Severity)
  'Exposed Male Genitalia': { category: 'explicit_nudity', severity: 'high' },
  'Exposed Female Genitalia': { category: 'explicit_nudity', severity: 'high' },
  'Exposed Buttocks or Anus': { category: 'explicit_nudity', severity: 'high' },
  'Exposed Female Nipple': { category: 'explicit_nudity', severity: 'high' },
  'Explicit Sexual Activity': { category: 'explicit_nudity', severity: 'high' },
  'Sex Toys': { category: 'explicit_nudity', severity: 'high' },
  
  // Partial Nudity (Medium Severity)
  'Bare Back': { category: 'partial_nudity', severity: 'medium' },
  'Exposed Male Nipple': { category: 'partial_nudity', severity: 'low' },
  'Partially Exposed Buttocks': { category: 'partial_nudity', severity: 'medium' },
  'Partially Exposed Female Breast': { category: 'partial_nudity', severity: 'medium' },
  'Implied Nudity': { category: 'partial_nudity', severity: 'medium' },
  'Obstructed Female Nipple': { category: 'partial_nudity', severity: 'medium' },
  'Obstructed Male Genitalia': { category: 'partial_nudity', severity: 'medium' },
  'Kissing on the Lips': { category: 'suggestive_content', severity: 'low' },
  
  // Swimwear/Underwear (Low-Medium Severity)
  'Female Swimwear or Underwear': { category: 'partial_nudity', severity: 'low' },
  'Male Swimwear or Underwear': { category: 'partial_nudity', severity: 'low' },
  'Swimwear or Underwear': { category: 'partial_nudity', severity: 'low' },
  
  // Violence (High Severity)
  'Weapons': { category: 'weapons', severity: 'medium' },
  'Weapon Violence': { category: 'graphic_violence', severity: 'high' },
  'Physical Violence': { category: 'graphic_violence', severity: 'high' },
  'Self-Harm': { category: 'disturbing_content', severity: 'high' },
  'Blood & Gore': { category: 'graphic_violence', severity: 'high' },
  'Explosions and Blasts': { category: 'graphic_violence', severity: 'high' },
  
  // Disturbing Content (High Severity)
  'Emaciated Bodies': { category: 'disturbing_content', severity: 'high' },
  'Corpses': { category: 'disturbing_content', severity: 'high' },
  'Air Crash': { category: 'disturbing_content', severity: 'medium' },
  
  // Substances (Low-Medium Severity)
  'Pills': { category: 'drugs', severity: 'low' },
  'Smoking': { category: 'tobacco', severity: 'low' },
  'Drinking': { category: 'alcohol', severity: 'low' },
  'Alcoholic Beverages': { category: 'alcohol', severity: 'low' },
  
  // Inappropriate Content (Medium-High Severity)
  'Middle Finger': { category: 'rude_gestures', severity: 'medium' },
  'Gambling': { category: 'gambling', severity: 'low' },
  'Nazi Party': { category: 'hate_symbols', severity: 'high' },
  'White Supremacy': { category: 'hate_symbols', severity: 'high' },
  'Extremist': { category: 'hate_symbols', severity: 'high' },
};

export class NsfwDetection {
  /**
   * Analyze moderation labels and determine NSFW status
   */
  static analyzeLabels(
    moderationLabels: ModerationLabel[], 
    confidenceThreshold: number = 80
  ): NsfwDetectionResult {
    const detectedCategories: string[] = [];
    let maxConfidence = 0;
    let highestSeverity: 'low' | 'medium' | 'high' = 'low';
    let primaryCategory = 'unknown';
    
    for (const label of moderationLabels) {
      const confidence = label.Confidence || 0;
      maxConfidence = Math.max(maxConfidence, confidence);
      
      if (confidence >= confidenceThreshold) {
        const labelName = label.Name || '';
        const parentName = label.ParentName || '';
        
        // Check exact matches first
        let matchedMapping = NSFW_LABEL_MAPPING[labelName] || NSFW_LABEL_MAPPING[parentName];
        
        // If no exact match, try partial matching
        if (!matchedMapping) {
          for (const [key, mapping] of Object.entries(NSFW_LABEL_MAPPING)) {
            if (labelName.toLowerCase().includes(key.toLowerCase()) || 
                key.toLowerCase().includes(labelName.toLowerCase()) ||
                (parentName && parentName.toLowerCase().includes(key.toLowerCase()))) {
              matchedMapping = mapping;
              break;
            }
          }
        }
        
        if (matchedMapping) {
          detectedCategories.push(matchedMapping.category);
          
          // Update severity and primary category
          if (this.getSeverityLevel(matchedMapping.severity) > this.getSeverityLevel(highestSeverity)) {
            highestSeverity = matchedMapping.severity;
            primaryCategory = matchedMapping.category;
          }
        }
      }
    }
    
    const isNsfw = detectedCategories.length > 0;
    
    return {
      isNsfw,
      confidence: maxConfidence / 100,
      categories: [...new Set(detectedCategories)], // Remove duplicates
      primaryCategory,
      severity: highestSeverity
    };
  }
  
  private static getSeverityLevel(severity: 'low' | 'medium' | 'high'): number {
    switch (severity) {
      case 'low': return 1;
      case 'medium': return 2;
      case 'high': return 3;
      default: return 0;
    }
  }
  
  /**
   * Batch analyze multiple images
   */
  static batchAnalyze(
    results: Array<{ moderation_labels: ModerationLabel[]; image_id: string; confidence_score: number }>,
    confidenceThreshold: number = 80
  ): Array<{ image_id: string; nsfwResult: NsfwDetectionResult; rawResult: any }> {
    return results.map(result => ({
      image_id: result.image_id,
      nsfwResult: this.analyzeLabels(result.moderation_labels, confidenceThreshold),
      rawResult: result
    }));
  }
}