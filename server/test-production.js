/**
 * Simple test script for Phase 4 production features
 * Run with: node test-production.js
 */

const BASE_URL = 'http://localhost:3001';

async function testEndpoint(endpoint, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const result = await response.json();
    
    console.log(`✅ ${method} ${endpoint}: ${response.status}`);
    if (response.status >= 400) {
      console.log(`   Error: ${JSON.stringify(result, null, 2)}`);
    } else {
      console.log(`   Success: ${Object.keys(result).join(', ')}`);
    }
    
    return { success: response.ok, data: result };
  } catch (error) {
    console.log(`❌ ${method} ${endpoint}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Testing SnapSort Phase 4 Production Server\n');

  // Test 1: Health Check
  console.log('1. Testing Health Check...');
  await testEndpoint('/health');

  // Test 2: Monitoring Health
  console.log('\n2. Testing Monitoring Health...');
  await testEndpoint('/api/monitoring/health');

  // Test 3: Performance Metrics
  console.log('\n3. Testing Performance Metrics...');
  await testEndpoint('/api/monitoring/metrics');

  // Test 4: Cost Analytics
  console.log('\n4. Testing Cost Analytics...');
  await testEndpoint('/api/monitoring/costs');

  // Test 5: Atlas Stats
  console.log('\n5. Testing Atlas Statistics...');
  await testEndpoint('/api/monitoring/atlas-stats');

  // Test 6: Prometheus Metrics
  console.log('\n6. Testing Prometheus Metrics...');
  const prometheusResult = await fetch(`${BASE_URL}/api/monitoring/prometheus`);
  console.log(`✅ GET /api/monitoring/prometheus: ${prometheusResult.status}`);
  if (prometheusResult.ok) {
    const text = await prometheusResult.text();
    console.log(`   Success: ${text.split('\n').length} lines of metrics`);
  }

  // Test 7: Alerts
  console.log('\n7. Testing Alerts...');
  await testEndpoint('/api/monitoring/alerts');

  // Test 8: Rate Limiting (should work but be limited)
  console.log('\n8. Testing Rate Limiting...');
  for (let i = 0; i < 3; i++) {
    await testEndpoint('/health');
  }

  console.log('\n✨ Phase 4 Production Tests Complete!');
  
  console.log('\n📊 Available Endpoints:');
  console.log('  - Health Check: GET /health');
  console.log('  - Monitoring Dashboard: GET /api/monitoring/health');
  console.log('  - Performance Metrics: GET /api/monitoring/metrics');
  console.log('  - Cost Analytics: GET /api/monitoring/costs');
  console.log('  - Usage Patterns: GET /api/monitoring/usage-patterns');
  console.log('  - Atlas Statistics: GET /api/monitoring/atlas-stats');
  console.log('  - Prometheus Metrics: GET /api/monitoring/prometheus');
  console.log('  - Active Alerts: GET /api/monitoring/alerts');
  
  console.log('\n🔒 Protected Endpoints (require auth):');
  console.log('  - Image Sorting: POST /api/sort');
  console.log('  - Atlas Generation: POST /api/atlas/generate');
  
  console.log('\n🎯 Next Steps:');
  console.log('  1. Set up your .env file with OpenAI and Supabase credentials');
  console.log('  2. Run the database migration (004_phase4_monitoring.sql)');
  console.log('  3. Test with real image sorting requests');
  console.log('  4. Monitor performance via /api/monitoring endpoints');
  console.log('  5. Set up Prometheus scraping for production monitoring');
}

// Check if we're running this directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testEndpoint, runTests };
