/**
 * Quick test to verify Android file URI handling
 */

import { ImagePathHelper } from './utils/mlkit/helpers/imagePathHelper';

// Test cases for Android file URIs
const testCases = [
  'file:///storage/emulated/0/DCIM/Photo Editor/20250706_063320.jpg',
  'file:///storage/emulated/0/DCIM/Photo Editor/20250706_063239.jpg',
  '/storage/emulated/0/DCIM/Camera/IMG_001.jpg',
  'content://media/external/images/media/1234',
  'asset://images/test.jpg'
];

console.log('🧪 Testing Android file URI handling...');

testCases.forEach((testPath, index) => {
  try {
    console.log(`\n📝 Test ${index + 1}: ${testPath}`);
    const result = ImagePathHelper.convertToMLKitPath(testPath);
    console.log(`✅ Result: ${result}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
});

console.log('\n🎯 Testing complete!');
