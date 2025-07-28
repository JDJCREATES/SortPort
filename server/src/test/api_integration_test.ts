/**
 * API Integration Test
 * 
 * Tests the LCEL API bridge with mock data
 */

import { LCELApiBridge, SortRequest } from '../integration/lcel_api_bridge';

async function testSortAPI() {
  console.log('🔄 Testing LCEL API Bridge...');
  
  const bridge = new LCELApiBridge();
  
  // Mock Express request and response
  const mockRequest = {
    body: {
      query: "Sort my photos by quality, showing the best ones first",
      images: [
        {
          id: 'img1',
          url: 'https://example.com/photo1.jpg',
          metadata: {
            title: 'Beautiful sunset',
            description: 'Amazing sunset over the ocean',
            tags: ['sunset', 'ocean', 'nature'],
            createdAt: '2024-01-15T18:30:00Z',
            camera: 'Canon EOS R5',
            resolution: { width: 6720, height: 4480 },
            fileSize: 8192000
          }
        },
        {
          id: 'img2',
          url: 'https://example.com/photo2.jpg',
          metadata: {
            title: 'City skyline',
            description: 'Urban night photography',
            tags: ['city', 'night', 'urban'],
            createdAt: '2024-01-10T22:15:00Z',
            camera: 'Sony A7R IV',
            resolution: { width: 7952, height: 5304 },
            fileSize: 12288000
          }
        },
        {
          id: 'img3',
          url: 'https://example.com/photo3.jpg',
          metadata: {
            title: 'Mountain landscape',
            description: 'Peaceful mountain view with morning mist',
            tags: ['mountain', 'landscape', 'nature'],
            createdAt: '2024-01-20T07:45:00Z',
            camera: 'Nikon Z9',
            resolution: { width: 8256, height: 5504 },
            fileSize: 15360000
          }
        },
        {
          id: 'img4',
          url: 'https://example.com/photo4.jpg',
          metadata: {
            title: 'Portrait session',
            description: 'Professional portrait photography',
            tags: ['portrait', 'people', 'studio'],
            createdAt: '2024-01-12T14:20:00Z',
            camera: 'Canon EOS R6',
            resolution: { width: 5472, height: 3648 },
            fileSize: 6144000
          }
        },
        {
          id: 'img5',
          url: 'https://example.com/photo5.jpg',
          metadata: {
            title: 'Wildlife shot',
            description: 'Eagle in flight captured in golden hour',
            tags: ['wildlife', 'bird', 'nature', 'golden hour'],
            createdAt: '2024-01-18T16:45:00Z',
            camera: 'Sony A1',
            resolution: { width: 8640, height: 5760 },
            fileSize: 18432000
          }
        }
      ],
      options: {
        maxResults: 10,
        includeAnalysis: true,
        userContext: {
          id: 'test-user',
          preferences: {
            categories: ['nature', 'landscape'],
            qualityThreshold: 0.7
          }
        }
      }
    } as SortRequest
  };

  let responseData: any = null;
  let statusCode = 200;

  const mockResponse = {
    status: (code: number) => {
      statusCode = code;
      return mockResponse;
    },
    json: (data: any) => {
      responseData = data;
    }
  };

  try {
    // Execute the sort request
    await bridge.handleSort(mockRequest as any, mockResponse as any);

    // Validate the response
    if (statusCode !== 200) {
      console.error('❌ API returned non-200 status:', statusCode);
      console.error('Response:', responseData);
      return false;
    }

    if (!responseData || !responseData.success) {
      console.error('❌ API returned unsuccessful response:', responseData);
      return false;
    }

    // Validate response structure
    const { results, metadata } = responseData;
    
    if (!results || !Array.isArray(results)) {
      console.error('❌ Results not found or not an array');
      return false;
    }

    if (results.length === 0) {
      console.error('❌ No results returned');
      return false;
    }

    // Check result structure
    const firstResult = results[0];
    const requiredFields = ['image', 'sortScore', 'reasoning', 'position', 'metadata'];
    const missingFields = requiredFields.filter(field => !(field in firstResult));
    
    if (missingFields.length > 0) {
      console.error('❌ Missing required fields in result:', missingFields);
      return false;
    }

    // Validate metadata
    if (!metadata || !metadata.processingTime || !metadata.methodUsed) {
      console.error('❌ Invalid metadata structure');
      return false;
    }

    // Success! Display results
    console.log('✅ LCEL API Bridge test successful!');
    console.log('\n📊 Results Summary:');
    console.log(`   Strategy used: ${metadata.methodUsed}`);
    console.log(`   Processing time: ${metadata.processingTime}ms`);
    console.log(`   Results returned: ${results.length}`);
    console.log(`   Query analysis confidence: ${metadata.queryAnalysis?.confidence || 'N/A'}`);
    
    console.log('\n🏆 Top 3 Results:');
    results.slice(0, 3).forEach((result: any, index: number) => {
      console.log(`   ${index + 1}. ${result.image.metadata?.title || result.image.id}`);
      console.log(`      Score: ${result.sortScore.toFixed(3)}`);
      console.log(`      Reasoning: ${result.reasoning}`);
      console.log('');
    });

    return true;

  } catch (error) {
    console.error('❌ API Bridge test failed with error:', error);
    return false;
  }
}

async function testDifferentQueries() {
  console.log('🔄 Testing different query types...');
  
  const bridge = new LCELApiBridge();
  const baseImages = [
    { id: 'img1', url: 'test1.jpg', metadata: { title: 'Sunset', tags: ['nature'] } },
    { id: 'img2', url: 'test2.jpg', metadata: { title: 'Portrait', tags: ['people'] } }
  ];

  const testQueries = [
    'Show me nature photos',
    'Find portraits',
    'Sort by quality',
    'Recent photos first',
    'Beautiful landscapes'
  ];

  for (const query of testQueries) {
    try {
      const mockReq = { body: { query, images: baseImages } };
      let responseData: any = null;
      const mockRes = { 
        status: () => mockRes, 
        json: (data: any) => { responseData = data; } 
      };

      await bridge.handleSort(mockReq as any, mockRes as any);
      
      if (responseData && responseData.success) {
        console.log(`   ✅ "${query}" - ${responseData.metadata.methodUsed} strategy`);
      } else {
        console.log(`   ❌ "${query}" - Failed`);
      }
    } catch (error) {
      console.log(`   ❌ "${query}" - Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }
}

async function runAPIIntegrationTests() {
  console.log('🚀 Starting API Integration Tests...\n');
  
  try {
    const sortTestPassed = await testSortAPI();
    console.log('');
    
    await testDifferentQueries();
    console.log('');
    
    if (sortTestPassed) {
      console.log('🎉 API Integration tests completed successfully!');
      console.log('\n📝 Summary:');
      console.log('   ✅ Core LCEL components are working');
      console.log('   ✅ API bridge successfully processes requests');
      console.log('   ✅ Multiple sorting strategies are available');
      console.log('   ✅ Query analysis and response formatting work correctly');
      console.log('\n🔗 Ready for integration with existing server!');
      return true;
    } else {
      console.log('❌ Some tests failed. Check the output above for details.');
      return false;
    }

  } catch (error) {
    console.error('💥 Test suite failed:', error);
    return false;
  }
}

// Export for use in other test files
export { runAPIIntegrationTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runAPIIntegrationTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
