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

```mermaid
graph TB
    subgraph "Frontend (React Native)"
        UI["PictureHackBar UI"]
        SS["SortingService• sortImages()• getTaskStatus()• subscribeProgress()"]
        NL["Natural Language Input"]
        UP["User Photos"]
    end

    subgraph "Supabase Edge Functions"
        EF["sort-by-language• proxy to server• auth validation"]
        AF["atlas-generator• image atlas creation"]
        CF["credit functions• balance management"]
    end

    subgraph "API Gateway"
        SE["/sort/ endpoint• unified entry point• request validation• response formatting"]
        MP["middleware_pipeline.ts• validateRequest()• enrichContext()• sanitizeResponse()• handleStreaming()"]
    end

    subgraph "Core Orchestration"
        AR["agent_router.ts• route()• analyzeQuery()• selectAgent()"]
        AC["agent_coordinator.ts• coordinateMultiAgent()• resolveConflicts()• distributeWorkload()"]
    end

    subgraph "LCEL Chain Engine"
        CE["chain_engine.ts• LCEL chain executor• parallel processing• streaming support• RunnableSequence & RunnableParallel"]
        CB2["chain_builder.ts• dynamic LCEL construction• chain composition• validation• RunnableBranch logic"]
        CS["chain_store.ts• cache compiled chains• reuse patterns• optimization"]
        RU["runnable_utils.ts• NEW: Runnable helpers• pipe operations• batch processing• async/streaming support"]
        CC["chain_composer.ts• NEW: LCEL composition engine• RunnableSequence builder• RunnableParallel optimizer• conditional routing"]
        CV["chain_validator.ts• NEW: LCEL chain validation• input/output schema checking• chain integrity verification"]
    end

    subgraph "LCEL Core Primitives"
        RS["runnable_sequence.ts• NEW: Sequential chain execution• pipe operator support• error propagation"]
        RP["runnable_parallel.ts• NEW: Parallel execution engine• concurrent processing• result aggregation"]
        RB["runnable_branch.ts• NEW: Conditional routing• decision trees• dynamic path selection"]
        RL["runnable_lambda.ts• NEW: Custom function wrappers• transform operations• data processing"]
        RA["runnable_assign.ts• NEW: Variable assignment• context enrichment• state management"]
        RM["runnable_map.ts• NEW: Batch processing• array operations• parallel mapping"]
    end

    subgraph "Agent Subsystems"
        subgraph "Task Agent System"
            TA["task_agent.ts• orchestrateMultiStep()• manageWorkflow()"]
            TAP["task_prompts.ts• LCEL prompt templates• dynamic context injection"]
            TAC["task_chains.ts• LCEL multi-step chains• conditional routing• RunnableSequence"]
            TACS["task_chain_selector.ts• NEW: Dynamic chain selection• task complexity routing• optimization"]
        end

        subgraph "Tool Agent System"
            TOA["tool_agent.ts• executeSingleAction()• validateTool()"]
            TOAP["tool_prompts.ts• LCEL tool selection• parameter extraction"]
            TOAC["tool_chains.ts• LCEL tool execution• result processing• RunnableParallel"]
            TOCS["tool_chain_supervisor.ts• NEW: Tool chain orchestration• error recovery• result validation"]
        end

        subgraph "Query Processing Agent"
            QPA["query_processor.ts• NEW: Natural language understanding• intent classification• parameter extraction"]
            QPC["query_chains.ts• NEW: LCEL query analysis• semantic parsing• context enrichment"]
            QPS["query_planner.ts• NEW: Execution plan generation• step decomposition• resource estimation"]
        end
    end

    subgraph "Smart Tool Registry"
        TR2["tool_registry.ts• registerTool()• discoverTools()• validateChain()"]
        
        subgraph "Vision Tools"
            VA["vision_analysis.ts• analyzeWithGPT4V()• batchAnalyze()"]
            VAC["vision_chains.ts• LCEL vision processing• feature extraction• RunnableParallel batch processing"]
            VAS["vision_aggregator.ts• NEW: Multi-model vision fusion• consensus building• confidence scoring"]
        end
        
        subgraph "Search Tools"
            VS["vector_search.ts• semanticSearch()• generateEmbedding()"]
            VSC["search_chains.ts• LCEL semantic queries• similarity processing• RunnableSequence"]
            IS["image_sort.ts• sortByRelevance()• calculateScores()"]
            ISC["sort_chains.ts• LCEL sorting logic• relevance scoring• RunnableBranch for multi-criteria"]
            SR["search_ranker.ts• NEW: Multi-factor ranking• score aggregation• result fusion"]
            SRC["ranking_chains.ts• NEW: LCEL ranking algorithms• weighted scoring• dynamic thresholds"]
        end
        
        subgraph "Content Tools"
            MQ["metadata_query.ts• filterByStructuredData()• optimizeQueries()"]
            MQC["metadata_chains.ts• LCEL query processing• filter composition• RunnableParallel filters"]
            TT["tagging_tool.ts• generateTags()• updateImageTags()"]
            TTC["tagging_chains.ts• LCEL tag generation• category inference• RunnableSequence pipeline"]
            FD["face_detection.ts• detectFaces()• groupByPerson()• faceRecognition()"]
            FDC["face_chains.ts• LCEL face analysis• person clustering• RunnableParallel processing"]
            OD["object_detection.ts• detectObjects()• classifyItems()• spatialAnalysis()"]
            ODC["object_chains.ts• LCEL object recognition• scene understanding• RunnableBranch classification"]
            GEO["geo_analysis.ts• extractGPS()• locationClustering()• mapSorting()"]
            GEOC["geo_chains.ts• LCEL location processing• geographic grouping• RunnableSequence"]
            DUP["duplicate_detector.ts• perceptualHashing()• findSimilar()• deduplication()"]
            DUPC["duplicate_chains.ts• LCEL similarity analysis• duplicate removal• RunnableParallel comparison"]
            CA["content_aggregator.ts• NEW: Multi-tool content fusion• metadata merging• conflict resolution"]
            CAC["aggregation_chains.ts• NEW: LCEL content synthesis• data consolidation• RunnableParallel aggregation"]
        end
        
        subgraph "Safety Tools"
            NC["nsfw_checker.ts• checkContentSafety()• batchProcess()"]
            NCC["nsfw_chains.ts• LCEL safety analysis• batch processing• RunnableParallel scanning"]
            SF["safety_filter.ts• NEW: Multi-model safety checking• consensus validation• risk scoring"]
            SFC["safety_chains.ts• NEW: LCEL safety pipeline• risk assessment• RunnableBranch filtering"]
        end
        
        subgraph "Organization Tools"
            AM["album_manager.ts• createSmartAlbums()• groupImages()"]
            AMC["album_chains.ts• LCEL album creation• smart grouping• RunnableSequence organization"]
            SC["smart_collections.ts• temporalGrouping()• eventDetection()• storyCreation()"]
            SCC["collections_chains.ts• LCEL event clustering• narrative building• RunnableParallel analysis"]
            QS["quality_scorer.ts• technicalAnalysis()• aestheticScoring()• autoSelect()"]
            QSC["quality_chains.ts• LCEL quality assessment• best photo selection• RunnableBranch scoring"]
            SG["smart_grouper.ts• NEW: Multi-criteria grouping• hierarchical clustering• similarity analysis"]
            SGC["grouping_chains.ts• NEW: LCEL grouping algorithms• cluster optimization• RunnableParallel processing"]
        end
    end

    subgraph "AI Model Management"
        MR["model_router.ts• selectOptimalModel()• loadBalance()• costOptimize()"]
        PM["prompt_manager.ts• LCEL prompt templates• version control• optimization"]
        MC["model_coordinator.ts• NEW: Multi-model orchestration• consensus building• fallback handling"]
        PO["prompt_optimizer.ts• NEW: Dynamic prompt adaptation• A/B testing• performance tracking"]
        
        subgraph "Model Pool"
            M1["GPT-4o-mini• Query Analysis & Routing"]
            M2["GPT-4o• Complex Reasoning"]
            M3["GPT-4-Vision• Image Understanding"]
            EMB["OpenAI Embeddings• Semantic Search"]
            M4["Claude-3.5-Sonnet• NEW: Alternative reasoning• backup processing"]
            M5["Gemini-Pro-Vision• NEW: Multi-modal analysis• vision tasks"]
        end
    end

    subgraph "LCEL Input/Output Processing"
        IP["input_processor.ts• NEW: LCEL input validation• schema checking• type conversion"]
        OP["output_processor.ts• NEW: LCEL output formatting• result transformation• response standardization"]
        PS["parser_suite.ts• NEW: Multiple output parsers• structured data extraction• format conversion"]
        VS2["validation_suite.ts• NEW: Chain input/output validation• schema enforcement• error detection"]
    end

    subgraph "Memory & State"
        AS["agent_state.ts• trackAgentStates()• persistDecisionTrees()"]
        ST["short_term.ts• storeSessionData()• retrieveContext()"]
        VST["vector_store.ts• storeEmbeddings()• queryVectors()"]
        CM["cache_manager.ts• cacheResults()• invalidateCache()"]
        CS2["context_store.ts• NEW: LCEL chain context• intermediate results• execution state"]
        MS["memory_service.ts• NEW: Persistent chain memory• learning from executions• pattern recognition"]
    end

    subgraph "LCEL Execution Monitoring"
        EM["execution_monitor.ts• NEW: Chain execution tracking• performance metrics• bottleneck detection"]
        DT["debug_tracer.ts• NEW: LCEL chain debugging• step-by-step execution• error tracing"]
        PT["performance_tracker.ts• NEW: Chain performance analysis• latency measurement• throughput monitoring"]
        LT["langchain_tracer.ts• NEW: LangSmith integration• chain observability• execution logging"]
    end

    subgraph "Error & Recovery"
        EH["error_handler.ts• handleAgentFailures()• retryLogic()"]
        CB["circuit_breaker.ts• monitorAPIHealth()• preventCascades()"]
        RH["recovery_handler.ts• NEW: LCEL chain recovery• fallback execution• partial result handling"]
        FT["fault_tolerance.ts• NEW: Chain resilience• error isolation• graceful degradation"]
    end

    subgraph "Queue System"
        TQ["task_queue.ts• enqueue()• getStatus()• processJob()"]
        NW["nsfw_worker.ts• processNSFW()• updateProgress()"]
        UW["upload_worker.ts• processUploads()• generateThumbnails()"]
        VW["vision_worker.ts• batchVisionAnalysis()• processResults()"]
        CW["chain_worker.ts• NEW: LCEL chain execution• parallel processing• result aggregation"]
        WH["webhook_handler.ts• handleCompletion()• notifyFrontend()"]
        SH["socket_handler.ts• broadcastProgress()• manageConnections()"]
    end

    subgraph "Monitoring"
        LOG["logger.ts• logAgentDecisions()• trackPerformance()"]
        MET["metrics.ts• collectMetrics()• measureLatency()"]
        TR["tracer.ts• traceExecution()• debugDecisions()"]
        LA["langchain_analytics.ts• NEW: LCEL chain analytics• usage patterns• optimization insights"]
    end

    subgraph "Supabase Database"
        VI["virtual_image table• 30+ metadata fields• embeddings• NSFW flags"]
        UC["user_credits• balance tracking• usage history"]
        UP2["user_profiles• preferences• settings"]
        TH["task_history• job tracking• results cache"]
        CE2["chain_executions• NEW: LCEL execution logs• performance data• debug info"]
        CM2["chain_metadata• NEW: Chain configurations• versions• performance stats"]
    end

    subgraph "External Services"
        REK["AWS Rekognition• NSFW Detection"]
        S3["AWS S3• Image Storage"]
        REDIS["Redis• Queue & Cache"]
        LS["LangSmith• NEW: Chain observability• debugging• performance monitoring"]
    end

    subgraph "File Structure" 
        FS["📁 src/
├── 📁 api/
│   ├── middleware_pipeline.ts
│   └── routes/
│       └── sort.ts
├── 📁 core/
│   ├── agent_router.ts
│   ├── agent_coordinator.ts
│   └── 📁 lcel/
│       ├── runnable_sequence.ts    [NEW - LCEL]
│       ├── runnable_parallel.ts    [NEW - LCEL]
│       ├── runnable_branch.ts      [NEW - LCEL]
│       ├── runnable_lambda.ts      [NEW - LCEL]
│       ├── runnable_assign.ts      [NEW - LCEL]
│       └── runnable_map.ts         [NEW - LCEL]
├── 📁 chains/
│   ├── chain_engine.ts             [LCEL Enhanced]
│   ├── chain_builder.ts            [LCEL Enhanced]
│   ├── chain_store.ts
│   ├── runnable_utils.ts           [NEW - LCEL]
│   ├── chain_composer.ts           [NEW - LCEL]
│   ├── chain_validator.ts          [NEW - LCEL]
│   └── 📁 io/
│       ├── input_processor.ts      [NEW - LCEL]
│       ├── output_processor.ts     [NEW - LCEL]
│       ├── parser_suite.ts         [NEW - LCEL]
│       └── validation_suite.ts     [NEW - LCEL]
├── 📁 agents/
│   ├── 📁 task/
│   │   ├── task_agent.ts
│   │   ├── task_prompts.ts         [LCEL]
│   │   ├── task_chains.ts          [LCEL Enhanced]
│   │   └── task_chain_selector.ts  [NEW - LCEL]
│   ├── 📁 tool/
│   │   ├── tool_agent.ts
│   │   ├── tool_prompts.ts         [LCEL]
│   │   ├── tool_chains.ts          [LCEL Enhanced]
│   │   └── tool_chain_supervisor.ts [NEW - LCEL]
│   └── 📁 query/
│       ├── query_processor.ts      [NEW - LCEL]
│       ├── query_chains.ts         [NEW - LCEL]
│       └── query_planner.ts        [NEW - LCEL]
├── 📁 tools/
│   ├── tool_registry.ts
│   ├── 📁 vision/
│   │   ├── vision_analysis.ts
│   │   ├── vision_chains.ts        [LCEL Enhanced]
│   │   └── vision_aggregator.ts    [NEW - LCEL]
│   ├── 📁 search/
│   │   ├── vector_search.ts
│   │   ├── search_chains.ts        [LCEL Enhanced]
│   │   ├── image_sort.ts
│   │   ├── sort_chains.ts          [LCEL Enhanced]
│   │   ├── search_ranker.ts        [NEW - LCEL]
│   │   └── ranking_chains.ts       [NEW - LCEL]
│   ├── 📁 content/
│   │   ├── metadata_query.ts
│   │   ├── metadata_chains.ts      [LCEL Enhanced]
│   │   ├── tagging_tool.ts
│   │   ├── tagging_chains.ts       [LCEL Enhanced]
│   │   ├── content_aggregator.ts   [NEW - LCEL]
│   │   └── aggregation_chains.ts   [NEW - LCEL]
│   ├── 📁 safety/
│   │   ├── nsfw_checker.ts
│   │   ├── nsfw_chains.ts          [LCEL Enhanced]
│   │   ├── safety_filter.ts        [NEW - LCEL]
│   │   └── safety_chains.ts        [NEW - LCEL]
│   └── 📁 organization/
│       ├── album_manager.ts
│       ├── album_chains.ts         [LCEL Enhanced]
│       ├── smart_grouper.ts        [NEW - LCEL]
│       └── grouping_chains.ts      [NEW - LCEL]
├── 📁 models/
│   ├── model_router.ts
│   ├── prompt_manager.ts           [LCEL Enhanced]
│   ├── model_coordinator.ts        [NEW - LCEL]
│   └── prompt_optimizer.ts         [NEW - LCEL]
├── 📁 memory/
│   ├── agent_state.ts
│   ├── short_term.ts
│   ├── vector_store.ts
│   ├── cache_manager.ts
│   ├── context_store.ts            [NEW - LCEL]
│   └── memory_service.ts           [NEW - LCEL]
├── 📁 queue/
│   ├── task_queue.ts
│   ├── workers/
│   │   ├── nsfw_worker.ts
│   │   ├── upload_worker.ts
│   │   ├── vision_worker.ts
│   │   └── chain_worker.ts         [NEW - LCEL]
│   └── handlers/
│       ├── webhook_handler.ts
│       └── socket_handler.ts
├── 📁 error/
│   ├── error_handler.ts
│   ├── circuit_breaker.ts
│   ├── recovery_handler.ts         [NEW - LCEL]
│   └── fault_tolerance.ts          [NEW - LCEL]
├── 📁 monitoring/
│   ├── logger.ts
│   ├── metrics.ts
│   ├── tracer.ts
│   ├── execution_monitor.ts        [NEW - LCEL]
│   ├── debug_tracer.ts             [NEW - LCEL]
│   ├── performance_tracker.ts      [NEW - LCEL]
│   ├── langchain_tracer.ts         [NEW - LCEL]
│   └── langchain_analytics.ts      [NEW - LCEL]
└── 📁 database/
    ├── chain_executions.ts         [NEW - LCEL]
    └── chain_metadata.ts           [NEW - LCEL]"]
    end

    %% Core Flow
    UI --> SS
    SS --> EF
    EF --> SE
    SE --> MP
    MP --> AR
    AR --> AC

    %% LCEL Chain Processing - Enhanced
    AC --> CE
    CE --> CB2
    CB2 --> CS
    CE --> RU
    CE --> CC
    CC --> CV
    
    %% LCEL Core Primitives Integration
    CE --> RS
    CE --> RP
    CE --> RB
    CE --> RL
    CE --> RA
    CE --> RM
    RS --> RP
    RP --> RB

    %% Enhanced Agent Coordination
    AC --> TA
    AC --> TOA
    AC --> QPA
    QPA --> QPC
    QPC --> QPS
    QPS --> TA
    TA --> TAP
    TA --> TAC
    TA --> TACS
    TOA --> TOAP
    TOA --> TOAC
    TOA --> TOCS

    %% LCEL Chain Execution - Enhanced
    TAC --> CE
    TOAC --> CE
    QPC --> CE
    CE --> MR
    CE --> PM
    CE --> MC
    PM --> PO

    %% Enhanced Tool Registry & LCEL Integration
    AC --> TR2
    TR2 --> VA
    TR2 --> VS
    TR2 --> IS
    TR2 --> MQ
    TR2 --> TT
    TR2 --> NC
    TR2 --> AM

    %% Enhanced LCEL Tool Chains
    VA --> VAC
    VAC --> VAS
    VS --> VSC
    VSC --> SR
    SR --> SRC
    IS --> ISC
    MQ --> MQC
    TT --> TTC
    NC --> NCC
    NCC --> SF
    SF --> SFC
    AM --> AMC
    AM --> SG
    SG --> SGC
    
    %% Content Aggregation
    VAC --> CA
    VSC --> CA
    ISC --> CA
    MQC --> CA
    TTC --> CA
    CA --> CAC

    %% Enhanced Chain Execution Flow
    VAC --> CE
    VAS --> CE
    VSC --> CE
    SRC --> CE
    ISC --> CE
    MQC --> CE
    TTC --> CE
    NCC --> CE
    SFC --> CE
    AMC --> CE
    SGC --> CE
    CAC --> CE

    %% Enhanced Model Management
    MR --> M1
    MR --> M2
    MR --> M3
    MR --> EMB
    MR --> M4
    MR --> M5
    MC --> M1
    MC --> M2
    MC --> M3
    PM --> M1
    PM --> M2
    PM --> M3
    PO --> PM

    %% LCEL Input/Output Processing
    CE --> IP
    CE --> OP
    IP --> PS
    OP --> VS2
    PS --> VS2

    %% Enhanced Memory & State
    AC --> AS
    AS --> ST
    AS --> VST
    VS --> VST
    CE --> CM
    CE --> CS2
    CS2 --> MS
    MS --> AS

    %% LCEL Execution Monitoring
    CE --> EM
    CE --> DT
    CE --> PT
    CE --> LT
    EM --> MET
    DT --> TR
    PT --> MET

    %% Enhanced Error Handling
    AR --> EH
    AC --> EH
    CE --> EH
    EH --> CB
    EH --> RH
    RH --> FT
    CB --> MR
    FT --> CE

    %% Enhanced Queue Operations
    AR --> TQ
    TQ --> NW
    TQ --> UW
    TQ --> VW
    TQ --> CW
    CW --> CE
    NW --> WH
    UW --> SH

    %% Enhanced Database Operations
    IS --> VI
    VS --> VI
    MQ --> VI
    AM --> VI
    TT --> VI
    NC --> VI
    AR --> UC
    SE --> UP2
    TQ --> TH
    CE --> CE2
    CB2 --> CM2
    EM --> CE2

    %% External Services - Enhanced
    NC --> REK
    UW --> S3
    TQ --> REDIS
    CM --> REDIS
    LT --> LS
    DT --> LS

    %% Enhanced Monitoring & Feedback
    AR --> LOG
    CE --> MET
    AC --> TR
    CE --> LA
    MET --> AC
    TR --> CE
    LA --> CC

    %% LCEL Chain Optimization Feedback Loops
    EM --> CC
    PT --> CB2
    LA --> CS
    MS --> PM
```
## Updated Implementation Plan

### Phase 1: Core Agentic Framework (Week 1-2)

#### 1.1 Modular LangChain Structure
```
/server/src/lib/langchain/
├── agent_router.ts          # Routes queries to appropriate agents
├── task_planner.ts          # Plans multi-step operations
├── executor.ts              # Executes agent decisions
├── agents/
│   ├── task_agent.ts        # Multi-step task orchestration
│   └── tool_agent.ts        # Single-action deterministic operations
├── tools/
│   ├── image_sort.ts        # Core sorting logic
│   ├── vector_search.ts     # Embedding-based search
│   ├── metadata_query.ts    # Structured data queries
│   ├── vision_analysis.ts   # GPT-4V image analysis
│   ├── nsfw_checker.ts      # NSFW detection tool
│   ├── album_manager.ts     # Album operations
│   └── tagging_tool.ts      # Auto-tagging
├── memory/
│   ├── short_term.ts        # Session memory
│   ├── vector_store.ts      # Embedding storage
│   └── cache_manager.ts     # Result caching
├── queue/
│   ├── task_queue.ts        # Background task management
│   ├── workers/
│   │   ├── nsfw_worker.ts   # NSFW processing worker
│   │   ├── upload_worker.ts # Image upload worker
│   │   └── vision_worker.ts # Batch vision analysis
│   └── handlers/
│       ├── webhook_handler.ts # Task completion callbacks
│       └── socket_handler.ts  # Real-time updates
└── monitoring/
    ├── logger.ts            # Comprehensive logging
    ├── metrics.ts           # Performance tracking
    └── tracer.ts            # Agent decision tracing
```

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
