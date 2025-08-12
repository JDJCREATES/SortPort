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
    
    const result: VirtualImageMLUpdate = {
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
      
      // � Enhanced Quality Analysis - NEW
      contrast_score: analysis.quality?.contrast || null,
      exposure_score: analysis.quality?.exposure || null,
      saturation_score: analysis.quality?.saturation || null,
      sharpness_score: analysis.quality?.sharpness || null,
      
      // �📝 Text Detection
      has_text: analysis.text?.hasText || false,
      
      // 📝 Enhanced Text Analysis - NEW
      text_full_content: analysis.text?.fullText || null,
      text_languages: analysis.text?.languages || null,
      text_block_count: analysis.text?.blocks?.length || 0,
      
      // 🎬 Enhanced Scene Analysis - NEW
      scene_setting: analysis.scene?.setting || null,
      scene_weather: analysis.scene?.weather !== 'unknown' ? analysis.scene?.weather : null,
      scene_time_of_day: analysis.scene?.timeOfDay !== 'unknown' ? analysis.scene?.timeOfDay : null,
      scene_environment: analysis.scene?.environment !== 'unknown' ? analysis.scene?.environment : null,
      
      // 👥 Enhanced Face Analysis - NEW
      face_landmarks: this.extractFaceLandmarks(analysis),
      face_head_poses: this.extractFaceHeadPoses(analysis),
      face_eye_states: this.extractFaceEyeStates(analysis),
      face_expressions: this.extractFaceExpressions(analysis),
      
      // 🔧 ML Kit Processing Metadata - NEW
      mlkit_processing_time: analysis.metadata?.processingTime || null,
      mlkit_confidence_overall: analysis.metadata?.confidence?.overall || null,
      mlkit_confidence_face: analysis.metadata?.confidence?.faceDetection || null,
      mlkit_confidence_object: analysis.metadata?.confidence?.objectDetection || null,
      mlkit_confidence_text: analysis.metadata?.confidence?.textRecognition || null,
      mlkit_analysis_date: analysis.metadata?.analysisDate ? new Date(analysis.metadata.analysisDate) : null,
      mlkit_mapping_version: '2.0.0',
      mlkit_device_platform: analysis.metadata?.deviceInfo?.platform || null,
      
      // 📝 Generated Content
      caption: this.generateCaption(analysis),
      vision_summary: this.generateVisionSummary(analysis),
      
      // 🎯 Enhanced Spatial Data - FIXED
      object_coordinates: this.extractObjectCoordinates(analysis),
      face_coordinates: this.extractFaceCoordinates(analysis),
      text_regions: this.extractTextRegions(analysis),
      composition_analysis: this.analyzeComposition(analysis),
      
      // 💾 Complete ML Kit data storage
      metadata: {
        mlkit_analysis: analysis,
        processing_info: analysis.metadata,
        mapping_version: '2.0.0', // Bumped version for enhanced spatial features
        mapped_at: new Date().toISOString()
      }
    };
    
    // Debug logging to verify spatial data extraction
    const spatialDebug = {
      objects_found: this.extractObjectCoordinates(analysis)?.length || 0,
      faces_found: this.extractFaceCoordinates(analysis)?.length || 0,
      text_regions_found: this.extractTextRegions(analysis)?.length || 0,
      composition_available: !!this.analyzeComposition(analysis),
      has_objects_in_analysis: !!analysis.objects,
      has_faces_in_analysis: !!analysis.faces?.faces,
      has_text_in_analysis: !!analysis.text?.blocks
    };
    
    console.log('🎯 Spatial data extraction debug:', spatialDebug);
    
    return result;
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
   * 🎯 Extract object coordinates with spatial data - NEW
   */
  private static extractObjectCoordinates(analysis: any): Array<{
    label: string;
    confidence: number;
    boundingBox: any;
    category?: string;
    trackingId?: number;
  }> | null {
    if (!analysis.objects || analysis.objects.length === 0) {
      return null;
    }

    return analysis.objects
      .filter((obj: any) => obj.labels?.[0]?.confidence > 0.5)
      .map((obj: any) => ({
        label: obj.labels[0].text,
        confidence: obj.labels[0].confidence,
        boundingBox: obj.boundingBox,
        category: this.inferObjectCategory(obj.labels[0].text),
        trackingId: obj.trackingId
      }))
      .slice(0, 20); // Limit to 20 objects
  }

  /**
   * 👥 Extract face coordinates with detailed analysis - NEW
   */
  private static extractFaceCoordinates(analysis: any): Array<{
    boundingBox: any;
    landmarks?: any[];
    emotions: any[];
    headPose?: { yaw: number; roll: number };
    eyeState?: { leftOpen: number; rightOpen: number };
    expressions?: { smiling: number };
  }> | null {
    if (!analysis.faces?.faces || analysis.faces.faces.length === 0) {
      return null;
    }

    return analysis.faces.faces.map((face: any) => ({
      boundingBox: face.boundingBox,
      landmarks: face.landmarks,
      emotions: face.emotions || [],
      headPose: (face.headEulerAngleY !== undefined || face.headEulerAngleZ !== undefined) ? {
        yaw: face.headEulerAngleY || 0,
        roll: face.headEulerAngleZ || 0
      } : undefined,
      eyeState: (face.leftEyeOpenProbability !== undefined || face.rightEyeOpenProbability !== undefined) ? {
        leftOpen: face.leftEyeOpenProbability || 0.5,
        rightOpen: face.rightEyeOpenProbability || 0.5
      } : undefined,
      expressions: face.smilingProbability !== undefined ? {
        smiling: face.smilingProbability
      } : undefined
    }));
  }

  /**
   * 📝 Extract text regions with spatial data - NEW
   */
  private static extractTextRegions(analysis: any): Array<{
    text: string;
    boundingBox: any;
    confidence: number;
    language?: string;
  }> | null {
    if (!analysis.text?.blocks || analysis.text.blocks.length === 0) {
      return null;
    }

    const textRegions: any[] = [];
    
    analysis.text.blocks.forEach((block: any) => {
      if (block.text && block.confidence > 0.5) {
        textRegions.push({
          text: block.text,
          boundingBox: block.boundingBox,
          confidence: block.confidence,
          language: analysis.text.languages?.[0]
        });
      }
    });

    return textRegions.length > 0 ? textRegions : null;
  }

  /**
   * 🎨 Analyze image composition - NEW
   */
  private static analyzeComposition(analysis: any): {
    dominantColors: Array<{ color: string; percentage: number }>;
    spatialLayout: {
      topObjects: string[];
      centerObjects: string[];
      bottomObjects: string[];
      leftObjects: string[];
      rightObjects: string[];
    };
    visualBalance: number;
    ruleOfThirds: boolean;
    symmetry: number;
  } | null {
    if (!analysis.objects && !analysis.faces?.faces) {
      return null;
    }

    // Analyze spatial layout based on object positions
    const spatialLayout = {
      topObjects: [] as string[],
      centerObjects: [] as string[],
      bottomObjects: [] as string[],
      leftObjects: [] as string[],
      rightObjects: [] as string[]
    };

    // Process objects
    if (analysis.objects) {
      analysis.objects.forEach((obj: any) => {
        const bbox = obj.boundingBox;
        const objName = obj.labels?.[0]?.text;
        if (!objName || !bbox) return;

        const centerY = bbox.top + (bbox.height / 2);
        const centerX = bbox.left + (bbox.width / 2);

        // Vertical distribution
        if (centerY < 0.33) spatialLayout.topObjects.push(objName);
        else if (centerY > 0.67) spatialLayout.bottomObjects.push(objName);
        else spatialLayout.centerObjects.push(objName);

        // Horizontal distribution
        if (centerX < 0.33) spatialLayout.leftObjects.push(objName);
        else if (centerX > 0.67) spatialLayout.rightObjects.push(objName);
      });
    }

    // Calculate visual balance (simplified)
    const totalElements = (analysis.objects?.length || 0) + (analysis.faces?.count || 0);
    const visualBalance = totalElements > 0 ? Math.min(1.0, 1.0 / Math.sqrt(totalElements)) : 0.5;

    // Check rule of thirds (simplified)
    const hasElementsInThirds = spatialLayout.topObjects.length > 0 && 
                               spatialLayout.centerObjects.length > 0 && 
                               spatialLayout.bottomObjects.length > 0;

    return {
      dominantColors: [], // TODO: Extract from image properties when available
      spatialLayout,
      visualBalance,
      ruleOfThirds: hasElementsInThirds,
      symmetry: 0.5 // TODO: Calculate based on object distribution
    };
  }

  /**
   * 🏷️ Infer object category from label - Helper method
   */
  private static inferObjectCategory(label: string): string {
    const labelLower = label.toLowerCase();
    
    const categories = {
      'vehicles': ['car', 'vehicle', 'truck', 'bus', 'motorcycle', 'bicycle', 'boat', 'plane'],
      'people': ['person', 'people', 'human', 'man', 'woman', 'child', 'baby'],
      'animals': ['dog', 'cat', 'animal', 'bird', 'horse', 'cow', 'pet'],
      'buildings': ['building', 'house', 'skyscraper', 'tower', 'bridge'],
      'nature': ['tree', 'plant', 'flower', 'mountain', 'water', 'sky'],
      'food': ['food', 'fruit', 'vegetable', 'drink', 'coffee'],
      'technology': ['computer', 'phone', 'camera', 'television'],
      'furniture': ['chair', 'table', 'bed', 'sofa']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => labelLower.includes(keyword))) {
        return category;
      }
    }

    return 'miscellaneous';
  }

  /**
   * 👁️ Extract face landmarks - NEW
   */
  private static extractFaceLandmarks(analysis: any): Array<{
    type: string;
    position: { x: number; y: number };
  }> | null {
    if (!analysis.faces?.faces || analysis.faces.faces.length === 0) {
      return null;
    }

    const allLandmarks: any[] = [];
    analysis.faces.faces.forEach((face: any) => {
      if (face.landmarks) {
        allLandmarks.push(...face.landmarks);
      }
    });

    return allLandmarks.length > 0 ? allLandmarks : null;
  }

  /**
   * 🎭 Extract face head poses - NEW
   */
  private static extractFaceHeadPoses(analysis: any): Array<{
    yaw: number;
    roll: number;
  }> | null {
    if (!analysis.faces?.faces || analysis.faces.faces.length === 0) {
      return null;
    }

    const headPoses = analysis.faces.faces
      .filter((face: any) => face.headEulerAngleY !== undefined || face.headEulerAngleZ !== undefined)
      .map((face: any) => ({
        yaw: face.headEulerAngleY || 0,
        roll: face.headEulerAngleZ || 0
      }));

    return headPoses.length > 0 ? headPoses : null;
  }

  /**
   * 👀 Extract face eye states - NEW
   */
  private static extractFaceEyeStates(analysis: any): Array<{
    leftOpen: number;
    rightOpen: number;
  }> | null {
    if (!analysis.faces?.faces || analysis.faces.faces.length === 0) {
      return null;
    }

    const eyeStates = analysis.faces.faces
      .filter((face: any) => face.leftEyeOpenProbability !== undefined || face.rightEyeOpenProbability !== undefined)
      .map((face: any) => ({
        leftOpen: face.leftEyeOpenProbability || 0.5,
        rightOpen: face.rightEyeOpenProbability || 0.5
      }));

    return eyeStates.length > 0 ? eyeStates : null;
  }

  /**
   * 😊 Extract face expressions - NEW
   */
  private static extractFaceExpressions(analysis: any): Array<{
    smiling: number;
  }> | null {
    if (!analysis.faces?.faces || analysis.faces.faces.length === 0) {
      return null;
    }

    const expressions = analysis.faces.faces
      .filter((face: any) => face.smilingProbability !== undefined)
      .map((face: any) => ({
        smiling: face.smilingProbability
      }));

    return expressions.length > 0 ? expressions : null;
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
