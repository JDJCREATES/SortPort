#!/usr/bin/env ts-node

/**
 * 🔬 ML KIT INTEGRATION DEBUGGING TOOL
 * 
 * This script helps debug why ML Kit data isn't making it to the virtual_image table.
 * It simulates the key generation and matching process to identify mismatches.
 */

// Mock data structures to simulate the issue
const mockMLKitResults = new Map([
  ['file:///storage/emulated/0/DCIM/Camera/IMG_001.jpg', {
    virtual_tags: ['outdoor', 'landscape', 'nature'],
    detected_objects: ['tree', 'sky', 'grass'],
    emotion_detected: [],
    activity_detected: ['walking'],
    detected_faces_count: 0,
    quality_score: 0.85,
    brightness_score: 0.72,
    blur_score: 0.91,
    aesthetic_score: 0.78,
    scene_type: 'outdoor',
    image_orientation: 'landscape',
    has_text: false,
    caption: 'A beautiful outdoor landscape',
    vision_summary: 'Natural outdoor scene with trees and grass',
    metadata: { source: 'mlkit-test' }
  }],
  ['file:///storage/emulated/0/DCIM/Camera/IMG_002.jpg', {
    virtual_tags: ['indoor', 'person', 'portrait'],
    detected_objects: ['person', 'face', 'clothing'],
    emotion_detected: ['happy'],
    activity_detected: ['standing'],
    detected_faces_count: 1,
    quality_score: 0.92,
    brightness_score: 0.68,
    blur_score: 0.88,
    aesthetic_score: 0.85,
    scene_type: 'portrait',
    image_orientation: 'portrait',
    has_text: false,
    caption: 'A person smiling indoors',
    vision_summary: 'Portrait of a happy person indoors',
    metadata: { source: 'mlkit-test' }
  }]
]);

console.log('🔬 ML Kit Integration Debugging Tool');
console.log('=====================================\n');

// Simulate bulk processor key generation
console.log('📦 STEP 1: Bulk Processor Key Generation');
console.log('----------------------------------------');

const batchSize = 10;
const batchIndex = 0;
const batchUris = Array.from(mockMLKitResults.keys());

const mappedMLKitData: Record<string, any> = {};

batchUris.forEach((originalUri, localIndex) => {
  const analysis = mockMLKitResults.get(originalUri);
  
  if (analysis) {
    // Calculate global index
    const globalIndex = (batchIndex * batchSize) + localIndex;
    
    // Generate keys (updated logic to match bulk processor)
    const primaryKey = `image_${globalIndex}`;                                   // Primary: global index
    const fallbackKey = `image_${localIndex}`;                                   // Fallback: local index  
    const awsKey = `batch-0-image-${globalIndex.toString().padStart(4, '0')}`;   // AWS format
    
    // Simplified mapping (just copy the analysis)
    const mappedData = analysis;
    
    // Store with simple, predictable keys (fewer duplicates = less confusion)
    mappedMLKitData[primaryKey] = mappedData;     // Global index (most reliable)
    mappedMLKitData[fallbackKey] = mappedData;    // Local index (backup)
    mappedMLKitData[awsKey] = mappedData;         // AWS S3 format (for matching AWS results)
    
    console.log(`✅ Image ${localIndex} (global: ${globalIndex})`);
    console.log(`   Primary: ${primaryKey}, Fallback: ${fallbackKey}, AWS: ${awsKey}`);
    console.log(`   URI: ${originalUri.substring(0, 50)}...`);
  }
});

console.log(`\n🔑 Total keys stored: ${Object.keys(mappedMLKitData).length}`);
console.log(`🔑 All keys:`, Object.keys(mappedMLKitData));

// Simulate AWS Rekognition results (what bulk-nsfw-status receives)
console.log('\n\n📊 STEP 2: AWS Rekognition Results Simulation');
console.log('---------------------------------------------');

const mockAWSResults = [
  {
    image_id: 'batch-0-image-0000.jpg',
    image_path: 'temp-bucket-123/input/batch-0-image-0000.jpg',
    isflagged: false,
    confidence: 95.2,
    moderation_labels: []
  },
  {
    image_id: 'batch-0-image-0001.jpg', 
    image_path: 'temp-bucket-123/input/batch-0-image-0001.jpg',
    isflagged: false,
    confidence: 98.1,
    moderation_labels: []
  }
];

console.log('AWS Results:', mockAWSResults.map((r, i) => ({ 
  index: i, 
  image_id: r.image_id, 
  image_path: r.image_path 
})));

// Simulate key matching (same logic as bulk-nsfw-status)
console.log('\n\n🔍 STEP 3: Key Matching Simulation');
console.log('----------------------------------');

function findMLKitDataForImage(jobMLKitData: any, result: any, index: number, jobId: string): any {
  // Updated to match simplified approach
  const keyStrategies = [
    `image_${index}`,                     // Direct index match (most reliable)
    `batch-0-image-${index.toString().padStart(4, '0')}`, // AWS S3 key format (without .jpg)
    result.image_id?.replace('.jpg', ''), // AWS result without extension
    result.image_id,                      // AWS result with extension
  ];

  console.log(`\n🔍 Looking for image ${index}:`);
  console.log(`   AWS result: ${JSON.stringify(result)}`);
  console.log(`   Trying simplified strategies: ${keyStrategies}`);

  for (const key of keyStrategies) {
    if (key && jobMLKitData[key]) {
      console.log(`   ✅ FOUND using key: ${key}`);
      return jobMLKitData[key];
    } else if (key) {
      console.log(`   ❌ Key '${key}' not found`);
    }
  }

  // Last resort: positional matching
  const keysByIndex = Object.keys(jobMLKitData);
  if (keysByIndex[index]) {
    const fallbackKey = keysByIndex[index];
    console.log(`   🔄 Using positional fallback: ${fallbackKey}`);
    return jobMLKitData[fallbackKey];
  }

  console.log(`   🚨 NO ML KIT DATA FOUND!`);
  return null;
}

// Test key matching for each AWS result
mockAWSResults.forEach((result, index) => {
  const mlkitData = findMLKitDataForImage(mappedMLKitData, result, index, 'test-job-123');
  if (mlkitData) {
    console.log(`   📊 ML Kit data found: ${Object.keys(mlkitData).length} fields`);
  }
});

console.log('\n\n🎯 DIAGNOSIS');
console.log('============');
console.log('1. Check if key generation matches key lookup strategies');
console.log('2. Verify batch indexing vs global indexing consistency');
console.log('3. Ensure AWS result format matches expected patterns');
console.log('4. Validate metadata storage and retrieval pipeline');

export {};
