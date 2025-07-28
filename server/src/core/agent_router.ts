/**
 * Agent Router
 * 
 * Routes requests to appropriate agents based on query analysis, capabilities,
 * and current system load. Provides intelligent agent selection and load balancing.
 * 
 * Input: Routing requests with query analysis and agent requirements
 * Output: Selected agents with routing decisions and load balancing recommendations
 * 
 * Key Methods:
 * - route(query, context): Route query to optimal agent combination
 * - analyzeQuery(query): Analyze query requirements and complexity
 * - selectAgent(requirements): Select best agent for specific requirements
 * - getAgentCapabilities(agentType): Get capabilities of agent type
 * - calculateRoutingScore(agent, requirements): Score agent fitness for task
 * - balanceLoad(agents): Balance load across selected agents
 * - monitorRouting(): Monitor routing performance and efficiency
 */

import { 
  AgentType, 
  AgentSpec, 
  Priority, 
  CoordinationStrategy, 
  ResourceRequirements 
} from './agent_coordinator.js';
import { ProcessedQuery, QueryIntent, IntentType } from '../agents/query/query_processor.js';

export interface RoutingRequest {
  query: string;
  processedQuery?: ProcessedQuery;
  context: RoutingContext;
  constraints: RoutingConstraints;
  preferences?: RoutingPreferences;
}

export interface RoutingContext {
  userId: string;
  images: any[];
  imageCount: number;
  sessionHistory?: SessionHistory[];
  userPreferences?: UserPreferences;
  systemLoad?: SystemLoadInfo;
}

export interface RoutingConstraints {
  maxAgents: number;
  maxCost: number;
  maxDuration: number;
  requiredCapabilities: string[];
  excludedAgents?: string[];
  priorityLevel: Priority;
}

export interface RoutingPreferences {
  preferSpeed: boolean;
  preferAccuracy: boolean;
  preferCost: boolean;
  allowParallel: boolean;
  useVision: boolean;
  cacheResults: boolean;
}

export interface RoutingResult {
  selectedAgents: SelectedAgent[];
  routingStrategy: CoordinationStrategy;
  estimatedCost: number;
  estimatedDuration: number;
  confidence: number;
  reasoning: string;
  alternativeRoutes?: AlternativeRoute[];
  warnings?: string[];
}

export interface SelectedAgent {
  agentType: AgentType;
  agentId: string;
  capabilities: string[];
  score: number;
  priority: Priority;
  config: AgentConfig;
  estimatedLoad: number;
  reasoning: string;
}

export interface AgentConfig {
  chains: string[];
  parameters: Record<string, any>;
  resourceLimits: ResourceRequirements;
  timeout: number;
  retryAttempts: number;
}

export interface AlternativeRoute {
  agents: SelectedAgent[];
  strategy: CoordinationStrategy;
  score: number;
  tradeoffs: string[];
}

export interface SessionHistory {
  query: string;
  selectedAgents: AgentType[];
  success: boolean;
  duration: number;
  userSatisfaction?: number;
  timestamp: Date;
}

export interface UserPreferences {
  preferredAgents: AgentType[];
  maxCost: number;
  speedVsAccuracy: 'speed' | 'accuracy' | 'balanced';
  useAdvancedFeatures: boolean;
}

export interface SystemLoadInfo {
  agentUtilization: Map<AgentType, number>;
  queueLengths: Map<AgentType, number>;
  avgResponseTime: Map<AgentType, number>;
  errorRates: Map<AgentType, number>;
}

export interface AgentCapabilities {
  type: AgentType;
  capabilities: string[];
  supportedChains: string[];
  resourceRequirements: ResourceRequirements;
  performance: PerformanceProfile;
  availability: number;
}

export interface PerformanceProfile {
  avgLatency: number;
  throughput: number;
  errorRate: number;
  costPerOperation: number;
  qualityScore: number;
}

export class AgentRouter {
  private agentRegistry: Map<AgentType, AgentCapabilities>;
  private routingHistory: RoutingHistory;
  private loadMonitor: LoadMonitor;
  private routingStrategy: RoutingStrategyEngine;
  
  constructor() {
    this.agentRegistry = new Map();
    this.routingHistory = new RoutingHistory();
    this.loadMonitor = new LoadMonitor();
    this.routingStrategy = new RoutingStrategyEngine();
    
    this.initializeAgentRegistry();
  }

  /**
   * Route query to optimal agent combination
   */
  async route(request: RoutingRequest): Promise<RoutingResult> {
    const startTime = Date.now();
    
    try {
      // Analyze query if not already processed
      const processedQuery = request.processedQuery || 
        await this.analyzeQuery(request.query, request.context);
      
      // Extract requirements from processed query
      const requirements = this.extractRequirements(processedQuery as ProcessedQuery, request.constraints);
      
      // Find candidate agents
      const candidates = await this.findCandidateAgents(requirements);
      
      // Score and select agents
      const selectedAgents = await this.selectOptimalAgents(
        candidates, 
        requirements, 
        request.constraints,
        request.preferences
      );
      
      // Determine coordination strategy
      const strategy = this.determineCoordinationStrategy(
        selectedAgents,
        processedQuery as ProcessedQuery,
        request.preferences
      );
      
      // Calculate estimates
      const estimates = this.calculateEstimates(selectedAgents, strategy);
      
      // Generate alternative routes
      const alternatives = await this.generateAlternativeRoutes(
        candidates,
        requirements,
        selectedAgents
      );
      
      // Build routing result
      const result: RoutingResult = {
        selectedAgents,
        routingStrategy: strategy,
        estimatedCost: estimates.cost,
        estimatedDuration: estimates.duration,
        confidence: this.calculateRoutingConfidence(selectedAgents, requirements),
        reasoning: this.generateRoutingReasoning(selectedAgents, strategy, processedQuery as ProcessedQuery),
        alternativeRoutes: alternatives,
        warnings: this.generateWarnings(selectedAgents, requirements)
      };
      
      // Record routing decision
      this.routingHistory.record({
        request,
        result,
        timestamp: new Date(),
        duration: Date.now() - startTime
      });
      
      return result;
      
    } catch (error) {
      throw new Error(`Routing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze query requirements and complexity
   */
  async analyzeQuery(query: string, context: RoutingContext): Promise<QueryAnalysis> {
    const complexity = this.calculateQueryComplexity(query, context);
    const requiredCapabilities = this.identifyRequiredCapabilities(query);
    const resourceEstimate = this.estimateResourceNeeds(query, context);
    
    return {
      query,
      complexity,
      requiredCapabilities,
      resourceEstimate,
      recommendedAgents: this.recommendAgentsForQuery(query),
      parallelizable: this.isQueryParallelizable(query),
      cacheable: this.isQueryCacheable(query)
    };
  }

  /**
   * Select best agent for specific requirements
   */
  async selectAgent(requirements: AgentRequirements): Promise<SelectedAgent | null> {
    const candidates = await this.findCandidateAgents(requirements);
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Score candidates
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const score = await this.calculateRoutingScore(candidate, requirements);
        return { candidate, score };
      })
    );
    
    // Sort by score and select best
    scoredCandidates.sort((a, b) => b.score - a.score);
    const best = scoredCandidates[0];
    
    return this.buildSelectedAgent(best.candidate, best.score, requirements);
  }

  /**
   * Get capabilities of agent type
   */
  getAgentCapabilities(agentType: AgentType): AgentCapabilities | undefined {
    return this.agentRegistry.get(agentType);
  }

  /**
   * Calculate routing score for agent fitness
   */
  async calculateRoutingScore(
    agent: AgentCapabilities,
    requirements: AgentRequirements
  ): Promise<number> {
    let score = 0;
    
    // Capability match score (40%)
    const capabilityScore = this.calculateCapabilityMatch(agent.capabilities, requirements.capabilities);
    score += capabilityScore * 0.4;
    
    // Performance score (30%)
    const performanceScore = this.calculatePerformanceScore(agent.performance, requirements);
    score += performanceScore * 0.3;
    
    // Availability score (20%)
    const availabilityScore = agent.availability;
    score += availabilityScore * 0.2;
    
    // Load score (10%)
    const loadScore = 1 - (this.loadMonitor.getUtilization(agent.type) || 0);
    score += loadScore * 0.1;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Balance load across selected agents
   */
  async balanceLoad(agents: SelectedAgent[]): Promise<LoadBalancingResult> {
    const currentLoads = new Map<AgentType, number>();
    
    // Get current load for each agent type
    for (const agent of agents) {
      const load = this.loadMonitor.getUtilization(agent.agentType) || 0;
      currentLoads.set(agent.agentType, load);
    }
    
    // Calculate optimal distribution
    const distribution = this.calculateOptimalDistribution(agents, currentLoads);
    
    return {
      distribution,
      estimatedBalance: this.calculateLoadBalance(distribution),
      recommendations: this.generateLoadBalancingRecommendations(distribution)
    };
  }

  /**
   * Monitor routing performance and efficiency
   */
  async monitorRouting(): Promise<RoutingMetrics> {
    const metrics = this.routingHistory.getMetrics();
    const systemLoad = this.loadMonitor.getSystemLoad();
    
    return {
      totalRoutingRequests: metrics.totalRequests,
      avgRoutingTime: metrics.avgRoutingTime,
      successRate: metrics.successRate,
      agentUtilization: systemLoad.agentUtilization,
      costEfficiency: metrics.costEfficiency,
      userSatisfaction: metrics.avgUserSatisfaction,
      routingAccuracy: this.calculateRoutingAccuracy()
    };
  }

  /**
   * Register agent capabilities
   */
  registerAgent(capabilities: AgentCapabilities): void {
    this.agentRegistry.set(capabilities.type, capabilities);
    console.log(`Registered agent capabilities: ${capabilities.type}`);
  }

  /**
   * Update agent availability
   */
  updateAgentAvailability(agentType: AgentType, availability: number): void {
    const capabilities = this.agentRegistry.get(agentType);
    if (capabilities) {
      capabilities.availability = availability;
    }
  }

  // Private helper methods
  private initializeAgentRegistry(): void {
    // Initialize with default agent capabilities
    const defaultAgents: AgentCapabilities[] = [
      {
        type: AgentType.QUERY_AGENT,
        capabilities: ['query_processing', 'intent_classification', 'parameter_extraction'],
        supportedChains: ['query_chains'],
        resourceRequirements: {
          memory: 256,
          cpu: 0.5,
          network: 0.1,
          storage: 0,
          estimatedDuration: 1000,
          estimatedCost: 0.001
        },
        performance: {
          avgLatency: 500,
          throughput: 100,
          errorRate: 0.01,
          costPerOperation: 0.001,
          qualityScore: 0.9
        },
        availability: 1.0
      },
      {
        type: AgentType.VISION_AGENT,
        capabilities: ['image_analysis', 'feature_extraction', 'content_recognition'],
        supportedChains: ['vision_chains'],
        resourceRequirements: {
          memory: 1024,
          cpu: 2.0,
          network: 0.5,
          storage: 100,
          estimatedDuration: 5000,
          estimatedCost: 0.02
        },
        performance: {
          avgLatency: 3000,
          throughput: 20,
          errorRate: 0.05,
          costPerOperation: 0.02,
          qualityScore: 0.95
        },
        availability: 0.8
      },
      {
        type: AgentType.SEARCH_AGENT,
        capabilities: ['semantic_search', 'similarity_matching', 'ranking'],
        supportedChains: ['search_chains', 'ranking_chains'],
        resourceRequirements: {
          memory: 512,
          cpu: 1.0,
          network: 0.2,
          storage: 50,
          estimatedDuration: 2000,
          estimatedCost: 0.005
        },
        performance: {
          avgLatency: 1500,
          throughput: 50,
          errorRate: 0.02,
          costPerOperation: 0.005,
          qualityScore: 0.92
        },
        availability: 0.95
      }
    ];
    
    for (const agent of defaultAgents) {
      this.registerAgent(agent);
    }
  }

  private extractRequirements(
    processedQuery: ProcessedQuery,
    constraints: RoutingConstraints
  ): AgentRequirements {
    const capabilities: string[] = [];
    
    // Map query intent to required capabilities
    switch (processedQuery.intent.primary) {
      case IntentType.SORT_BY_CONTENT:
        capabilities.push('content_analysis', 'similarity_matching', 'ranking');
        break;
      case IntentType.SORT_BY_TIME:
        capabilities.push('temporal_analysis', 'metadata_processing');
        break;
      case IntentType.CREATE_ALBUMS:
        capabilities.push('clustering', 'album_creation', 'content_analysis');
        break;
      case IntentType.SEARCH_SIMILAR:
        capabilities.push('semantic_search', 'similarity_matching');
        break;
      default:
        capabilities.push('general_processing');
    }
    
    // Add vision capabilities if needed
    if (processedQuery.processingInstructions.useVision) {
      capabilities.push('image_analysis', 'feature_extraction');
    }
    
    return {
      capabilities: [...capabilities, ...constraints.requiredCapabilities],
      priority: constraints.priorityLevel,
      maxCost: constraints.maxCost,
      maxDuration: constraints.maxDuration,
      complexity: processedQuery.metadata.complexityScore || 0.5
    };
  }

  private async findCandidateAgents(requirements: AgentRequirements): Promise<AgentCapabilities[]> {
    const candidates: AgentCapabilities[] = [];
    
    for (const [type, capabilities] of this.agentRegistry) {
      // Check if agent has required capabilities
      const hasRequiredCapabilities = requirements.capabilities.every(
        req => capabilities.capabilities.includes(req)
      );
      
      if (hasRequiredCapabilities && capabilities.availability > 0.1) {
        candidates.push(capabilities);
      }
    }
    
    return candidates;
  }

  private async selectOptimalAgents(
    candidates: AgentCapabilities[],
    requirements: AgentRequirements,
    constraints: RoutingConstraints,
    preferences?: RoutingPreferences
  ): Promise<SelectedAgent[]> {
    const selected: SelectedAgent[] = [];
    const maxAgents = Math.min(constraints.maxAgents, candidates.length);
    
    // Score all candidates
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const score = await this.calculateRoutingScore(candidate, requirements);
        return { candidate, score };
      })
    );
    
    // Sort by score
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    // Select top agents up to limit
    for (let i = 0; i < maxAgents && i < scoredCandidates.length; i++) {
      const { candidate, score } = scoredCandidates[i];
      const selectedAgent = this.buildSelectedAgent(candidate, score, requirements);
      selected.push(selectedAgent);
    }
    
    return selected;
  }

  private buildSelectedAgent(
    capabilities: AgentCapabilities,
    score: number,
    requirements: AgentRequirements
  ): SelectedAgent {
    return {
      agentType: capabilities.type,
      agentId: `${capabilities.type}_${Date.now()}`,
      capabilities: capabilities.capabilities,
      score,
      priority: requirements.priority,
      config: {
        chains: capabilities.supportedChains,
        parameters: {},
        resourceLimits: capabilities.resourceRequirements,
        timeout: 30000,
        retryAttempts: 3
      },
      estimatedLoad: this.loadMonitor.getUtilization(capabilities.type) || 0,
      reasoning: `Selected for ${capabilities.capabilities.join(', ')} capabilities with score ${score.toFixed(3)}`
    };
  }

  private determineCoordinationStrategy(
    agents: SelectedAgent[],
    processedQuery: ProcessedQuery,
    preferences?: RoutingPreferences
  ): CoordinationStrategy {
    if (agents.length === 1) {
      return CoordinationStrategy.SEQUENTIAL;
    }
    
    if (preferences?.allowParallel && this.canRunInParallel(agents, processedQuery)) {
      return CoordinationStrategy.PARALLEL;
    }
    
    if (this.requiresSequentialProcessing(processedQuery)) {
      return CoordinationStrategy.SEQUENTIAL;
    }
    
    return CoordinationStrategy.HYBRID;
  }

  private calculateEstimates(
    agents: SelectedAgent[],
    strategy: CoordinationStrategy
  ): { cost: number; duration: number } {
    const totalCost = agents.reduce((sum, agent) => 
      sum + agent.config.resourceLimits.estimatedCost, 0
    );
    
    let totalDuration: number;
    if (strategy === CoordinationStrategy.PARALLEL) {
      totalDuration = Math.max(...agents.map(agent => 
        agent.config.resourceLimits.estimatedDuration
      ));
    } else {
      totalDuration = agents.reduce((sum, agent) => 
        sum + agent.config.resourceLimits.estimatedDuration, 0
      );
    }
    
    return { cost: totalCost, duration: totalDuration };
  }

  private calculateRoutingConfidence(
    agents: SelectedAgent[],
    requirements: AgentRequirements
  ): number {
    if (agents.length === 0) return 0;
    
    const avgScore = agents.reduce((sum, agent) => sum + agent.score, 0) / agents.length;
    const capabilityCoverage = this.calculateCapabilityCoverage(agents, requirements);
    
    return (avgScore + capabilityCoverage) / 2;
  }

  private generateRoutingReasoning(
    agents: SelectedAgent[],
    strategy: CoordinationStrategy,
    processedQuery: ProcessedQuery
  ): string {
    const agentTypes = agents.map(a => a.agentType).join(', ');
    const intentDescription = processedQuery.intent.primary.replace(/_/g, ' ');
    
    return `Selected ${agents.length} agent(s) (${agentTypes}) for ${intentDescription} using ${strategy} coordination. ` +
           `Average confidence: ${(agents.reduce((sum, a) => sum + a.score, 0) / agents.length).toFixed(2)}`;
  }

  private generateWarnings(
    agents: SelectedAgent[],
    requirements: AgentRequirements
  ): string[] {
    const warnings: string[] = [];
    
    if (agents.length === 0) {
      warnings.push('No suitable agents found for requirements');
    }
    
    const highLoadAgents = agents.filter(a => a.estimatedLoad > 0.8);
    if (highLoadAgents.length > 0) {
      warnings.push(`High load detected on ${highLoadAgents.length} agent(s)`);
    }
    
    const lowScoreAgents = agents.filter(a => a.score < 0.5);
    if (lowScoreAgents.length > 0) {
      warnings.push(`${lowScoreAgents.length} agent(s) have low fitness scores`);
    }
    
    return warnings;
  }

  // Additional helper methods would be implemented here...
  private calculateQueryComplexity(query: string, context: RoutingContext): number {
    // Simple complexity calculation based on query length and image count
    const queryComplexity = Math.min(query.length / 100, 1);
    const imageComplexity = Math.min(context.imageCount / 100, 1);
    return (queryComplexity + imageComplexity) / 2;
  }

  private identifyRequiredCapabilities(query: string): string[] {
    const capabilities: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('sort') || lowerQuery.includes('order')) {
      capabilities.push('sorting', 'ranking');
    }
    if (lowerQuery.includes('similar') || lowerQuery.includes('like')) {
      capabilities.push('similarity_matching');
    }
    if (lowerQuery.includes('album') || lowerQuery.includes('group')) {
      capabilities.push('clustering', 'album_creation');
    }
    
    return capabilities;
  }

  private estimateResourceNeeds(query: string, context: RoutingContext): ResourceRequirements {
    const baseMemory = 256;
    const baseCpu = 0.5;
    const imageMultiplier = Math.log(context.imageCount + 1);
    
    return {
      memory: baseMemory * imageMultiplier,
      cpu: baseCpu * imageMultiplier,
      network: 0.1,
      storage: 0,
      estimatedDuration: 1000 * imageMultiplier,
      estimatedCost: 0.001 * imageMultiplier
    };
  }

  private recommendAgentsForQuery(query: string): AgentType[] {
    // Simple recommendation logic
    return [AgentType.QUERY_AGENT, AgentType.SEARCH_AGENT];
  }

  private isQueryParallelizable(query: string): boolean {
    // Simple check for parallelizable operations
    return !query.toLowerCase().includes('sequential') && 
           !query.toLowerCase().includes('order');
  }

  private isQueryCacheable(query: string): boolean {
    // Most queries are cacheable unless they're time-sensitive
    return !query.toLowerCase().includes('recent') && 
           !query.toLowerCase().includes('now');
  }

  private calculateCapabilityMatch(
    agentCapabilities: string[],
    requiredCapabilities: string[]
  ): number {
    if (requiredCapabilities.length === 0) return 1;
    
    const matches = requiredCapabilities.filter(req => 
      agentCapabilities.includes(req)
    ).length;
    
    return matches / requiredCapabilities.length;
  }

  private calculatePerformanceScore(
    performance: PerformanceProfile,
    requirements: AgentRequirements
  ): number {
    // Weighted performance score
    const latencyScore = Math.max(0, 1 - (performance.avgLatency / 10000));
    const errorScore = Math.max(0, 1 - performance.errorRate);
    const qualityScore = performance.qualityScore;
    
    return (latencyScore * 0.3 + errorScore * 0.3 + qualityScore * 0.4);
  }

  private canRunInParallel(agents: SelectedAgent[], processedQuery: ProcessedQuery): boolean {
    // Check if agents can run in parallel based on dependencies
    return true; // Simplified - would check actual dependencies
  }

  private requiresSequentialProcessing(processedQuery: ProcessedQuery): boolean {
    // Check if query requires sequential processing
    return processedQuery.intent.primary === IntentType.SORT_BY_TIME;
  }

  private calculateCapabilityCoverage(
    agents: SelectedAgent[],
    requirements: AgentRequirements
  ): number {
    const allCapabilities = new Set<string>();
    agents.forEach(agent => {
      agent.capabilities.forEach(cap => allCapabilities.add(cap));
    });
    
    const coveredRequirements = requirements.capabilities.filter(req => 
      allCapabilities.has(req)
    ).length;
    
    return requirements.capabilities.length > 0 
      ? coveredRequirements / requirements.capabilities.length 
      : 1;
  }

  private async generateAlternativeRoutes(
    candidates: AgentCapabilities[],
    requirements: AgentRequirements,
    selectedAgents: SelectedAgent[]
  ): Promise<AlternativeRoute[]> {
    // Generate alternative routing options
    return []; // Simplified implementation
  }

  private calculateOptimalDistribution(
    agents: SelectedAgent[],
    currentLoads: Map<AgentType, number>
  ): Map<string, number> {
    // Calculate optimal load distribution
    return new Map();
  }

  private calculateLoadBalance(distribution: Map<string, number>): number {
    // Calculate load balance metric
    return 1.0;
  }

  private generateLoadBalancingRecommendations(
    distribution: Map<string, number>
  ): string[] {
    return [];
  }

  private calculateRoutingAccuracy(): number {
    return this.routingHistory.getAccuracy();
  }
}

// Supporting interfaces and classes
export interface QueryAnalysis {
  query: string;
  complexity: number;
  requiredCapabilities: string[];
  resourceEstimate: ResourceRequirements;
  recommendedAgents: AgentType[];
  parallelizable: boolean;
  cacheable: boolean;
}

export interface AgentRequirements {
  capabilities: string[];
  priority: Priority;
  maxCost: number;
  maxDuration: number;
  complexity: number;
}

export interface LoadBalancingResult {
  distribution: Map<string, number>;
  estimatedBalance: number;
  recommendations: string[];
}

export interface RoutingMetrics {
  totalRoutingRequests: number;
  avgRoutingTime: number;
  successRate: number;
  agentUtilization: Map<AgentType, number>;
  costEfficiency: number;
  userSatisfaction: number;
  routingAccuracy: number;
}

// Placeholder classes
class RoutingHistory {
  private history: any[] = [];
  
  record(entry: any): void {
    this.history.push(entry);
  }
  
  getMetrics(): any {
    return {
      totalRequests: this.history.length,
      avgRoutingTime: 500,
      successRate: 0.95,
      costEfficiency: 0.8,
      avgUserSatisfaction: 0.85
    };
  }
  
  getAccuracy(): number {
    return 0.9;
  }
}

class LoadMonitor {
  private utilization = new Map<AgentType, number>();
  
  getUtilization(agentType: AgentType): number {
    return this.utilization.get(agentType) || 0;
  }
  
  getSystemLoad(): SystemLoadInfo {
    return {
      agentUtilization: new Map(),
      queueLengths: new Map(),
      avgResponseTime: new Map(),
      errorRates: new Map()
    };
  }
}

class RoutingStrategyEngine {
  // Would implement sophisticated routing strategy algorithms
}
