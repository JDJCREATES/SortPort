/**
 * ML Kit to Virtual Image Mapper
 * 
 * Converts ML Kit analysis results to virtual_image database format
 * Maps all ML Kit data to appropriate virtual_image schema fields
 */

import { MLKitAnalysisResult, VirtualImageMLUpdate } from '../types/MLKitTypes';

export class MLKitVirtualImageMapper {
  
  /**
   * 🎯 Convert ML Kit analysis to virtual_image update format
   */
  static mapMLKitToVirtualImage(mlkitResult: MLKitAnalysisResult): VirtualImageMLUpdate {
    const { analysis } = mlkitResult;
    
    return {
      // 🏷️ Tags and Objects
      virtual_tags: this.extractVirtualTags(analysis),
      detected_objects: this.extractDetectedObjects(analysis),
      
      // 👥 Face Analysis  
      detected_faces_count: analysis.faces?.count || 0,
      emotion_detected: analysis.faces?.emotions || [],
      
      // 🎬 Scene and Activity
      scene_type: analysis.scene?.primaryScene || null,
      activity_detected: analysis.scene?.activities || [],
      image_orientation: analysis.scene?.orientation || null,
      
      // 📊 Quality Scores (normalized to 0.0-1.0)
      quality_score: analysis.quality?.overall || null,
      brightness_score: analysis.quality?.brightness || null,
      blur_score: analysis.quality?.blur || null,
      aesthetic_score: analysis.quality?.aesthetic || null,
      
      // 📝 Text Detection
      has_text: analysis.text?.hasText || false,
      
      // 📝 Generated Content
      caption: this.generateCaption(analysis),
      vision_summary: this.generateVisionSummary(analysis),
      
      // 💾 Complete ML Kit data storage
      metadata: {
        mlkit_analysis: analysis,
        processing_info: analysis.metadata,
        mapping_version: '1.0.0',
        mapped_at: new Date().toISOString()
      }
    };
  }

  /**
   * 🏷️ Extract meaningful tags from labels with confidence filtering
   */
  private static extractVirtualTags(analysis: any): string[] {
    const tags = new Set<string>();
    
    // From image labels (primary source)
    if (analysis.labels) {
      analysis.labels
        .filter((label: any) => label.confidence > 0.6) // High confidence only
        .forEach((label: any) => tags.add(label.text.toLowerCase()));
    }
    
    // From scene analysis
    if (analysis.scene) {
      if (analysis.scene.environment) tags.add(analysis.scene.environment);
      if (analysis.scene.timeOfDay && analysis.scene.timeOfDay !== 'unknown') {
        tags.add(analysis.scene.timeOfDay);
      }
    }
    
    // From face analysis
    if (analysis.faces?.count > 0) {
      tags.add('people');
      if (analysis.faces.count === 1) tags.add('portrait');
      if (analysis.faces.count > 1) tags.add('group');
    }
    
    // From text detection
    if (analysis.text?.hasText) {
      tags.add('text');
      if (analysis.text.fullText?.length > 50) tags.add('document');
    }
    
    return Array.from(tags).slice(0, 20); // Limit to 20 tags
  }

  /**
   * 🎯 Extract object detection results
   */
  private static extractDetectedObjects(analysis: any): string[] {
    const objects = new Set<string>();
    
    // From object detection
    if (analysis.objects) {
      analysis.objects.forEach((obj: any) => {
        obj.labels?.forEach((label: any) => {
          if (label.confidence > 0.5) {
            objects.add(label.text.toLowerCase());
          }
        });
      });
    }
    
    // From high-confidence image labels that represent objects
    if (analysis.labels) {
      const objectKeywords = [
        'car', 'vehicle', 'bicycle', 'motorcycle', 'boat', 'plane',
        'person', 'animal', 'dog', 'cat', 'bird', 'horse',
        'building', 'house', 'tree', 'flower', 'food', 'furniture',
        'computer', 'phone', 'camera', 'book', 'clothing'
      ];
      
      analysis.labels
        .filter((label: any) => 
          label.confidence > 0.7 && 
          objectKeywords.some(keyword => label.text.toLowerCase().includes(keyword))
        )
        .forEach((label: any) => objects.add(label.text.toLowerCase()));
    }
    
    return Array.from(objects).slice(0, 15); // Limit to 15 objects
  }

  /**
   * 📝 Generate a concise caption for the image
   */
  private static generateCaption(analysis: any): string {
    const parts: string[] = [];
    
    // Scene and setting
    if (analysis.scene?.primaryScene) {
      parts.push(analysis.scene.primaryScene);
    }
    
    // People/faces
    if (analysis.faces?.count > 0) {
      if (analysis.faces.count === 1) {
        parts.push('with a person');
      } else {
        parts.push(`with ${analysis.faces.count} people`);
      }
    }
    
    // Primary objects/activities
    if (analysis.scene?.activities?.length > 0) {
      parts.push(`featuring ${analysis.scene.activities[0]}`);
    } else if (analysis.labels?.length > 0) {
      const primaryLabel = analysis.labels
        .sort((a: any, b: any) => b.confidence - a.confidence)[0];
      if (primaryLabel.confidence > 0.8) {
        parts.push(`featuring ${primaryLabel.text.toLowerCase()}`);
      }
    }
    
    // Environment context
    if (analysis.scene?.environment && analysis.scene.environment !== 'unknown') {
      parts.push(`${analysis.scene.environment} setting`);
    }
    
    return parts.length > 0 
      ? `${parts.join(' ')}`.replace(/^./, str => str.toUpperCase())
      : 'Image';
  }

  /**
   * 📋 Generate comprehensive vision summary
   */
  private static generateVisionSummary(analysis: any): string {
    const summary: string[] = [];
    
    // Image quality and technical details
    if (analysis.quality) {
      const qualityDesc = analysis.quality.overall > 0.8 ? 'high quality' :
                         analysis.quality.overall > 0.6 ? 'good quality' : 'standard quality';
      summary.push(`${qualityDesc} ${analysis.scene?.orientation || ''} image`);
    }
    
    // Scene and environment
    if (analysis.scene) {
      let sceneDesc = analysis.scene.primaryScene || 'scene';
      if (analysis.scene.environment !== 'unknown') {
        sceneDesc += ` in ${analysis.scene.environment} environment`;
      }
      if (analysis.scene.timeOfDay !== 'unknown') {
        sceneDesc += ` during ${analysis.scene.timeOfDay}`;
      }
      summary.push(sceneDesc);
    }
    
    // Content analysis
    const contentParts: string[] = [];
    
    if (analysis.faces?.count > 0) {
      contentParts.push(`${analysis.faces.count} ${analysis.faces.count === 1 ? 'person' : 'people'}`);
      if (analysis.faces.emotions?.length > 0) {
        contentParts.push(`showing ${analysis.faces.emotions.join(', ')} emotions`);
      }
    }
    
    if (analysis.objects?.length > 0) {
      const objectNames = analysis.objects
        .slice(0, 3)
        .map((obj: any) => obj.labels?.[0]?.text)
        .filter(Boolean);
      if (objectNames.length > 0) {
        contentParts.push(`containing ${objectNames.join(', ')}`);
      }
    }
    
    if (analysis.text?.hasText) {
      contentParts.push('with readable text');
    }
    
    if (contentParts.length > 0) {
      summary.push(`Features ${contentParts.join(', ')}`);
    }
    
    // Activities
    if (analysis.scene?.activities?.length > 0) {
      summary.push(`Activities: ${analysis.scene.activities.join(', ')}`);
    }
    
    return summary.join('. ');
  }

  /**
   * 🔍 Validate mapped data before database insertion
   */
  static validateMappedData(mappedData: VirtualImageMLUpdate): { 
    valid: boolean; 
    errors: string[]; 
    sanitized: VirtualImageMLUpdate 
  } {
    const errors: string[] = [];
    const sanitized = { ...mappedData };
    
    // Validate arrays
    if (!Array.isArray(sanitized.virtual_tags)) {
      sanitized.virtual_tags = [];
      errors.push('virtual_tags must be an array');
    }
    
    if (!Array.isArray(sanitized.detected_objects)) {
      sanitized.detected_objects = [];
      errors.push('detected_objects must be an array');
    }
    
    if (!Array.isArray(sanitized.emotion_detected)) {
      sanitized.emotion_detected = [];
      errors.push('emotion_detected must be an array');
    }
    
    if (!Array.isArray(sanitized.activity_detected)) {
      sanitized.activity_detected = [];
      errors.push('activity_detected must be an array');
    }
    
    // Validate numbers
    if (typeof sanitized.detected_faces_count !== 'number' || sanitized.detected_faces_count < 0) {
      sanitized.detected_faces_count = 0;
      errors.push('detected_faces_count must be a non-negative number');
    }
    
    // Validate scores (0.0 - 1.0)
    const scoreFields = ['quality_score', 'brightness_score', 'blur_score', 'aesthetic_score'];
    scoreFields.forEach(field => {
      const value = (sanitized as any)[field];
      if (value !== null && (typeof value !== 'number' || value < 0 || value > 1)) {
        (sanitized as any)[field] = null;
        errors.push(`${field} must be between 0.0 and 1.0 or null`);
      }
    });
    
    // Validate boolean
    if (typeof sanitized.has_text !== 'boolean') {
      sanitized.has_text = false;
      errors.push('has_text must be a boolean');
    }
    
    // Truncate strings if too long
    if (sanitized.caption && sanitized.caption.length > 500) {
      sanitized.caption = sanitized.caption.substring(0, 497) + '...';
      errors.push('caption truncated to 500 characters');
    }
    
    if (sanitized.vision_summary && sanitized.vision_summary.length > 2000) {
      sanitized.vision_summary = sanitized.vision_summary.substring(0, 1997) + '...';
      errors.push('vision_summary truncated to 2000 characters');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      sanitized
    };
  }
}
