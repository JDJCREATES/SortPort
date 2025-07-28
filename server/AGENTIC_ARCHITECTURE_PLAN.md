# SnapSort Agentic Architecture Plan

## Executive Summary

Transform the current LangChain-based server into a fully agentic system with a single `/sort/` endpoint that intelligently selects tools based on natural language input, cost efficiency, and available data in the `virtual_image` table.

## Current State Analysis

### ✅ What Works Well
- **Solid Foundation**: Express server with LangChain integration
- **Production Security**: Comprehensive middleware, rate limiting, monitoring
- **Rich Data Model**: `virtual_image` table with extensive metadata fields
- **Cost-Aware Design**: Credit system and usage tracking
- **Multi-Modal Support**: Text embeddings + vision analysis capabilities

### 🔄 What Needs Enhancement
- **Multiple Endpoints**: Currently has 6 different sort endpoints
- **Manual Tool Selection**: Frontend decides tool usage
- **Limited Agentic Behavior**: Chains are predefined, not dynamically composed
- **No Single Source of Truth**: Decision logic scattered across multiple files

## Agentic Architecture Design

### Core Principles
1. **Single Endpoint**: Only `/sort/` accepts all natural language requests
2. **Intelligent Tool Selection**: Agent decides which tools to use based on query analysis
3. **Cost Optimization**: Prefer metadata/embeddings over expensive vision calls
4. **Progressive Enhancement**: Start with cheap operations, escalate only when needed
5. **Source of Truth**: Central agent manages all decision-making

### Architecture Components

#### 1. Agent Manager (Single Source of Truth)
```typescript
class AgentManager {
  // Analyzes query and orchestrates entire sorting process
  async orchestrate(query: string, context: SortingContext): Promise<SortingResult>
  
  // Decides which tools to use and in what order
  async planExecution(analysisResult: QueryAnalysis): Promise<ExecutionPlan>
  
  // Monitors execution and adapts strategy
  async executeWithAdaptation(plan: ExecutionPlan): Promise<SortingResult>
}
```

#### 2. Tool Selection Engine
```typescript
class ToolSelectionEngine {
  // Intelligently selects optimal tools based on query and available data
  async selectTools(query: QueryAnalysis, availableData: DataAvailability): Promise<ToolChain>
  
  // Estimates cost and performance for different tool combinations
  async estimateApproaches(query: string): Promise<ApproachOption[]>
  
  // Learns from past executions to improve future selections
  async optimizeFromHistory(queryType: string): Promise<void>
}
```

#### 3. Smart Tools (Enhanced Current Tools)
- **Vector Search Tool**: Semantic similarity using embeddings
- **Metadata Query Tool**: Fast filtering using structured data
- **Vision Analysis Tool**: GPT-4V for complex visual understanding
- **EXIF Tool**: Technical metadata extraction
- **Album Tool**: Smart grouping and organization
- **Tagging Tool**: Automatic tag generation and updates

### Updated Modular Architecture

#### 1.2 Agent Manager with Task Queue Integration
```typescript
// server/src/lib/langchain/agent_router.ts
export class AgentRouter {
  private taskAgent: TaskAgent;
  private toolAgent: ToolAgent;
  private taskQueue: TaskQueue;
  private logger: AgentLogger;
  
  async route(request: SortRequest): Promise<SortResponse> {
    const analysis = await this.analyzeQuery(request.query);
    
    if (analysis.requiresLongRunning) {
      return await this.handleAsyncTask(request, analysis);
    } else {
      return await this.handleSyncTask(request, analysis);
    }
  }
  
  private async handleAsyncTask(request: SortRequest, analysis: QueryAnalysis): Promise<SortResponse> {
    // Queue long-running tasks (NSFW, vision analysis)
    const taskId = await this.taskQueue.enqueue('image-processing', {
      userId: request.userId,
      imageIds: request.imageIds,
      operations: analysis.requiredOperations
    });
    
    return {
      taskId,
      status: 'processing',
      estimatedCompletion: Date.now() + analysis.estimatedTime
    };
  }
}
```

#### 1.2 Implement Tool Selection Engine
```typescript
// server/src/lib/agent/ToolSelectionEngine.ts
export class ToolSelectionEngine {
  async selectOptimalChain(analysis: QueryAnalysis, data: DataAvailability): Promise<ToolChain> {
    const approaches = this.generateApproaches(analysis, data);
    const rankedApproaches = await this.rankByEfficiency(approaches);
    return this.buildOptimalChain(rankedApproaches[0]);
  }

  private generateApproaches(analysis: QueryAnalysis, data: DataAvailability): ApproachOption[] {
    const approaches: ApproachOption[] = [];
    
    // Approach 1: Metadata-only (fastest, cheapest)
    if (this.canUseMetadataOnly(analysis, data)) {
      approaches.push({
        type: 'metadata-only',
        tools: ['MetadataQueryTool', 'TaggingTool'],
        estimatedCost: 0.5,
        estimatedTime: 200,
        confidence: data.metadataCompleteness
      });
    }
    
    // Approach 2: Embeddings + Metadata (balanced)
    if (data.embeddingsAvailable > 0.7) {
      approaches.push({
        type: 'embeddings-hybrid',
        tools: ['VectorSearchTool', 'MetadataQueryTool'],
        estimatedCost: 1.0,
        estimatedTime: 800,
        confidence: 0.85
      });
    }
    
    // Approach 3: Vision + Everything (expensive, highest quality)
    approaches.push({
      type: 'vision-enhanced',
      tools: ['VisionAnalysisTool', 'VectorSearchTool', 'MetadataQueryTool'],
      estimatedCost: 3.0,
      estimatedTime: 5000,
      confidence: 0.95
    });
    
    return approaches;
  }
}
```

#### 1.3 Refactor Single Endpoint
```typescript
// server/src/routes/sort.ts - Simplified to single endpoint
router.post('/', 
  strictRateLimiter,
  requireCredits(1), // Base cost, actual cost determined by agent
  asyncHandler(async (req, res) => {
    const sortRequest = SortRequestSchema.parse(req.body);
    
    // Single entry point - agent decides everything
    const result = await agentManager.orchestrate(sortRequest, req.context);
    
    // Dynamic credit deduction based on actual usage
    await updateCreditsMiddleware(result.cost.credits)(req, res, () => {});
    
    res.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        version: '2.0.0-agentic'
      }
    });
  })
);
```

### Phase 2: Smart Tools Implementation (Week 3-4)

#### 2.1 Enhanced Vector Search Tool
```typescript
// server/src/lib/agent/tools/VectorSearchTool.ts
export class VectorSearchTool extends BaseTool {
  async execute(query: string, images: VirtualImage[], options: ToolOptions): Promise<ToolResult> {
    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);
    
    // Perform vector similarity search
    const results = await VirtualImageQueries.vectorSimilaritySearch(
      options.userId,
      queryEmbedding,
      {
        limit: options.maxResults,
        threshold: 0.6,
        albumId: options.albumId
      }
    );
    
    return {
      sortedImages: results.map(r => ({
        image: r,
        sortScore: r.similarity,
        reasoning: `Semantic similarity: ${(r.similarity * 100).toFixed(1)}%`,
        metadata: { similarity: r.similarity, tool: 'vector-search' }
      })),
      confidence: this.calculateConfidence(results),
      cost: this.calculateCost(results.length),
      processingTime: Date.now() - startTime
    };
  }
}
```

#### 2.2 Metadata Query Tool
```typescript
// server/src/lib/agent/tools/MetadataQueryTool.ts
export class MetadataQueryTool extends BaseTool {
  async execute(query: string, images: VirtualImage[], options: ToolOptions): Promise<ToolResult> {
    const filters = await this.parseQueryToFilters(query);
    
    let filteredImages = images;
    
    // Apply structured filters
    if (filters.sceneType) {
      filteredImages = filteredImages.filter(img => 
        img.scene_type?.toLowerCase().includes(filters.sceneType.toLowerCase())
      );
    }
    
    if (filters.emotions?.length > 0) {
      filteredImages = filteredImages.filter(img =>
        img.emotion_detected?.some(emotion => 
          filters.emotions.includes(emotion.toLowerCase())
        )
      );
    }
    
    if (filters.dateRange) {
      filteredImages = this.filterByDateRange(filteredImages, filters.dateRange);
    }
    
    // Score by relevance
    const scoredImages = filteredImages.map((img, index) => ({
      image: img,
      sortScore: this.calculateRelevanceScore(img, filters),
      reasoning: this.generateReasoning(img, filters),
      metadata: { filters: filters, tool: 'metadata-query' }
    }));
    
    return {
      sortedImages: scoredImages.sort((a, b) => b.sortScore - a.sortScore),
      confidence: this.calculateMetadataConfidence(filters, scoredImages),
      cost: 0.1, // Very cheap
      processingTime: Date.now() - startTime
    };
  }
}
```

### Phase 3: Task Queue & Background Processing (Week 3)

#### 3.1 Task Queue Implementation
```typescript
// server/src/lib/langchain/queue/task_queue.ts
export class TaskQueue {
  private queue: Queue;
  private redis: Redis;
  
  async enqueue(taskType: string, data: any, options?: QueueOptions): Promise<string> {
    const job = await this.queue.add(taskType, data, {
      delay: options?.delay || 0,
      attempts: options?.retries || 3,
      backoff: 'exponential'
    });
    
    return job.id!;
  }
  
  async getStatus(taskId: string): Promise<TaskStatus> {
    const job = await this.queue.getJob(taskId);
    return {
      id: taskId,
      status: await job?.getState() || 'unknown',
      progress: job?.progress || 0,
      result: job?.returnvalue
    };
  }
}

// server/src/lib/langchain/queue/workers/nsfw_worker.ts
export class NSFWWorker {
  async process(job: Job): Promise<NSFWResult> {
    const { imageIds, userId } = job.data;
    
    // Update progress
    job.progress(10);
    
    // Process NSFW detection in batches
    const results = await this.batchProcessNSFW(imageIds, (progress) => {
      job.progress(10 + (progress * 0.8));
    });
    
    // Update database
    await this.updateImageFlags(results, userId);
    
    job.progress(100);
    return results;
  }
}
```

### Phase 4: Frontend Integration (Week 6)

#### 4.1 Update Sorting Service
```typescript
// utils/sortingService.ts - Simplified for single endpoint
export class SortingService {
  async sortImages(request: SortingRequest): Promise<SortingResult> {
    // Single call to agentic endpoint
    const { data, error } = await supabase.functions.invoke('sort-by-language', {
      body: {
        query: request.query,
        userId: request.userId,
        imageIds: request.imageIds,
        maxResults: request.maxResults,
        maxCredits: request.maxCredits || 10
      }
    });
    
    if (error || !data.success) {
      throw new Error(error?.message || data.error || 'Sorting failed');
    }
    
    return data.data;
  }
  
  // Remove specific sort methods - agent handles all routing now
  // sortByTone, sortByScene, etc. are no longer needed
}
```

#### 4.2 Update UI Components
- **PictureHackBar**: Remove sort type selection, let agent decide
- **SortingProgress**: Enhanced progress tracking for multi-tool execution
- **SortingResults**: Display which tools were used and why

## Virtual Image Table Integration

### Enhanced Metadata Usage
The agent will intelligently leverage all available metadata fields:

```sql
-- Agent decision factors based on available data
SELECT 
  COUNT(*) as total_images,
  COUNT(embedding) as with_embeddings,
  COUNT(vision_summary) as with_vision,
  AVG(CASE WHEN virtual_tags IS NOT NULL THEN array_length(virtual_tags, 1) ELSE 0 END) as avg_tags,
  COUNT(detected_objects) as with_objects,
  COUNT(scene_type) as with_scenes,
  COUNT(emotion_detected) as with_emotions
FROM virtual_image 
WHERE user_id = $1;
```

### Progressive Data Enhancement
```typescript
class DataEnhancementService {
  async enhanceDataIfNeeded(images: VirtualImage[], query: QueryAnalysis): Promise<void> {
    // Generate embeddings for images that don't have them
    const needEmbeddings = images.filter(img => !img.embedding);
    if (needEmbeddings.length > 0 && query.semanticComplexity > 0.7) {
      await this.generateEmbeddings(needEmbeddings);
    }
    
    // Run vision analysis only if absolutely necessary
    const needVision = images.filter(img => !img.vision_summary);
    if (needVision.length > 0 && query.requiresVision && query.maxCost >= 3.0) {
      await this.runVisionAnalysis(needVision.slice(0, 5)); // Limit to 5 images
    }
  }
}
```

## Cost Optimization Strategy

### 1. Tiered Approach
- **Tier 1 (0.1-0.5 credits)**: Metadata-only operations
- **Tier 2 (0.5-1.5 credits)**: Metadata + embeddings
- **Tier 3 (1.5-5.0 credits)**: Full vision analysis

### 2. Smart Caching
- Cache query embeddings for similar requests
- Cache vision analysis results permanently
- Cache tool selection decisions for query patterns

### 3. Batch Operations
- Process multiple images in single vision calls
- Batch embedding generations
- Optimize database queries

## Updated Migration Strategy

### Week 1: Core Modular Foundation
1. **Restructure LangChain Directory**
   - Create new modular folder structure
   - Implement `agent_router.ts`, `task_planner.ts`, `executor.ts`
   - Set up agent types (Task vs Tool agents)
   - Maintain existing endpoints for compatibility

2. **Task Queue Infrastructure**
   - Set up Redis for queue management
   - Implement `task_queue.ts` with BullMQ
   - Create basic worker structure
   - Add webhook/socket handlers

### Week 2: Smart Tools & Agents
1. **Refactor Existing Tools**
   - Convert current chains to modular tools
   - Implement tool interfaces with standardized methods
   - Add comprehensive error handling and logging
   - Create tool registry for dynamic loading

2. **Agent Implementation**
   - Implement Task Agent for multi-step operations
   - Implement Tool Agent for single actions
   - Add decision logging and tracing
   - Create memory management system

### Week 3: Background Processing
1. **Queue Workers**
   - Implement NSFW worker for background processing
   - Create upload worker for large file handling
   - Add vision worker for batch analysis
   - Implement progress tracking and notifications

2. **Monitoring & Logging**
   - Complete logging system with agent decision tracking
   - Add comprehensive metrics collection
   - Implement execution tracing for debugging
   - Create performance monitoring dashboard

### Week 4: Single Endpoint Migration
1. **Unified Endpoint**
   - Implement single `/sort/` endpoint with agent routing
   - Add request validation and response formatting
   - Implement cost estimation and credit management
   - Add real-time progress updates

2. **Frontend Updates**
   - Update `SortingService` for single endpoint
   - Add task status polling and progress subscription
   - Remove sort type selection from UI
   - Enhance progress display for multi-tool execution

### Week 5: Testing & Optimization
1. **Performance Optimization**
   - Implement smart caching with Redis
   - Optimize database queries and batch operations
   - Add connection pooling and resource management
   - Performance testing and bottleneck identification

2. **Quality Assurance**
   - Comprehensive testing of all agent types
   - Load testing for queue system
   - A/B testing with existing system
   - User acceptance testing

### Week 6: Production Deployment
1. **Gradual Rollout**
   - Feature flags for new vs old system
   - Monitor queue performance and costs
   - Real-time monitoring and alerting
   - Rollback procedures if needed

2. **Monitoring & Maintenance**
   - Set up production monitoring dashboards
   - Configure alerting for queue backlogs
   - Monitor agent decision quality
   - Track cost optimization improvements

## Success Metrics

### Performance Targets
- **Response Time**: <2s for metadata-only, <5s for embeddings, <15s for vision
- **Cost Reduction**: 40% reduction in average cost per query
- **Accuracy**: 95% user satisfaction with results
- **Uptime**: 99.9% availability

### Monitoring Dashboard
- Query complexity distribution
- Tool usage patterns
- Cost per query trends
- User satisfaction scores
- Processing time by tool chain

## Risk Mitigation

### 1. Fallback Strategies
- Always have metadata-only fallback
- Graceful degradation for tool failures
- Cached results for critical queries

### 2. Cost Controls
- Hard limits on vision API usage
- Budget alerts for expensive operations
- User-specific cost limits

### 3. Quality Assurance
- Confidence scoring for all results
- A/B testing with current system
- User feedback integration

This architecture transforms SnapSort into a truly intelligent, cost-efficient, and scalable agentic system while maintaining backward compatibility and production reliability.
