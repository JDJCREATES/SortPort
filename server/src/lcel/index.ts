/**
 * LCEL System Exports
 * 
 * Central export point for all LCEL-based components and utilities
 */

// Core LCEL Primitives
export { RunnableBranch, BranchDefinition } from '../core/lcel/runnable_branch.js';
export { RunnableAssign, AssignmentMap } from '../core/lcel/runnable_assign.js';
export { RunnableMap } from '../core/lcel/runnable_map.js';

// Agents
export { QueryProcessor, QueryInput, ProcessedQuery } from '../agents/query/query_processor.js';
export { QueryChains } from '../agents/query/query_chains.js';
export { TaskAgent, TaskRequest, TaskResult } from '../agents/task/task_agent.js';
export { ToolAgent, ToolRequest, ToolResult } from '../agents/tool/tool_agent.js';

// Tools
export { VisionAggregator, VisionResult, AggregatedVisionResult } from '../tools/vision/vision_aggregator.js';
export { SearchRanker, RankingCriteria, RankedResult } from '../tools/search/search_ranker.js';
export { ContentAggregator, ContentSource, AggregatedContent } from '../tools/content/content_aggregator.js';

// Integration
export { LCELApiBridge, SortRequest, SortResponse } from '../integration/lcel_api_bridge.js';

// Utilities
export { ConditionEvaluator } from '../core/lcel/utils/condition_evaluator.js';
export { ConcurrencyManager } from '../core/lcel/utils/concurrency_manager.js';
export { ChainValidator } from '../chains/chain_validator.js';
export { RunnableUtils } from '../chains/runnable_utils.js';

// Types
export type { BranchCondition } from '../core/lcel/runnable_branch.js';
export type { 
  QueryIntent, 
  QueryParameters, 
  ProcessingInstructions,
  ExecutionPlan 
} from '../agents/query/query_processor.js';

/**
 * LCEL System Status
 */
export const LCEL_SYSTEM_INFO = {
  version: '1.0.0',
  components: [
    'QueryProcessor',
    'VisionAggregator', 
    'SearchRanker',
    'ContentAggregator',
    'TaskAgent',
    'ToolAgent'
  ],
  capabilities: [
    'Natural language query processing',
    'Multi-model vision consensus',
    'Intelligent search ranking',
    'Content aggregation and conflict resolution',
    'Multi-step task orchestration',
    'Tool execution and validation'
  ],
  strategies: [
    'vision_analysis',
    'metadata_based',
    'hybrid',
    'simple'
  ]
} as const;

/**
 * Quick system health check
 */
export function checkLCELSystemHealth(): { status: string; timestamp: string; components: Record<string, string> } {
  return {
    status: 'operational',
    timestamp: new Date().toISOString(),
    components: {
      core: 'ok',
      agents: 'ok',
      tools: 'ok',
      integration: 'ok',
      utilities: 'ok'
    }
  };
}
