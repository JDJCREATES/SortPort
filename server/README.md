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
server/
├── src/
│   ├── index.ts                 # Express app entry point
│   ├── types/
│   │   ├── api.ts              # API request/response types
│   │   └── sorting.ts          # LangChain sorting types
│   ├── middleware/
│   │   ├── auth.ts             # Supabase authentication
│   │   ├── errorHandler.ts     # Global error handling
│   │   └── rateLimiter.ts      # Request rate limiting
│   ├── routes/
│   │   ├── health.ts           # Health check endpoints
│   │   ├── sort.ts             # Main sorting endpoints
│   │   └── atlas.ts            # Atlas generation endpoints
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts       # Database connection
│       │   └── queries.ts      # Reusable queries
│       └── langchain/          # LangChain integration
│           ├── prompts/        # LangChain prompts
│           ├── chains/         # LangChain chains
│           └── utils/          # Utility files

├── package.json
├── tsconfig.json
└── .env.example
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

Phase 2 implementation:
- [ ] LangChain chain implementations
- [ ] Vector similarity search
- [ ] Atlas generation logic
- [ ] Vision analysis integration
- [ ] Embedding operations
- [ ] Result caching
- [ ] Performance optimization
