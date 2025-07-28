/**
 * Production-grade performance monitoring and metrics collection system
 * 
 * This module provides comprehensive metrics collection for the SnapSort image sorting system,
 * tracking performance, usage, costs, and system health across all components.
 * 
 * Input: System events, API calls, processing operations
 * Output: Structured metrics for monitoring dashboards and alerts
 * 
 * Features:
 * - Real-time performance metrics collection
 * - Cost tracking and optimization insights
 * - User behavior analytics
 * - System health monitoring
 * - Prometheus-compatible metrics export
 * - Custom dashboard data aggregation
 */

import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { createClient } from '@supabase/supabase-js';
import NodeCache from 'node-cache';
import { v4 as uuidv4 } from 'uuid';

// Initialize default system metrics
collectDefaultMetrics({ register });

export interface MetricEvent {
  type: 'api_call' | 'image_processing' | 'vision_analysis' | 'atlas_generation' | 'cache_operation' | 'error';
  operation: string;
  duration?: number;
  success: boolean;
  metadata?: Record<string, any>;
  userId?: string;
  timestamp?: Date;
}

export interface CostMetrics {
  visionApiCalls: number;
  visionTokensUsed: number;
  embeddingTokensUsed: number;
  estimatedCost: number;
  savingsFromAtlas: number;
}

export interface PerformanceSnapshot {
  id: string;
  timestamp: Date;
  metrics: {
    avgResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
    cacheHitRate: number;
    activeUsers: number;
    totalCosts: CostMetrics;
    systemHealth: 'healthy' | 'degraded' | 'critical';
  };
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class MetricsCollector {
  private cache: NodeCache;
  private metricsBuffer: MetricEvent[] = [];
  private flushInterval: NodeJS.Timeout;

  // Prometheus metrics
  private readonly apiCallsTotal: Counter<string>;
  private readonly requestDuration: Histogram<string>;
  private readonly activeUsers: Gauge<string>;
  private readonly visionApiCalls: Counter<string>;
  private readonly costTracker: Gauge<string>;
  private readonly cacheHitRate: Gauge<string>;
  private readonly errorRate: Gauge<string>;

  // Cost tracking constants
  private readonly VISION_COST_PER_TOKEN = 0.00001; // GPT-4V pricing
  private readonly EMBEDDING_COST_PER_TOKEN = 0.0000001; // text-embedding-3-small

  constructor() {
    this.cache = new NodeCache({ stdTTL: 300 }); // 5 minute TTL

    // Initialize Prometheus metrics
    this.apiCallsTotal = new Counter({
      name: 'snapsort_api_calls_total',
      help: 'Total number of API calls',
      labelNames: ['endpoint', 'method', 'status']
    });

    this.requestDuration = new Histogram({
      name: 'snapsort_request_duration_seconds',
      help: 'Request duration in seconds',
      labelNames: ['endpoint', 'method'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
    });

    this.activeUsers = new Gauge({
      name: 'snapsort_active_users',
      help: 'Number of active users in the last 5 minutes'
    });

    this.visionApiCalls = new Counter({
      name: 'snapsort_vision_api_calls_total',
      help: 'Total number of Vision API calls',
      labelNames: ['type', 'success']
    });

    this.costTracker = new Gauge({
      name: 'snapsort_estimated_costs_usd',
      help: 'Estimated costs in USD',
      labelNames: ['service']
    });

    this.cacheHitRate = new Gauge({
      name: 'snapsort_cache_hit_rate',
      help: 'Cache hit rate percentage'
    });

    this.errorRate = new Gauge({
      name: 'snapsort_error_rate',
      help: 'Error rate percentage'
    });

    // Start periodic metrics flushing
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, 30000); // Flush every 30 seconds

    register.registerMetric(this.apiCallsTotal);
    register.registerMetric(this.requestDuration);
    register.registerMetric(this.activeUsers);
    register.registerMetric(this.visionApiCalls);
    register.registerMetric(this.costTracker);
    register.registerMetric(this.cacheHitRate);
    register.registerMetric(this.errorRate);
  }

  /**
   * Record a metric event
   */
  recordEvent(event: MetricEvent): void {
    const enrichedEvent: MetricEvent = {
      ...event,
      timestamp: event.timestamp || new Date()
    };

    // Add to buffer for batch processing
    this.metricsBuffer.push(enrichedEvent);

    // Update Prometheus metrics immediately
    this.updatePrometheusMetrics(enrichedEvent);

    // Update real-time cache
    this.updateRealtimeMetrics(enrichedEvent);
  }

  /**
   * Record API call metrics
   */
  recordApiCall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    userId?: string
  ): void {
    this.recordEvent({
      type: 'api_call',
      operation: `${method} ${endpoint}`,
      duration,
      success: statusCode < 400,
      metadata: { endpoint, method, statusCode },
      userId
    });
  }

  /**
   * Record image processing metrics
   */
  recordImageProcessing(
    operation: string,
    imageCount: number,
    duration: number,
    success: boolean,
    metadata?: Record<string, any>
  ): void {
    this.recordEvent({
      type: 'image_processing',
      operation,
      duration,
      success,
      metadata: { imageCount, ...metadata }
    });
  }

  /**
   * Record Vision API usage and costs
   */
  recordVisionAnalysis(
    tokensUsed: number,
    imagesAnalyzed: number,
    atlasUsed: boolean,
    success: boolean,
    duration: number
  ): void {
    const estimatedCost = tokensUsed * this.VISION_COST_PER_TOKEN;
    const potentialSavings = atlasUsed ? estimatedCost * 8 : 0; // ~89% savings

    this.recordEvent({
      type: 'vision_analysis',
      operation: atlasUsed ? 'atlas_analysis' : 'individual_analysis',
      duration,
      success,
      metadata: {
        tokensUsed,
        imagesAnalyzed,
        estimatedCost,
        potentialSavings,
        atlasUsed
      }
    });

    // Update cost tracking
    this.updateCostMetrics('vision', estimatedCost);
  }

  /**
   * Record embedding generation costs
   */
  recordEmbeddingGeneration(tokensUsed: number, batchSize: number, success: boolean): void {
    const estimatedCost = tokensUsed * this.EMBEDDING_COST_PER_TOKEN;

    this.recordEvent({
      type: 'api_call',
      operation: 'embedding_generation',
      success,
      metadata: {
        tokensUsed,
        batchSize,
        estimatedCost
      }
    });

    this.updateCostMetrics('embeddings', estimatedCost);
  }

  /**
   * Record cache operations
   */
  recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string): void {
    this.recordEvent({
      type: 'cache_operation',
      operation,
      success: true,
      metadata: { key: key.substring(0, 50) } // Truncate for privacy
    });

    this.updateCacheMetrics(operation);
  }

  /**
   * Update Prometheus metrics in real-time
   */
  private updatePrometheusMetrics(event: MetricEvent): void {
    switch (event.type) {
      case 'api_call':
        const { endpoint, method, statusCode } = event.metadata || {};
        this.apiCallsTotal
          .labels(endpoint || 'unknown', method || 'unknown', statusCode?.toString() || 'unknown')
          .inc();
        
        if (event.duration) {
          this.requestDuration
            .labels(endpoint || 'unknown', method || 'unknown')
            .observe(event.duration / 1000); // Convert to seconds
        }
        break;

      case 'vision_analysis':
        this.visionApiCalls
          .labels(event.operation, event.success.toString())
          .inc();
        break;
    }

    // Update active users
    if (event.userId) {
      this.updateActiveUsers(event.userId);
    }
  }

  /**
   * Update real-time metrics cache
   */
  private updateRealtimeMetrics(event: MetricEvent): void {
    const now = Date.now();
    const minute = Math.floor(now / 60000);

    // Request rate tracking
    const requestKey = `requests_${minute}`;
    const currentRequests = this.cache.get<number>(requestKey) || 0;
    this.cache.set(requestKey, currentRequests + 1, 60);

    // Error rate tracking
    if (!event.success) {
      const errorKey = `errors_${minute}`;
      const currentErrors = this.cache.get<number>(errorKey) || 0;
      this.cache.set(errorKey, currentErrors + 1, 60);
    }

    // Response time tracking
    if (event.duration) {
      const responseTimeKey = 'response_times';
      const responseTimes = this.cache.get<number[]>(responseTimeKey) || [];
      responseTimes.push(event.duration);
      if (responseTimes.length > 100) responseTimes.shift(); // Keep last 100
      this.cache.set(responseTimeKey, responseTimes, 300);
    }
  }

  /**
   * Update active users tracking
   */
  private updateActiveUsers(userId: string): void {
    const userKey = `user_${userId}`;
    this.cache.set(userKey, Date.now(), 300); // 5 minute activity window
    
    // Count active users
    const activeCount = this.cache.keys().filter(key => key.startsWith('user_')).length;
    this.activeUsers.set(activeCount);
  }

  /**
   * Update cost metrics
   */
  private updateCostMetrics(service: string, cost: number): void {
    const costKey = `cost_${service}`;
    const currentCost = this.cache.get<number>(costKey) || 0;
    const newCost = currentCost + cost;
    this.cache.set(costKey, newCost, 86400); // 24 hour cost accumulation
    
    this.costTracker.labels(service).set(newCost);
  }

  /**
   * Update cache hit rate metrics
   */
  private updateCacheMetrics(operation: string): void {
    const hits = this.cache.get<number>('cache_hits') || 0;
    const total = this.cache.get<number>('cache_total') || 0;

    if (operation === 'hit') {
      this.cache.set('cache_hits', hits + 1, 3600);
    }
    this.cache.set('cache_total', total + 1, 3600);

    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    this.cacheHitRate.set(hitRate);
  }

  /**
   * Get current performance snapshot
   */
  async getPerformanceSnapshot(): Promise<PerformanceSnapshot> {
    const now = Date.now();
    const minute = Math.floor(now / 60000);

    // Calculate metrics from cache
    const requests = this.cache.get<number>(`requests_${minute}`) || 0;
    const errors = this.cache.get<number>(`errors_${minute}`) || 0;
    const responseTimes = this.cache.get<number[]>('response_times') || [];
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    const errorRate = requests > 0 ? (errors / requests) * 100 : 0;
    const cacheHitRate = this.cache.get<number>('cache_hit_rate') || 0;
    const activeUsers = this.cache.keys().filter(key => key.startsWith('user_')).length;

    // Calculate total costs
    const visionCosts = this.cache.get<number>('cost_vision') || 0;
    const embeddingCosts = this.cache.get<number>('cost_embeddings') || 0;

    const systemHealth: 'healthy' | 'degraded' | 'critical' = 
      errorRate > 10 ? 'critical' :
      errorRate > 5 || avgResponseTime > 5000 ? 'degraded' : 'healthy';

    return {
      id: uuidv4(),
      timestamp: new Date(),
      metrics: {
        avgResponseTime,
        requestsPerMinute: requests,
        errorRate,
        cacheHitRate,
        activeUsers,
        totalCosts: {
          visionApiCalls: 0, // Will be calculated from events
          visionTokensUsed: 0,
          embeddingTokensUsed: 0,
          estimatedCost: visionCosts + embeddingCosts,
          savingsFromAtlas: 0
        },
        systemHealth
      }
    };
  }

  /**
   * Flush accumulated metrics to database
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const events = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      // Aggregate events for efficient storage
      const aggregated = this.aggregateEvents(events);
      
      // Store in Supabase
      const { error } = await supabase
        .from('metrics_events')
        .insert(aggregated);

      if (error) {
        console.error('Failed to flush metrics:', error);
        // Re-add events to buffer for retry
        this.metricsBuffer.unshift(...events);
      }

    } catch (error) {
      console.error('Metrics flush error:', error);
      // Re-add events to buffer for retry
      this.metricsBuffer.unshift(...events);
    }
  }

  /**
   * Aggregate events for efficient storage
   */
  private aggregateEvents(events: MetricEvent[]): any[] {
    const aggregates = new Map<string, any>();

    events.forEach(event => {
      const key = `${event.type}_${event.operation}_${Math.floor(event.timestamp!.getTime() / 60000)}`;
      
      if (!aggregates.has(key)) {
        aggregates.set(key, {
          event_type: event.type,
          operation: event.operation,
          minute_timestamp: new Date(Math.floor(event.timestamp!.getTime() / 60000) * 60000),
          count: 0,
          success_count: 0,
          total_duration: 0,
          unique_users: new Set(),
          metadata: {}
        });
      }

      const agg = aggregates.get(key)!;
      agg.count++;
      if (event.success) agg.success_count++;
      if (event.duration) agg.total_duration += event.duration;
      if (event.userId) agg.unique_users.add(event.userId);
      
      // Merge metadata
      if (event.metadata) {
        Object.assign(agg.metadata, event.metadata);
      }
    });

    // Convert to array and clean up
    return Array.from(aggregates.values()).map(agg => {
      const result: any = {
        ...agg,
        unique_users_count: agg.unique_users.size,
        avg_duration: agg.count > 0 ? agg.total_duration / agg.count : 0,
        success_rate: agg.count > 0 ? agg.success_count / agg.count : 0,
        metadata: JSON.stringify(agg.metadata)
      };
      // Remove the Set object before sending to database
      delete result.unique_users;
      return result;
    });
  }

  /**
   * Get Prometheus metrics for scraping
   */
  async getPrometheusMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    clearInterval(this.flushInterval);
    this.flushMetrics(); // Final flush
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
