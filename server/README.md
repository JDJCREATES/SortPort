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

## 🧪 Development

```bash
# Watch mode (auto-reload)
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Testing (when tests are added)
npm test
```

## 🚀 Production Deployment

The server is designed for production deployment with:
- Proper error logging
- Graceful shutdown handling
- Compression middleware
- Security best practices
- Environment-based configuration

## 🔗 Integration

This server integrates with:
- **Supabase** - Database and authentication
- **OpenAI** - LLM and vision APIs
- **LangChain** - Agent and chain orchestration
- **Edge Functions** - Atlas generation and batch processing

## 📈 Monitoring

Health endpoints provide monitoring data:
- System uptime and memory usage
- Database connectivity
- OpenAI API availability
- Environment configuration status

## 🔧 Next Steps (TODO)

