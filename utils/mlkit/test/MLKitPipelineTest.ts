/**
 * ML Kit Pipeline Test and Diagnostic Tool
 * Tests the improved ML Kit pipeline with various scenarios
 */

import { MLKitManager } from '../MLKitManager';
import { ImagePathHelper } from '../helpers/imagePathHelper';
import { FileValidator } from '../validation/FileValidator';
import { MLKitProcessingHelper } from '../helpers/MLKitProcessingHelper';

export class MLKitPipelineTest {
  private mlkitManager: MLKitManager;

  constructor() {
    this.mlkitManager = MLKitManager.getInstance();
  }

  /**
   * Test path corruption detection and handling
   */
  async testPathCorruption(): Promise<void> {
    console.log('🧪 Testing path corruption detection...');

    // Test cases with known corruption patterns
    const corruptedPaths = [
      'file:///data/user/0/com.anonymous.sortxport/cache/5b6ff138b-65ba-4765-af3c-868da25d8a25.JPEG',
      'file:///data/user/0/com.anonymous.sortxport/cache/1f966d7a1-efb3-401d-b89b-0b7c9836eeb0.JPEG',
      'file:///data/user/0/com.anonymous.sortxport/cache/885dd6774-aa9f-4223-acfb-f4bfd0186220.JPEG'
    ];

    for (const path of corruptedPaths) {
      console.log(`\n🔍 Testing corrupted path: ${path}`);
      
      // Test corruption detection
      const corruptionAnalysis = ImagePathHelper.detectPathCorruption(
        path.replace(/[0-9a-f]([0-9a-f])/g, '$1'), // Remove one char to simulate original
        `FileNotFoundException: ${path}: open failed: ENOENT (No such file or directory)`
      );
      
      console.log(`  Corruption detected: ${corruptionAnalysis.isCorrupted}`);
      console.log(`  Type: ${corruptionAnalysis.corruptionType}`);
      console.log(`  Suggestion: ${corruptionAnalysis.suggestedFix}`);
      
      // Test path fixing
      const fixedPath = FileValidator.attemptPathFix(path);
      if (fixedPath) {
        console.log(`  Fixed path: ${fixedPath}`);
      }
    }
  }

  /**
   * Test file validation
   */
  async testFileValidation(): Promise<void> {
    console.log('\n🧪 Testing file validation...');

    const testPaths = [
      'file:///data/user/0/com.anonymous.sortxport/cache/valid-image.jpg',
      'file:///invalid/path/missing.jpg',
      '/data/user/0/com.anonymous.sortxport/cache/test.png'
    ];

    for (const path of testPaths) {
      console.log(`\n🔍 Validating: ${path}`);
      
      const validation = await FileValidator.validateFile(path);
      console.log(`  Exists: ${validation.exists}`);
      console.log(`  Accessible: ${validation.accessible}`);
      console.log(`  Size: ${validation.size} bytes`);
      
      if (validation.error) {
        console.log(`  Error: ${validation.error}`);
      }
    }
  }

  /**
   * Test ML Kit processing with retry logic
   */
  async testProcessingWithRetry(): Promise<void> {
    console.log('\n🧪 Testing ML Kit processing with retry...');

    const testImagePath = 'file:///data/user/0/com.anonymous.sortxport/cache/test-image.jpg';

    // Test with simulated ML Kit labeling
    const mockLabeling = async (path: string) => {
      console.log(`Mock ML Kit labeling for: ${path}`);
      
      // Simulate potential failure on first attempt
      if (Math.random() < 0.3) {
        throw new Error('Simulated ML Kit failure');
      }
      
      return [
        { text: 'Test', confidence: 0.9 },
        { text: 'Image', confidence: 0.8 }
      ];
    };

    const result = await MLKitProcessingHelper.executeWithRetry(
      () => mockLabeling(testImagePath),
      testImagePath,
      'Image Labeling Test'
    );

    console.log(`  Success: ${result.success}`);
    console.log(`  Attempts: ${result.attempts}`);
    console.log(`  Total time: ${result.totalTime}ms`);
    
    if (result.data) {
      console.log(`  Labels: ${JSON.stringify(result.data)}`);
    }
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  /**
   * Test path conversion improvements
   */
  async testPathConversion(): Promise<void> {
    console.log('\n🧪 Testing path conversion...');

    const testPaths = [
      'file:///data/user/0/com.anonymous.sortxport/cache/normal-uuid.jpg',
      '/data/user/0/com.anonymous.sortxport/cache/no-prefix.jpg',
      'content://media/external/images/media/123',
      'asset://images/test.jpg'
    ];

    for (const path of testPaths) {
      console.log(`\n🔄 Converting: ${path}`);
      
      try {
        const converted = ImagePathHelper.convertToMLKitPath(path);
        console.log(`  Result: ${converted}`);
        
        const info = ImagePathHelper.getImageInfo(path);
        console.log(`  Platform: ${info.platform}`);
        console.log(`  Is local: ${ImagePathHelper.isLocalFile(path)}`);
        
      } catch (error) {
        console.log(`  Error: ${error}`);
      }
    }
  }

  /**
   * Run comprehensive diagnostics
   */
  async runComprehensiveTest(): Promise<void> {
    console.log('🚀 Starting comprehensive ML Kit pipeline test...\n');

    try {
      await this.testPathCorruption();
      await this.testFileValidation();
      await this.testProcessingWithRetry();
      await this.testPathConversion();
      
      console.log('\n✅ All tests completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Test suite failed:', error);
    }
  }

  /**
   * Test with real file paths from the logs
   */
  async testWithRealPaths(): Promise<void> {
    console.log('\n🧪 Testing with real problematic paths from logs...');

    const problematicPaths = [
      'file:///data/user/0/com.anonymous.sortxport/cache/baded505-8f36-4cfb-bb89-655a7a981574.JPEG',
      'file:///data/user/0/com.anonymous.sortxport/cache/5b6f138b-65ba-4765-af3c-868da25d8a25.JPEG',
      'file:///data/user/0/com.anonymous.sortxport/cache/1f96d7a1-efb3-401d-b89b-0b7c9836eeb0.JPEG',
      'file:///data/user/0/com.anonymous.sortxport/cache/885d6774-aa9f-4223-acfb-f4bfd0186220.JPEG'
    ];

    for (const path of problematicPaths) {
      console.log(`\n🔍 Testing path: ${path}`);
      
      // Test path preparation
      const pathResult = await MLKitProcessingHelper.prepareImagePath(path);
      console.log(`  Preparation success: ${pathResult.success}`);
      
      if (pathResult.convertedPath) {
        console.log(`  Converted path: ${pathResult.convertedPath}`);
      }
      
      if (pathResult.error) {
        console.log(`  Error: ${pathResult.error}`);
      }
    }
  }
}

// Export for use in app
export const runMLKitTests = async () => {
  const tester = new MLKitPipelineTest();
  await tester.runComprehensiveTest();
  await tester.testWithRealPaths();
};
