/**
 * Component Unit Tests
 * 
 * Tests individual component logic without LCEL framework dependencies
 */

import { VisionAggregator, VisionResult } from '../tools/vision/vision_aggregator';
import { SearchRanker } from '../tools/search/search_ranker';
import { ContentAggregator, ContentSource } from '../tools/content/content_aggregator';

async function testVisionAggregatorLogic() {
  console.log('Testing VisionAggregator logic...');
  
  const aggregator = new VisionAggregator();
  
  // Test vision results aggregation
  const visionResults: VisionResult[] = [
    {
      model: 'gpt-4o-vision',
      analysis: {
        objects: [
          { name: 'person', confidence: 0.9 },
          { name: 'car', confidence: 0.8 },
          { name: 'building', confidence: 0.7 }
        ],
        scenes: [
          { name: 'urban', confidence: 0.85 },
          { name: 'street', confidence: 0.8 }
        ],
        description: 'A person standing next to a car on a city street',
        attributes: {
          lighting: 'natural',
          time_of_day: 'afternoon',
          weather: 'clear'
        }
      },
      confidence: 0.9,
      processingTime: 1200
    },
    {
      model: 'claude-vision',
      analysis: {
        objects: [
          { name: 'person', confidence: 0.87 },
          { name: 'vehicle', confidence: 0.82 }, // Similar to 'car'
          { name: 'architecture', confidence: 0.75 } // Similar to 'building'
        ],
        scenes: [
          { name: 'city', confidence: 0.88 }, // Similar to 'urban'
          { name: 'outdoor', confidence: 0.9 }
        ],
        description: 'An individual near a vehicle in an urban environment',
        attributes: {
          lighting: 'daylight', // Similar to 'natural'
          time_of_day: 'midday', // Similar to 'afternoon'
          weather: 'sunny' // Similar to 'clear'
        }
      },
      confidence: 0.85,
      processingTime: 800
    }
  ];
  
  try {
    const consensus = await aggregator.buildConsensus(visionResults);
    console.log('✅ VisionAggregator consensus building successful');
    console.log('Consensus objects:', consensus.objects?.slice(0, 3));
    console.log('Overall confidence:', consensus.overallConfidence);
    console.log('Model agreement:', consensus.modelAgreement);
    
    return true;
  } catch (error) {
    console.error('❌ VisionAggregator test failed:', error);
    return false;
  }
}

async function testSearchRankerLogic() {
  console.log('Testing SearchRanker logic...');
  
  const ranker = new SearchRanker();
  
  // Test search results ranking
  const searchResults = [
    {
      id: '1',
      title: 'Beautiful sunset photo',
      description: 'Amazing sunset over the ocean with vibrant colors',
      keywords: ['sunset', 'ocean', 'nature', 'landscape'],
      createdAt: '2024-01-15T10:00:00Z',
      userRating: 4.8,
      viewCount: 150,
      downloadCount: 45,
      likes: 23,
      technicalMetrics: { 
        width: 1920, 
        height: 1080, 
        fileSize: 2048000, 
        format: 'jpg' 
      },
      metadata: {
        title: 'Sunset Ocean View',
        description: 'Professional sunset photography',
        category: 'landscape',
        tags: ['sunset', 'ocean']
      }
    },
    {
      id: '2', 
      title: 'City skyline at night',
      description: 'Stunning city lights and skyscrapers in the evening',
      keywords: ['city', 'night', 'urban', 'skyline'],
      createdAt: '2024-01-10T20:00:00Z',
      userRating: 4.2,
      viewCount: 89,
      downloadCount: 12,
      likes: 8,
      technicalMetrics: { 
        width: 1280, 
        height: 720, 
        fileSize: 1024000, 
        format: 'jpg' 
      },
      metadata: {
        title: 'Night Cityscape',
        description: 'Urban night photography',
        category: 'urban',
        tags: ['city', 'night']
      }
    },
    {
      id: '3',
      title: 'Mountain landscape',
      description: 'Peaceful mountain view with morning mist',
      keywords: ['mountain', 'landscape', 'nature', 'peaceful'],
      createdAt: '2024-01-20T08:00:00Z',
      userRating: 4.6,
      viewCount: 210,
      downloadCount: 67,
      likes: 45,
      technicalMetrics: { 
        width: 2560, 
        height: 1440, 
        fileSize: 3072000, 
        format: 'png' 
      },
      metadata: {
        title: 'Mountain Vista',
        description: 'High resolution mountain photography',
        category: 'landscape',
        tags: ['mountain', 'nature']
      }
    }
  ];
  
  try {
    const ranked = await ranker.rankResults(searchResults, {
      relevance: 0.4,
      quality: 0.3,
      recency: 0.15,
      popularity: 0.1,
      personalization: 0.05
    });
    
    console.log('✅ SearchRanker ranking successful');
    console.log('Top ranked items:');
    ranked.slice(0, 3).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.item.title} (Score: ${item.finalScore.toFixed(3)})`);
      console.log(`     Relevance: ${item.scores.relevance.toFixed(3)}, Quality: ${item.scores.quality.toFixed(3)}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ SearchRanker test failed:', error);
    return false;
  }
}

async function testContentAggregatorLogic() {
  console.log('Testing ContentAggregator logic...');
  
  const aggregator = new ContentAggregator();
  
  // Test content aggregation with conflicts
  const sources: ContentSource[] = [
    {
      tool: 'vision_analyzer',
      data: {
        title: 'Beautiful Landscape',
        quality_score: 0.9, // Will conflict with metadata
        resolution: { width: 1920, height: 1080 },
        objects: ['mountain', 'lake', 'trees'],
        colors: ['blue', 'green', 'brown'],
        scene_type: 'landscape',
        lighting: 'natural'
      },
      confidence: 0.85,
      timestamp: new Date('2024-01-15T10:00:00Z')
    },
    {
      tool: 'metadata_extractor',
      data: {
        title: 'Beautiful Landscape Photo', // Text conflict
        quality_score: 0.87, // Numeric conflict  
        resolution: { width: 1920, height: 1080 }, // Same - no conflict
        file_size: 2048000,
        format: 'jpg',
        created_date: '2024-01-15',
        camera_settings: {
          iso: 100,
          aperture: 'f/8',
          shutter_speed: '1/125'
        }
      },
      confidence: 0.92,
      timestamp: new Date('2024-01-15T10:01:00Z')
    },
    {
      tool: 'ai_classifier',
      data: {
        title: 'Landscape Photography', // Another text conflict
        quality_score: 0.93, // Another numeric conflict
        category: 'landscape',
        style: 'nature_photography',
        mood: 'peaceful',
        objects: ['mountain', 'water', 'vegetation'], // Similar to first source
        technical_quality: 'high'
      },
      confidence: 0.78,
      timestamp: new Date('2024-01-15T10:02:00Z')
    }
  ];
  
  try {
    const aggregated = await aggregator.aggregateContent(sources);
    
    console.log('✅ ContentAggregator aggregation successful');
    console.log('Conflicts detected:', aggregated.conflicts.length);
    console.log('Overall confidence:', aggregated.confidence.toFixed(3));
    console.log('Merged title:', aggregated.mergedData.title);
    console.log('Resolved quality score:', aggregated.mergedData.quality_score);
    
    // Test conflict resolution specifically
    if (aggregated.conflicts.length > 0) {
      const resolutions = await aggregator.resolveConflicts(aggregated.conflicts);
      console.log('Conflict resolutions:', Object.keys(resolutions).length);
    }
    
    return true;
  } catch (error) {
    console.error('❌ ContentAggregator test failed:', error);
    return false;
  }
}

async function runComponentTests() {
  console.log('🧪 Starting Component Unit Tests...\n');
  
  const results = {
    visionAggregator: false,
    searchRanker: false,
    contentAggregator: false
  };
  
  try {
    results.visionAggregator = await testVisionAggregatorLogic();
    console.log('');
    
    results.searchRanker = await testSearchRankerLogic();
    console.log('');
    
    results.contentAggregator = await testContentAggregatorLogic();
    console.log('');
    
    const passedTests = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All component tests passed successfully!');
      return true;
    } else {
      console.log('⚠️  Some tests failed. Check the output above for details.');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    return false;
  }
}

// Export for use in other test files
export { runComponentTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runComponentTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
