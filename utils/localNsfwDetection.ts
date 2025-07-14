import * as FileSystem from 'expo-file-system';

interface LocalNSFWResult {
  isNsfw: boolean;
  confidence: number;
  method: string;
  reasons?: string[];
}

interface BatchNSFWResult {
  imageUri: string;
  isNsfw: boolean;
  confidence: number;
  method: string;
  reasons?: string[];
}

export class LocalNSFWDetector {
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      console.log('🧠 Initializing local pre-filter (allowing all for AWS scanning)...');
      this.isInitialized = true;
      console.log('✅ Local pre-filter ready - all images will be sent to AWS');
    } catch (error) {
      console.error('❌ Failed to initialize detection:', error);
      throw error;
    }
  }

  static async detectNSFW(imageUri: string): Promise<LocalNSFWResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const filename = this.extractFilename(imageUri);
      
      console.log(`🔍 Local pre-filter check: ${filename} - ALLOWING (AWS will scan)`);
      
      // ✅ ALLOW EVERYTHING - Let AWS do the real detection
      return {
        isNsfw: false,        // Always return false to allow through
        confidence: 0,        // Zero confidence in local detection
        method: 'local_passthrough',
        reasons: ['allowing_for_aws_scan']
      };
      
    } catch (error) {
      console.warn('Local pre-filter failed (allowing anyway):', error);
      return { 
        isNsfw: false,        // Still allow through on error
        confidence: 0, 
        method: 'detection_error_passthrough' 
      };
    }
  }

  static async batchDetectNSFW(imageUris: string[], batchSize: number = 25): Promise<BatchNSFWResult[]> {
    console.log(`🔍 Local pre-filter batch: ${imageUris.length} images - ALLOWING ALL for AWS scan`);
    
    const results: BatchNSFWResult[] = [];
    
    for (let i = 0; i < imageUris.length; i += batchSize) {
      const batch = imageUris.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (uri) => {
          const result = await this.detectNSFW(uri);
          return {
            imageUri: uri,
            isNsfw: result.isNsfw,      // Always false
            confidence: result.confidence, // Always 0
            method: result.method,
            reasons: result.reasons
          };
        })
      );
      
      results.push(...batchResults);
      
      // Minimal delay for file operations
      if (i + batchSize < imageUris.length) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    
    console.log(`✅ Local pre-filter complete: ${results.length} images ALLOWED for AWS processing`);
    return results;
  }

  private static analyzeFilename(filename: string): { score: number; reason?: string } {
    // Always return safe score to allow through
    return { score: 0, reason: 'passthrough_mode' };
  }

  private static analyzeFileCharacteristics(imageInfo: any, filename: string): { score: number; reason?: string } {
    // Always return safe score to allow through
    return { score: 0, reason: 'passthrough_mode' };
  }

  private static analyzeBehavioralPatterns(imageUri: string, filename: string): { score: number; reason?: string } {
    // Always return safe score to allow through
    return { score: 0, reason: 'passthrough_mode' };
  }

  private static analyzeTemporalPatterns(imageInfo: any, filename: string): { score: number; reason?: string } {
    // Always return safe score to allow through
    return { score: 0, reason: 'passthrough_mode' };
  }

  private static extractFilename(imageUri: string): string {
    try {
      return imageUri.split('/').pop() || '';
    } catch (error) {
      return '';
    }
  }

  private static async getImageInfo(imageUri: string): Promise<any> {
    try {
      return await FileSystem.getInfoAsync(imageUri);
    } catch (error) {
      return null;
    }
  }
}