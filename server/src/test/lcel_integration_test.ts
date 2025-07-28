/**
 * LCEL Integration Test
 * 
 * Tests the core LCEL components we've implemented
 */

import { QueryChains } from '../agents/query/query_chains';
import { VisionAggregator, VisionResult } from '../tools/vision/vision_aggregator';
import { SearchRanker, RankingCriteria } from '../tools/search/search_ranker';
import { ContentAggregator, ContentSource } from '../tools/content/content_aggregator';

async function testQueryChains() {
  console.log('Testing QueryChains...');
  
  const queryChains = new QueryChains();
  
  // Test query analysis
  const analysisChain = queryChains.createQueryAnalysisChain();
  const result = await analysisChain.invoke({
    query: "Sort my photos by quality, newest first",
    userContext: { id: 'test-user' }
  });
  
  console.log('Query Analysis Result:', JSON.stringify(result, null, 2));
  
  // Test intent classification
  const intentChain = queryChains.createIntentClassificationChain();
  const intentResult = await intentChain.invoke({
    query: "Sort my photos by quality, newest first"
  });
  
  console.log('Intent Classification Result:', JSON.stringify(intentResult, null, 2));
}

async function testVisionAggregator() {
  console.log('Testing VisionAggregator...');
  
  const aggregator = new VisionAggregator();
  
  // Mock vision results from different models
  const visionResults: VisionResult[] = [
    {
      model: 'gpt-4o-vision',
      analysis: {
        objects: ['person', 'car', 'building'],
        scenes: ['urban', 'street'],
        emotions: ['happy', 'confident'],
        description: 'A person standing next to a car on a city street'
      },
      confidence: 0.9,
      processingTime: 1200
    },
    {
      model: 'claude-vision',
      analysis: {
        objects: ['person', 'vehicle', 'architecture'],
        scenes: ['city', 'outdoor'],
        emotions: ['positive', 'relaxed'],
        description: 'An individual near a vehicle in an urban environment'
      },
      confidence: 0.85,
      processingTime: 800
    }
  ];
  
  const aggregated = await aggregator.aggregateResults(visionResults);
  console.log('Vision Aggregation Result:', JSON.stringify(aggregated, null, 2));
}

async function testSearchRanker() {
  console.log('Testing SearchRanker...');
  
  const ranker = new SearchRanker();
  
  // Mock search results
  const searchResults = [
    {
      id: '1',
      title: 'Beautiful sunset photo',
      description: 'Amazing sunset over the ocean',
      createdAt: new Date('2024-01-15'),
      userRating: 4.8,
      viewCount: 150,
      technicalMetrics: { width: 1920, height: 1080, fileSize: 2048000, format: 'jpg' }
    },
    {
      id: '2', 
      title: 'City skyline at night',
      description: 'Stunning city lights and skyscrapers',
      createdAt: new Date('2024-01-10'),
      userRating: 4.2,
      viewCount: 89,
      technicalMetrics: { width: 1280, height: 720, fileSize: 1024000, format: 'jpg' }
    }
  ];
  
  const criteria: Partial<RankingCriteria> = {
    relevance: 0.5,
    quality: 0.3,
    recency: 0.2
  };
  
  const ranked = await ranker.rankResults(searchResults, criteria);
  console.log('Search Ranking Result:', JSON.stringify(ranked, null, 2));
}

async function testContentAggregator() {
  console.log('Testing ContentAggregator...');
  
  const aggregator = new ContentAggregator();
  
  // Mock content sources with some conflicts
  const sources: ContentSource[] = [
    {
      tool: 'vision_analyzer',
      data: {
        title: 'Beautiful Landscape',
        quality: 0.9,
        objects: ['mountain', 'lake', 'trees'],
        colors: ['blue', 'green', 'brown']
      },
      confidence: 0.85,
      timestamp: new Date()
    },
    {
      tool: 'metadata_extractor',
      data: {
        title: 'Beautiful Landscape Photo', // Slight conflict
        quality: 0.87, // Numeric conflict
        fileSize: 2048000,
        format: 'jpg'
      },
      confidence: 0.92,
      timestamp: new Date()
    }
  ];
  
  const aggregated = await aggregator.aggregateContent(sources);
  console.log('Content Aggregation Result:', JSON.stringify(aggregated, null, 2));
}

async function runIntegrationTests() {
  console.log('🚀 Starting LCEL Integration Tests...\n');
  
  try {
    await testQueryChains();
    console.log('✅ QueryChains test passed\n');
    
    await testVisionAggregator();
    console.log('✅ VisionAggregator test passed\n');
    
    await testSearchRanker();
    console.log('✅ SearchRanker test passed\n');
    
    await testContentAggregator();
    console.log('✅ ContentAggregator test passed\n');
    
    console.log('🎉 All LCEL integration tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Export for use in other test files
export { runIntegrationTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests().catch(console.error);
}
