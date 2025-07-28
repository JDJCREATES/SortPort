# SnapSort LangChain Server

Production-ready Express server for natural language image sorting using LangChain and OpenAI.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your actual values

# Build the project
npm run build

# Start development server
npm run dev

# Start production server
npm start
```

## 🔗 Frontend Integration Guide

### Overview
This server provides intelligent image sorting through natural language queries. It integrates seamlessly with existing AWS Rekognition workflows and extends functionality with advanced AI-powered sorting capabilities.

### Integration Workflow

#### 1. Image Upload & Processing Pipeline

When users select images from your source folder picker:

```javascript
// Your existing flow enhanced with SnapSort integration
async function processUploadedImages(selectedFiles, userId) {
  const processedImages = [];
  
  for (const file of selectedFiles) {
    // 1. Compress image (your existing step)
    const compressedImage = await compressImage(file);
    
    // 2. AWS Rekognition analysis (your existing step)
    const rekognitionData = await analyzeWithRekognition(compressedImage);
    
    // 3. Create virtual_image record for SnapSort
    const virtualImage = await createVirtualImageRecord({
      file: compressedImage,
      userId,
      rekognitionData,
      originalFile: file
    });
    
    processedImages.push(virtualImage);
  }
  
  return processedImages;
}
```

#### 2. Virtual Image Record Creation

Here's how to properly populate the `virtual_image` table:

```javascript
async function createVirtualImageRecord({ file, userId, rekognitionData, originalFile }) {
  // Generate unique hash for deduplication
  const fileHash = await generateFileHash(file);
  
  // Extract EXIF data if available
  const exifData = await extractExifData(originalFile);
  
  // Process AWS Rekognition data
  const processedRek = processRekognitionData(rekognitionData);
  
  const virtualImageData = {
    // Required fields
    id: generateUUID(),
    user_id: userId,
    
    // File paths and identification
    original_path: await uploadToStorage(file), // Supabase storage path
    original_name: originalFile.name,
    hash: fileHash,
    thumbnail: await generateThumbnail(file), // Create and upload thumbnail
    
    // Virtual/AI fields (initially null, populated by SnapSort)
    virtual_name: null,
    virtual_tags: null,
    virtual_albums: undefined,
    virtual_description: null,
    
    // NSFW detection from your existing workflow
    nsfw_score: processedRek.nsfwScore,
    isflagged: processedRek.nsfwScore > 0.8, // Your threshold
    
    // AI analysis fields (initially null)
    caption: null,
    vision_summary: null,
    vision_sorted: false,
    embedding: null,
    
    // Metadata from various sources
    metadata: {
      originalSize: originalFile.size,
      compressedSize: file.size,
      compressionRatio: originalFile.size / file.size,
      rekognition: processedRek.rawData, // Store full Rekognition response
      processingTimestamp: new Date().toISOString()
    },
    
    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sortorder: null,
    
    // EXIF-based dates
    date_taken: exifData?.dateTaken || null,
    date_modified: exifData?.dateModified || null,
    date_imported: new Date().toISOString(),
    
    // Location data from EXIF
    location_lat: exifData?.gps?.latitude || null,
    location_lng: exifData?.gps?.longitude || null,
    location_name: null, // Populated later via reverse geocoding
    location_country: null,
    location_city: null,
    
    // AWS Rekognition extracted data
    dominant_colors: processedRek.dominantColors || null,
    detected_objects: processedRek.labels || null,
    detected_faces_count: processedRek.faceCount || 0,
    scene_type: processedRek.sceneType || null,
    
    // Quality metrics (can be computed or from Rekognition)
    brightness_score: processedRek.brightness || null,
    blur_score: processedRek.sharpness || null,
    quality_score: processedRek.quality || null,
    aesthetic_score: null, // Computed by SnapSort vision analysis
    
    // Advanced analysis (from Rekognition)
    emotion_detected: processedRek.emotions || null,
    activity_detected: processedRek.activities || null,
    image_orientation: getImageOrientation(exifData) || null
  };
  
  // Insert into Supabase
  const { data, error } = await supabase
    .from('virtual_image')
    .insert(virtualImageData)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
```

#### 3. AWS Rekognition Data Processing

Transform your Rekognition data for SnapSort compatibility:

```javascript
function processRekognitionData(rekognitionResponse) {
  return {
    // NSFW detection
    nsfwScore: rekognitionResponse.ModerationLabels?.find(
      label => ['Explicit Nudity', 'Suggestive'].includes(label.Name)
    )?.Confidence / 100 || 0,
    
    // Object detection
    labels: rekognitionResponse.Labels?.map(label => label.Name) || [],
    
    // Face detection
    faceCount: rekognitionResponse.FaceDetails?.length || 0,
    
    // Scene analysis
    sceneType: rekognitionResponse.Labels?.find(
      label => ['Indoor', 'Outdoor', 'Beach', 'Cityscape'].includes(label.Name)
    )?.Name || null,
    
    // Colors
    dominantColors: rekognitionResponse.ImageProperties?.DominantColors?.map(
      color => `rgb(${color.Red}, ${color.Green}, ${color.Blue})`
    ) || null,
    
    // Quality metrics
    brightness: rekognitionResponse.ImageProperties?.Quality?.Brightness || null,
    sharpness: rekognitionResponse.ImageProperties?.Quality?.Sharpness || null,
    quality: (
      (rekognitionResponse.ImageProperties?.Quality?.Brightness || 0) +
      (rekognitionResponse.ImageProperties?.Quality?.Sharpness || 0)
    ) / 2,
    
    // Emotions (from face analysis)
    emotions: rekognitionResponse.FaceDetails?.flatMap(
      face => face.Emotions?.map(emotion => emotion.Type)
    ).filter(Boolean) || null,
    
    // Activities
    activities: rekognitionResponse.Labels?.filter(
      label => ['Sport', 'Exercise', 'Dance', 'Reading'].some(
        activity => label.Name.includes(activity)
      )
    ).map(label => label.Name) || null,
    
    // Store raw data for future use
    rawData: rekognitionResponse
  };
}
```

#### 4. Using SnapSort API for Intelligent Sorting

Once images are in the database, use SnapSort for advanced sorting:

```javascript
// Basic sorting
async function sortImages(query, userId, imageIds = null) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/sort`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      userId,
      imageIds, // Optional: specific images to sort
      sortType: 'custom',
      useVision: false, // Start with false to save credits
      maxResults: 100
    })
  });
  
  const result = await response.json();
  return result.data;
}

// Vision-enhanced sorting (uses more credits but more accurate)
async function sortImagesWithVision(query, userId, imageIds = null) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/sort`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      userId,
      imageIds,
      sortType: 'custom',
      useVision: true, // Enable vision analysis
      maxResults: 50 // Fewer images due to higher cost
    })
  });
  
  const result = await response.json();
  return result.data;
}

// Specialized sorting functions
async function sortByTone(userId, imageIds) {
  return fetch(`${SNAPSORT_SERVER}/api/sort/tone`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId, imageIds })
  });
}

async function pickThumbnails(userId, imageIds, count = 5) {
  return fetch(`${SNAPSORT_SERVER}/api/sort/thumbnails`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      userId, 
      imageIds, 
      maxResults: count,
      useVision: true // Thumbnails require vision analysis
    })
  });
}
```

#### 5. Frontend UI Integration Examples

```jsx
// React component example
function ImageSortingInterface({ images, userId }) {
  const [sortQuery, setSortQuery] = useState('');
  const [sortedImages, setSortedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const handleSort = async () => {
    setLoading(true);
    try {
      const result = await sortImages(sortQuery, userId, images.map(img => img.id));
      setSortedImages(result.sortedImages);
    } catch (error) {
      console.error('Sort failed:', error);
    }
    setLoading(false);
  };
  
  return (
    <div>
      <div className="sort-controls">
        <input
          type="text"
          placeholder="Sort by... (e.g., 'happiest moments', 'outdoor photos')"
          value={sortQuery}
          onChange={(e) => setSortQuery(e.target.value)}
        />
        <button onClick={handleSort} disabled={loading}>
          {loading ? 'Sorting...' : 'Sort Images'}
        </button>
      </div>
      
      <div className="image-grid">
        {sortedImages.map(image => (
          <div key={image.id} className="image-card">
            <img src={image.thumbnail} alt={image.virtualName || image.originalName} />
            <p>{image.reasoning}</p>
            <span>Confidence: {(image.confidence * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 6. Error Handling and Best Practices

```javascript
// Robust error handling
async function safeApiCall(apiFunction, fallbackValue = null) {
  try {
    return await apiFunction();
  } catch (error) {
    if (error.response?.status === 429) {
      // Rate limited - wait and retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      return await apiFunction();
    } else if (error.response?.status === 402) {
      // Insufficient credits
      throw new Error('Insufficient credits for this operation');
    } else if (error.response?.status === 401) {
      // Auth error
      throw new Error('Authentication required');
    }
    
    console.error('API call failed:', error);
    return fallbackValue;
  }
}

// Credit management
async function checkCreditsBeforeSorting(requiredCredits) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/user/credits`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const data = await response.json();
  
  if (data.credits < requiredCredits) {
    throw new Error(`Insufficient credits. Required: ${requiredCredits}, Available: ${data.credits}`);
  }
  
  return data.credits;
}
```

### API Response Structure

All API responses follow this structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

}

interface SortResponse {
  sortedImages: SortedImage[];
  reasoning: string;
  confidence: number;
  usedVision: boolean;
  processingTime: number;
  cost: {
    credits: number;
    breakdown: {
      embedding: number;
      vision: number;
      processing: number;
    };
  };
}
```

## 📁 Project Structure

```
└── 📁src
    └── 📁agents
        └── 📁query
            ├── query_chains.ts
            ├── query_planner.ts
            ├── query_processor.ts
        └── 📁task
            ├── task_agent.ts
            ├── task_chains.ts
            ├── task_prompts.ts
        └── 📁tool
            ├── tool_agent.ts
            ├── tool_chain_supervisor.ts
            ├── tool_chains.ts
            ├── tool_prompts.ts
    └── 📁chains
        └── 📁io
            ├── input_processor.ts
            ├── output_processor.ts
            ├── parser_suite.ts
            ├── validation_suite.ts
        └── 📁utils
            ├── chain_validator.ts
        ├── chain_composer.ts
        ├── chain_engine.ts
        ├── chain_validator.ts
        ├── runnable_utils.ts
    └── 📁core
        └── 📁lcel
            └── 📁utils
                ├── concurrency_manager.ts
                ├── condition_evaluator.ts
            ├── runnable_assign.ts
            ├── runnable_branch.ts
            ├── runnable_lambda.ts
            ├── runnable_map_fixed.ts
            ├── runnable_map.ts
            ├── runnable_parallel.ts
            ├── runnable_sequence.ts
        ├── agent_coordinator.ts
        ├── agent_router.ts
    └── 📁integration
        ├── chain_adapter.ts
        ├── lcel_api_bridge.ts
        ├── system_integration.ts
    └── 📁lcel
        ├── index.ts
    └── 📁lib
        └── 📁analytics
            ├── costAnalyzer.ts
        └── 📁imageProcessing
            ├── atlasGenerator.ts
        └── 📁integration
            ├── productionAtlasService.ts
        └── 📁langchain
            └── 📁chains
                ├── customQuery.ts
                ├── groupByScene.ts
                ├── pickThumbnails.ts
                ├── smartAlbums.ts
                ├── sortByTone.ts
            └── 📁prompts
                ├── sorting.ts
            └── 📁utils
                ├── atlas.ts
                ├── cache.ts
                ├── embeddings.ts
            ├── index.ts
        └── 📁monitoring
            ├── execution_monitor.ts
            ├── metricsCollector.ts
            ├── performance_tracker.ts
        └── 📁security
            ├── productionMiddleware.ts
        └── 📁supabase
            ├── client.ts
            ├── queries.ts
        └── 📁vision
            ├── gptVisionAnalyzer.ts
    └── 📁middleware
        ├── auth.ts
        ├── errorHandler.ts
        ├── rateLimiter.ts
    └── 📁routes
        ├── atlas.ts
        ├── health.ts
        ├── lcel_sort.ts
        ├── monitoring.ts
        ├── sort.ts
    └── 📁test
        ├── api_integration_test.ts
        ├── component_unit_test.ts
        ├── lcel_integration_test.ts
    └── 📁tools
        └── 📁content
            ├── aggregation_chains.ts
            ├── content_aggregator.ts
        └── 📁organization
            ├── grouping_chains.ts
            ├── smart_grouper.ts
        └── 📁safety
            ├── safety_chains.ts
            ├── safety_filter.ts
        └── 📁search
            ├── image_sort.ts
            ├── ranking_chains.ts
            ├── search_ranker.ts
        └── 📁vision
            ├── vision_aggregator.ts
            ├── vision_analysis.ts
            ├── vision_chains.ts
        ├── tool_registry.ts
    └── 📁types
        ├── api.ts
        ├── sorting.ts
    └── index.ts
```



## 🔧 Environment Variables

Required environment variables (see `.env.example`):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for server operations
- `SUPABASE_ANON_KEY` - Anonymous key for auth verification
- `OPENAI_API_KEY` - OpenAI API key for LangChain operations

## 🛡️ Security Features

- **Helmet.js** - Security headers
- **CORS** - Configurable cross-origin requests
- **Rate Limiting** - Request throttling per user/IP
- **Authentication** - Supabase JWT verification
- **Input Validation** - Zod schema validation
- **Error Handling** - Structured error responses

## 📊 API Endpoints

### Health Checks
- `GET /health` - Basic health status
- `GET /health/detailed` - Detailed system health

### Sorting (Protected)
- `POST /api/sort` - General natural language sorting
- `POST /api/sort/tone` - Sort by emotional tone
- `POST /api/sort/scene` - Sort by scene type
- `POST /api/sort/thumbnails` - Pick best thumbnails (uses vision)
- `POST /api/sort/batch` - Batch multiple sort operations

### Atlas Management (Protected)
- `POST /api/atlas/generate` - Generate 9-image atlas for vision analysis
- `GET /api/atlas/cache/:key` - Retrieve cached atlas
- `GET /api/atlas/list` - List user's atlases
- `DELETE /api/atlas/:key` - Delete atlas
- `GET /api/atlas/stats` - Atlas usage statistics

## 🎯 Authentication

All protected endpoints require a Bearer token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
     -H "Content-Type: application/json" \
     -d '{"query": "sort by happiness", "userId": "user-id"}' \
     http://localhost:3001/api/sort
```

## 💳 Credit System

Operations consume credits based on complexity:
- Basic sorting: 1 credit
- Vision analysis: 2-3 credits
- Atlas generation: 2 credits

The server automatically:
- Validates sufficient credits before processing
- Deducts credits on successful completion
- Provides detailed cost breakdowns

## 🔄 Rate Limiting

Multiple rate limiters protect the API:
- **General**: 100 requests per 15 minutes
- **Strict**: 10 requests per minute (for sorting)
- **Vision**: 5 requests per 5 minutes (for vision operations)

## 🔍 Monitoring & Analytics

The server provides comprehensive monitoring capabilities:

### Performance Metrics
- Request/response times
- Success/error rates  
- Credit consumption patterns
- Cache hit rates

### Cost Analytics
- Per-user cost breakdowns
- Service-level cost tracking
- Optimization savings measurement
- Cost forecasting

### Usage Patterns
- Peak usage identification
- Operation preference analysis
- Efficiency scoring
- Trend analysis

Access monitoring data via:
```bash
GET /api/monitoring/metrics
GET /api/monitoring/costs
GET /api/monitoring/usage
```

## 🧪 Development & Testing

```bash
# Development with auto-reload
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Production build
npm run build

# Production server
npm start

# Test specific endpoint
node test-production.js
```

### Development Tips
- Use `useVision: false` during development to save credits
- Monitor credit usage with `/api/user/credits`
- Check rate limits in response headers
- Use `/health/detailed` for debugging connection issues

## 🚀 Production Deployment

### Prerequisites
- Node.js 18+ 
- Supabase project with proper RLS policies
- OpenAI API access
- SSL certificate for HTTPS

### Deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Rate limiting configured appropriately
- [ ] CORS origins set correctly
- [ ] Monitoring endpoints secured
- [ ] Credit system initialized
- [ ] SSL/TLS enabled

### Performance Optimization  
- Enable response compression
- Configure caching headers
- Use connection pooling
- Monitor memory usage
- Set up log rotation

## 🔗 Integration with Existing Systems

### AWS Rekognition Migration
If you're already using AWS Rekognition:

1. **Keep existing NSFW detection** - SnapSort enhances rather than replaces
2. **Migrate metadata gradually** - Use the provided mapping functions
3. **Leverage existing thumbnails** - SnapSort can use your current thumbnail generation
4. **Preserve file organization** - Virtual albums work alongside existing structures

### Database Integration
- SnapSort works with your existing `virtual_image` table
- No schema changes required for basic functionality  
- Additional columns enhance capabilities but aren't mandatory
- Full backward compatibility with existing queries

### Frontend Integration Patterns
- **Progressive Enhancement** - Add SnapSort features to existing UI
- **Hybrid Approach** - Use AWS for detection, SnapSort for sorting
- **Gradual Migration** - Move users to enhanced experience over time

## 🔧 Troubleshooting

### Common Issues

**Authentication Failures**
```bash
# Check token validity
curl -H "Authorization: Bearer ${TOKEN}" ${SERVER}/health

# Verify user exists in Supabase
# Check RLS policies are configured
```

**Rate Limiting**
```bash
# Check current limits
curl -I ${SERVER}/api/sort

# Wait for reset or implement exponential backoff
```

**Insufficient Credits**
```bash
# Check balance
curl -H "Authorization: Bearer ${TOKEN}" ${SERVER}/api/user/credits

# Top up credits or optimize usage
```

**Performance Issues**
- Monitor `/health/detailed` for system status
- Check OpenAI API status
- Verify database connection pool settings
- Review rate limiting configuration

## 📈 Next Steps & Roadmap

### Immediate Improvements
- [ ] Batch processing optimization
- [ ] Advanced caching strategies  
- [ ] Custom model fine-tuning
- [ ] Mobile-optimized responses

### Future Features
- [ ] Video content analysis
- [ ] Real-time collaborative sorting
- [ ] Custom AI model training
- [ ] Advanced analytics dashboard

---

*For additional support, implementation questions, or feature requests, please refer to the integration examples above or check the `/health/detailed` endpoint for system status.*

