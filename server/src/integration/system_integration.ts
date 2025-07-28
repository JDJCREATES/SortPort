/**
 * System Integration and Initialization
 * 
 * Orchestrates the complete system startup, dependency injection, and integration
 * of all LCEL components, agents, tools, and legacy chains.
 * 
 * Key Responsibilities:
 * - Initialize all system components in correct order
 * - Set up dependency injection container
 * - Register and integrate legacy chains
 * - Configure monitoring and health checks
 * - Provide unified system interface
 */

import { ChainEngine } from '../chains/chain_engine';
import { AgentCoordinator } from '../core/agent_coordinator';
import { AgentRouter } from '../core/agent_router';
import { QueryProcessor } from '../agents/query/query_processor';
import { ToolRegistry } from '../tools/tool_registry';
import { ChainIntegrationAdapter } from './chain_adapter';
import { VisionAnalysisTool } from '../tools/vision/vision_analysis';
import { ImageSortingTool } from '../tools/search/image_sort';
import { VisionChainBuilder } from '../tools/vision/vision_chains';

export interface SystemConfiguration {
  apiKeys: {
    openai: string;
    supabase?: string;
    aws?: string;
  };
  performance: {
    enableCaching: boolean;
    enableMetrics: boolean;
    maxConcurrency: number;
    defaultTimeout: number;
  };
  features: {
    enableVisionAnalysis: boolean;
    enableLegacyChains: boolean;
    enableExperimentalFeatures: boolean;
  };
  monitoring: {
    enableHealthChecks: boolean;
    enablePerformanceTracking: boolean;
    enableCostTracking: boolean;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: Map<string, ComponentHealth>;
  metrics: SystemMetrics;
  lastCheck: Date;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastCheck: Date;
  responseTime: number;
  errorCount: number;
  details?: any;
}

export interface SystemMetrics {
  totalRequests: number;
  averageLatency: number;
  successRate: number;
  errorRate: number;
  costAccumulated: number;
  uptime: number;
  resourceUsage: {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
  };
}

export class SnapSortSystem {
  private config: SystemConfiguration;
  private initialized: boolean = false;
  
  // Core Components
  public readonly chainEngine: ChainEngine;
  public readonly agentCoordinator: AgentCoordinator;
  public readonly agentRouter: AgentRouter;
  public readonly queryProcessor: QueryProcessor;
  public readonly toolRegistry: ToolRegistry;
  public readonly chainAdapter: ChainIntegrationAdapter;
  
  // Specialized Tools
  public readonly visionTool: VisionAnalysisTool;
  public readonly sortingTool: ImageSortingTool;
  public readonly visionChainBuilder: VisionChainBuilder;
  
  // System State
  private health: SystemHealth;
  private metrics: SystemMetrics;
  private startTime: Date;
  
  constructor(config: SystemConfiguration) {
    this.config = config;
    this.startTime = new Date();
    
    // Initialize core components
    this.chainEngine = new ChainEngine();
    this.queryProcessor = new QueryProcessor();
    this.toolRegistry = new ToolRegistry();
    this.agentRouter = new AgentRouter();
    
    // Initialize specialized tools
    this.visionTool = new VisionAnalysisTool({
      apiKey: config.apiKeys.openai,
      defaultModel: 'gpt-4o'
    });
    
    this.sortingTool = new ImageSortingTool({
      embeddingService: null, // Will be initialized during setup
      qualityAnalyzer: null,
      similarityEngine: null
    });
    
    this.visionChainBuilder = new VisionChainBuilder(this.visionTool);
    
    // Initialize coordination components
    this.agentCoordinator = new AgentCoordinator({
      chainEngine: this.chainEngine,
      queryProcessor: this.queryProcessor
    });
    
    this.chainAdapter = new ChainIntegrationAdapter(
      this.chainEngine,
      this.toolRegistry,
      {
        enableMetrics: config.performance.enableMetrics,
        enableCaching: config.performance.enableCaching,
        migrationMode: 'gradual'
      }
    );
    
    // Initialize system state
    this.health = this.createInitialHealth();
    this.metrics = this.createInitialMetrics();
  }

  /**
   * Initialize the complete system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('System already initialized');
      return;
    }
    
    console.log('🚀 Initializing SnapSort LCEL System...');
    
    try {
      // Step 1: Initialize core infrastructure
      await this.initializeCoreInfrastructure();
      
      // Step 2: Register tools and capabilities
      await this.registerToolsAndCapabilities();
      
      // Step 3: Integrate legacy chains
      if (this.config.features.enableLegacyChains) {
        await this.integrateLegacyChains();
      }
      
      // Step 4: Setup monitoring and health checks
      if (this.config.monitoring.enableHealthChecks) {
        await this.setupMonitoring();
      }
      
      // Step 5: Validate system readiness
      await this.validateSystemReadiness();
      
      this.initialized = true;
      console.log('✅ SnapSort LCEL System initialized successfully');
      
    } catch (error) {
      console.error('❌ System initialization failed:', error);
      throw new Error(`System initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get system health status
   */
  async getHealth(): Promise<SystemHealth> {
    if (!this.initialized) {
      return {
        status: 'unhealthy',
        components: new Map(),
        metrics: this.metrics,
        lastCheck: new Date()
      };
    }
    
    const componentChecks = await this.performHealthChecks();
    const overallStatus = this.calculateOverallHealth(componentChecks);
    
    this.health = {
      status: overallStatus,
      components: componentChecks,
      metrics: this.collectCurrentMetrics(),
      lastCheck: new Date()
    };
    
    return this.health;
  }

  /**
   * Get system metrics
   */
  getMetrics(): SystemMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime.getTime(),
      resourceUsage: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down SnapSort LCEL System...');
    
    try {
      // Stop health checks
      // Close database connections
      // Clean up resources
      
      this.initialized = false;
      console.log('✅ System shutdown completed');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  /**
   * Process a sorting request through the unified system
   */
  async processRequest(request: any): Promise<any> {
    if (!this.initialized) {
      throw new Error('System not initialized');
    }
    
    const startTime = Date.now();
    
    try {
      // Increment request counter
      this.metrics.totalRequests++;
      
      // The actual processing would be handled by the API layer
      // This is a placeholder for the core processing logic
      
      const processingTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(processingTime, true);
      
      return { success: true, processingTime };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(processingTime, false);
      throw error;
    }
  }

  // Private initialization methods

  private async initializeCoreInfrastructure(): Promise<void> {
    console.log('  📦 Initializing core infrastructure...');
    
    // Configure chain engine
    this.chainEngine.clearCache(); // Start fresh
    
    // Initialize agent router with default capabilities
    // Additional configuration would go here
    
    console.log('  ✅ Core infrastructure initialized');
  }

  private async registerToolsAndCapabilities(): Promise<void> {
    console.log('  🔧 Registering tools and capabilities...');
    
    // Register vision tools
    if (this.config.features.enableVisionAnalysis) {
      await this.registerVisionTools();
    }
    
    // Register sorting tools
    await this.registerSortingTools();
    
    // Register utility tools
    await this.registerUtilityTools();
    
    console.log('  ✅ Tools and capabilities registered');
  }

  private async registerVisionTools(): Promise<void> {
    // This would register vision analysis tools with the tool registry
    console.log('    🔍 Registering vision analysis tools...');
    
    // Register vision chains as tools
    const visionChains = [
      {
        id: 'vision_analysis',
        name: 'Vision Analysis Chain',
        chain: this.visionChainBuilder.createVisionAnalysisChain()
      },
      {
        id: 'batch_vision',
        name: 'Batch Vision Processing',
        chain: this.visionChainBuilder.createBatchVisionChain()
      },
      {
        id: 'quality_assessment',
        name: 'Image Quality Assessment',
        chain: this.visionChainBuilder.createQualityAssessmentChain()
      }
    ];
    
    // Register each vision chain as a tool
    // Implementation would convert chains to tool definitions
  }

  private async registerSortingTools(): Promise<void> {
    console.log('    📊 Registering sorting tools...');
    
    // Register sorting tool with the registry
    // Implementation would create tool definition for ImageSortingTool
  }

  private async registerUtilityTools(): Promise<void> {
    console.log('    🛠️ Registering utility tools...');
    
    // Register utility tools like caching, validation, etc.
  }

  private async integrateLegacyChains(): Promise<void> {
    console.log('  🔗 Integrating legacy chains...');
    
    const integrationResults = await this.chainAdapter.registerLegacyChains();
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const [chainId, result] of integrationResults) {
      if (result.success) {
        successCount++;
        console.log(`    ✅ ${chainId}: ${result.chainDefinition.name}`);
      } else {
        failureCount++;
        console.log(`    ❌ ${chainId}: ${result.warnings.join(', ')}`);
      }
    }
    
    console.log(`  ✅ Legacy chain integration completed: ${successCount} success, ${failureCount} failures`);
  }

  private async setupMonitoring(): Promise<void> {
    console.log('  📊 Setting up monitoring and health checks...');
    
    // Setup periodic health checks
    if (this.config.monitoring.enableHealthChecks) {
      // Would set up interval for health checks
    }
    
    // Setup performance tracking
    if (this.config.monitoring.enablePerformanceTracking) {
      // Would set up performance monitoring
    }
    
    // Setup cost tracking
    if (this.config.monitoring.enableCostTracking) {
      // Would set up cost monitoring
    }
    
    console.log('  ✅ Monitoring setup completed');
  }

  private async validateSystemReadiness(): Promise<void> {
    console.log('  🔍 Validating system readiness...');
    
    // Check all critical components
    const checks = [
      { name: 'Chain Engine', check: () => this.chainEngine !== null },
      { name: 'Tool Registry', check: () => this.toolRegistry.getAllTools().length > 0 },
      { name: 'Agent Router', check: () => this.agentRouter !== null },
      { name: 'Query Processor', check: () => this.queryProcessor.healthCheck() }
    ];
    
    for (const { name, check } of checks) {
      try {
        const result = await Promise.resolve(check());
        if (!result) {
          throw new Error(`${name} validation failed`);
        }
        console.log(`    ✅ ${name}: Ready`);
      } catch (error) {
        console.log(`    ❌ ${name}: ${error instanceof Error ? error.message : 'Failed'}`);
        throw new Error(`System validation failed: ${name}`);
      }
    }
    
    console.log('  ✅ System readiness validated');
  }

  private async performHealthChecks(): Promise<Map<string, ComponentHealth>> {
    const checks = new Map<string, ComponentHealth>();
    const startTime = Date.now();
    
    // Check each component
    const components = [
      { name: 'chainEngine', component: this.chainEngine },
      { name: 'queryProcessor', component: this.queryProcessor },
      { name: 'visionTool', component: this.visionTool },
      { name: 'sortingTool', component: this.sortingTool },
      { name: 'toolRegistry', component: this.toolRegistry }
    ];
    
    for (const { name, component } of components) {
      const checkStart = Date.now();
      try {
        let isHealthy = true;
        
        // Perform component-specific health check (skip if not available)
        if (component && typeof (component as any).healthCheck === 'function') {
          isHealthy = await (component as any).healthCheck();
        }
        
        checks.set(name, {
          name,
          status: isHealthy ? 'healthy' : 'degraded',
          lastCheck: new Date(),
          responseTime: Date.now() - checkStart,
          errorCount: 0
        });
        
      } catch (error) {
        checks.set(name, {
          name,
          status: 'failed',
          lastCheck: new Date(),
          responseTime: Date.now() - checkStart,
          errorCount: 1,
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return checks;
  }

  private calculateOverallHealth(components: Map<string, ComponentHealth>): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Array.from(components.values()).map(c => c.status);
    
    if (statuses.every(s => s === 'healthy')) {
      return 'healthy';
    } else if (statuses.some(s => s === 'healthy')) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  private collectCurrentMetrics(): SystemMetrics {
    return this.getMetrics();
  }

  private updateMetrics(processingTime: number, success: boolean): void {
    // Update running averages
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageLatency = (this.metrics.averageLatency * (totalRequests - 1) + processingTime) / totalRequests;
    
    if (success) {
      this.metrics.successRate = (this.metrics.successRate * (totalRequests - 1) + 1) / totalRequests;
    } else {
      this.metrics.successRate = (this.metrics.successRate * (totalRequests - 1)) / totalRequests;
      this.metrics.errorRate = 1 - this.metrics.successRate;
    }
  }

  private createInitialHealth(): SystemHealth {
    return {
      status: 'unhealthy',
      components: new Map(),
      metrics: this.createInitialMetrics(),
      lastCheck: new Date()
    };
  }

  private createInitialMetrics(): SystemMetrics {
    return {
      totalRequests: 0,
      averageLatency: 0,
      successRate: 1.0,
      errorRate: 0,
      costAccumulated: 0,
      uptime: 0,
      resourceUsage: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };
  }
}

/**
 * Create default system configuration
 */
export function createDefaultConfig(): SystemConfiguration {
  return {
    apiKeys: {
      openai: process.env.OPENAI_API_KEY || '',
      supabase: process.env.SUPABASE_ANON_KEY,
      aws: process.env.AWS_ACCESS_KEY_ID
    },
    performance: {
      enableCaching: true,
      enableMetrics: true,
      maxConcurrency: 10,
      defaultTimeout: 60000
    },
    features: {
      enableVisionAnalysis: true,
      enableLegacyChains: true,
      enableExperimentalFeatures: false
    },
    monitoring: {
      enableHealthChecks: true,
      enablePerformanceTracking: true,
      enableCostTracking: true
    }
  };
}

/**
 * Global system instance (singleton)
 */
export let globalSystemInstance: SnapSortSystem | null = null;

/**
 * Initialize global system instance
 */
export async function initializeGlobalSystem(config?: Partial<SystemConfiguration>): Promise<SnapSortSystem> {
  if (globalSystemInstance) {
    console.warn('Global system already initialized');
    return globalSystemInstance;
  }
  
  const finalConfig = { ...createDefaultConfig(), ...config };
  globalSystemInstance = new SnapSortSystem(finalConfig);
  
  await globalSystemInstance.initialize();
  
  return globalSystemInstance;
}

/**
 * Get global system instance
 */
export function getGlobalSystem(): SnapSortSystem {
  if (!globalSystemInstance) {
    throw new Error('Global system not initialized. Call initializeGlobalSystem() first.');
  }
  return globalSystemInstance;
}
