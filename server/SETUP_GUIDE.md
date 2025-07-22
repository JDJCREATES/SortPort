# SnapSort Phase 4 Production Server Setup Guide

This guide will help you set up and test the production-optimized SnapSort LangChain server with all Phase 4 features.

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env` file in the `server` directory:

```bash
# Core Configuration
NODE_ENV=development
PORT=3001

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Supabase Configuration  
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: Redis for distributed caching (leave empty to use local cache)
REDIS_URL=redis://localhost:6379

# CORS Origins (comma-separated)
CORS_ORIGINS=http://localhost:8081,https://snapsort.app

# Production Security (optional)
JWT_SECRET=your_jwt_secret_here
ATLAS_CACHE_TTL=3600
MAX_IMAGES_PER_REQUEST=50
DAILY_COST_LIMIT=100
```

### 2. Database Setup

Run the migration to create monitoring tables:

```bash
# If using Supabase CLI
supabase db push

# Or manually execute the SQL file in your Supabase dashboard
# File: supabase/migrations/004_phase4_monitoring.sql
```

### 3. Install Dependencies

```bash
cd server
npm install
```

### 4. Build and Start

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 🔍 Testing the Implementation

### Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-22T...",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "storage": "healthy"
  }
}
```

### Monitoring Dashboard

Access the monitoring endpoints:

- **System Health**: `GET /api/monitoring/health`
- **Performance Metrics**: `GET /api/monitoring/metrics`
- **Cost Analytics**: `GET /api/monitoring/costs`
- **Prometheus Metrics**: `GET /api/monitoring/prometheus`

### Test Atlas Generation

```bash
curl -X POST http://localhost:3001/api/atlas/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "images": [
      {"id": "1", "url": "https://example.com/image1.jpg"},
      {"id": "2", "url": "https://example.com/image2.jpg"},
      {"id": "3", "url": "https://example.com/image3.jpg"}
    ],
    "options": {
      "quality": 85,
      "format": "webp"
    }
  }'
```

### Test Image Sorting

```bash
curl -X POST http://localhost:3001/api/sort \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "Sort these images by mood, happiest first",
    "imageIds": ["img1", "img2", "img3"],
    "sortType": "custom",
    "useVision": true,
    "maxResults": 10
  }'
```

## 📊 Phase 4 Features Overview

### 🎯 Real Image Processing
- **Sharp-based atlas generation** with WebP/JPEG optimization
- **3x3 grid layouts** with position mapping (A1-C3)
- **Automatic compression** and quality optimization
- **Supabase storage integration** with caching

### 🤖 GPT Vision Integration
- **GPT-4o Vision API** with structured output parsing
- **Cost-optimized analysis** using atlas batching (89% savings)
- **Advanced prompt engineering** for accurate results
- **Retry logic** with exponential backoff

### 📈 Performance Monitoring
- **Prometheus metrics** for external monitoring
- **Real-time performance tracking**
- **User behavior analytics**
- **System health monitoring**
- **Custom dashboard endpoints**

### 💰 Cost Analytics
- **Comprehensive cost tracking** across all services
- **Usage pattern analysis** and optimization recommendations
- **Budget alerts** and cost projections
- **ROI calculations** for atlas optimization

### 🔒 Production Security
- **Multi-tier rate limiting** (global, user, operation-specific)
- **DDoS protection** with intelligent IP blocking
- **Cost-based rate limiting** for expensive operations
- **Request validation** and sanitization
- **JWT authentication** and authorization

## 🛠 Configuration Options

### Rate Limiting Configuration

```typescript
// In productionMiddleware.ts
const securityConfig = {
  rateLimiting: {
    global: { windowMs: 15 * 60 * 1000, max: 1000 }, // 1000 req/15min
    perUser: { windowMs: 60 * 1000, max: 60 },        // 60 req/min per user
    expensive: { windowMs: 5 * 60 * 1000, max: 10 }   // 10 vision ops/5min
  },
  ddosProtection: {
    enabled: true,
    threshold: 100,     // requests per minute threshold
    blockDuration: 3600 // 1 hour block duration
  }
};
```

### Atlas Generation Options

```typescript
const atlasOptions = {
  quality: 85,           // JPEG quality (1-100)
  format: 'webp',        // 'webp' or 'jpeg'
  maxFileSize: 2097152,  // 2MB max size
  uploadToStorage: true, // Upload to Supabase storage
  cacheTtl: 3600        // Cache TTL in seconds
};
```

## 🚨 Troubleshooting

### Common Issues

1. **Dependencies not installing**
   ```bash
   # Clean install
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Sharp build errors on Windows**
   ```bash
   # Install Windows build tools (if needed)
   npm install --global windows-build-tools
   # Or use pre-built binaries
   npm config set sharp_binary_host "https://github.com/lovell/sharp-libvips/releases/"
   ```

3. **Supabase connection issues**
   - Verify your Supabase URL and keys in `.env`
   - Ensure your database has the monitoring tables created
   - Check that RLS policies allow your service role

4. **OpenAI API errors**
   - Verify your API key is valid and has credits
   - Check rate limits on your OpenAI account
   - Ensure GPT-4o model access

5. **Redis connection issues**
   - Redis is optional - the system falls back to local caching
   - Verify Redis URL format: `redis://localhost:6379`

### Debug Mode

Enable detailed logging:

```bash
DEBUG=snapsort:* npm run dev
```

### Performance Issues

Monitor performance:

```bash
# Check system metrics
curl http://localhost:3001/api/monitoring/metrics?includeDetails=true

# Check cost analytics
curl http://localhost:3001/api/monitoring/costs?includeRecommendations=true
```

## 📚 API Documentation

### Atlas Generation API

**POST** `/api/atlas/generate`

Generate an optimized image atlas for vision analysis.

```typescript
interface AtlasRequest {
  images: Array<{
    id: string;
    url?: string;
    base64?: string;
  }>;
  options?: {
    quality?: number;
    format?: 'webp' | 'jpeg';
    uploadToStorage?: boolean;
    cacheTtl?: number;
  };
}
```

### Monitoring API

**GET** `/api/monitoring/health` - System health check
**GET** `/api/monitoring/metrics` - Performance metrics
**GET** `/api/monitoring/costs` - Cost analytics
**GET** `/api/monitoring/usage-patterns` - User patterns
**GET** `/api/monitoring/atlas-stats` - Atlas statistics
**GET** `/api/monitoring/prometheus` - Prometheus metrics

### Image Sorting API

**POST** `/api/sort` - Main sorting endpoint

```typescript
interface SortRequest {
  query: string;
  imageIds: string[];
  sortType: 'custom' | 'tone' | 'scene' | 'thumbnail';
  useVision: boolean;
  maxResults: number;
}
```

## 🎯 Production Deployment

### Environment Variables

Set these in production:

```bash
NODE_ENV=production
ATLAS_CACHE_TTL=86400          # 24 hours
MAX_IMAGES_PER_REQUEST=20      # Lower for production
DAILY_COST_LIMIT=500          # Production cost limit
REDIS_URL=your_redis_instance  # Distributed caching
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Monitoring Setup

- **Prometheus**: Scrape `/api/monitoring/prometheus`
- **Grafana**: Import dashboard for SnapSort metrics
- **Alerts**: Configure based on `/api/monitoring/alerts`

## 📈 Performance Optimization

### Atlas Optimization
- Batch 3+ images for optimal cost savings
- Use WebP format for better compression
- Enable storage caching for repeated queries

### Caching Strategy
- Redis for distributed caching (recommended)
- Local NodeCache as fallback
- TTL-based cache invalidation

### Cost Management
- Enable cost-based rate limiting
- Monitor daily spending limits
- Review optimization recommendations

## 🔧 Development

### Adding New Features

1. **New Routes**: Add to `src/routes/`
2. **Middleware**: Add to `src/lib/security/`
3. **Monitoring**: Update `src/lib/monitoring/`
4. **Types**: Update `src/types/`

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Load testing
npm run test:load
```

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review error logs in the monitoring dashboard
3. Check Prometheus metrics for performance insights
4. Verify environment configuration

The system includes comprehensive error handling and logging to help diagnose issues quickly.
