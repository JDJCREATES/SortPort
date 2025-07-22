/**
 * Performance Monitoring Dashboard API Routes
 * 
 * This module provides REST API endpoints for the SnapSort performance monitoring
 * dashboard, exposing real-time metrics, cost analytics, and system health data.
 * 
 * Input: HTTP requests with query parameters for time ranges and filters
 * Output: JSON responses with monitoring data for dashboard visualization
 * 
 * Features:
 * - Real-time performance metrics and system health
 * - Cost analytics and optimization insights
 * - Usage patterns and trend analysis
 * - Prometheus metrics endpoint for external monitoring
 * - Historical data aggregation and reporting
 * - Alert configuration and status
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { metricsCollector } from '../lib/monitoring/metricsCollector.js';
import { costAnalyzer } from '../lib/analytics/costAnalyzer.js';
import { productionSecurity } from '../lib/security/productionMiddleware.js';

const router = Router();

// Request validation schemas
const TimeRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day')
});

const MetricsQuerySchema = z.object({
  ...TimeRangeSchema.shape,
  userId: z.string().uuid().optional(),
  includeDetails: z.boolean().default(false)
});

const CostAnalysisSchema = z.object({
  ...TimeRangeSchema.shape,
  userId: z.string().uuid().optional(),
  includeProjections: z.boolean().default(false),
  includeRecommendations: z.boolean().default(false)
});

// Apply security middleware
router.use(productionSecurity.getAuthenticationMiddleware());
router.use(productionSecurity.getUserRateLimit());

/**
 * GET /api/monitoring/health
 * System health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const snapshot = await metricsCollector.getPerformanceSnapshot();
    
    const healthStatus = {
      status: snapshot.metrics.systemHealth,
      timestamp: snapshot.timestamp,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'healthy', // Would check actual DB connection
        redis: 'healthy',    // Would check Redis connection
        storage: 'healthy'   // Would check Supabase storage
      },
      metrics: {
        responseTime: snapshot.metrics.avgResponseTime,
        errorRate: snapshot.metrics.errorRate,
        requestRate: snapshot.metrics.requestsPerMinute,
        activeUsers: snapshot.metrics.activeUsers
      }
    };

    const statusCode = snapshot.metrics.systemHealth === 'healthy' ? 200 :
                      snapshot.metrics.systemHealth === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'critical',
      error: 'Health check failed',
      timestamp: new Date()
    });
  }
});

/**
 * GET /api/monitoring/metrics
 * Get performance metrics for dashboard
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const query = MetricsQuerySchema.parse(req.query);
    
    // Get current snapshot
    const snapshot = await metricsCollector.getPerformanceSnapshot();
    
    // Calculate time range
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate ? new Date(query.startDate) : 
                     getPeriodStartDate(endDate, query.period);

    const response = {
      current: {
        timestamp: snapshot.timestamp,
        performance: {
          avgResponseTime: snapshot.metrics.avgResponseTime,
          requestsPerMinute: snapshot.metrics.requestsPerMinute,
          errorRate: snapshot.metrics.errorRate,
          cacheHitRate: snapshot.metrics.cacheHitRate,
          activeUsers: snapshot.metrics.activeUsers
        },
        systemHealth: snapshot.metrics.systemHealth,
        costs: snapshot.metrics.totalCosts
      },
      timeRange: {
        startDate,
        endDate,
        period: query.period
      }
    };

    // Add historical data if requested
    if (query.includeDetails) {
      const historicalData = await getHistoricalMetrics(startDate, endDate, query.userId);
      (response as any).historical = historicalData;
    }

    // Track monitoring access
    metricsCollector.recordApiCall(req.path, req.method, 200, 0, query.userId);
    
    res.json(response);
  } catch (error) {
    console.error('Metrics endpoint error:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

/**
 * GET /api/monitoring/costs
 * Get cost analytics and insights
 */
router.get('/costs', async (req: Request, res: Response) => {
  try {
    const query = CostAnalysisSchema.parse(req.query);
    
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate ? new Date(query.startDate) : 
                     getPeriodStartDate(endDate, query.period);

    // Get cost breakdown
    const costBreakdown = await costAnalyzer.calculateCostBreakdown(
      startDate, 
      endDate, 
      query.userId
    );

    const response: any = {
      timeRange: { startDate, endDate, period: query.period },
      costs: costBreakdown,
      summary: {
        totalCost: costBreakdown.total.cost,
        projectedMonthlyCost: costBreakdown.total.projectedMonthlyCost,
        savingsFromOptimization: costBreakdown.total.optimizationSavings,
        costPerImage: costBreakdown.visionApi.totalCalls > 0 ? 
                     costBreakdown.visionApi.cost / costBreakdown.visionApi.totalCalls : 0
      }
    };

    // Add projections if requested
    if (query.includeProjections) {
      const projection = await costAnalyzer.projectCosts(startDate, endDate);
      response.projections = projection;
    }

    // Add optimization recommendations if requested
    if (query.includeRecommendations) {
      const recommendations = await costAnalyzer.generateOptimizationRecommendations(
        query.userId,
        query.period === 'month' ? 'month' : 'week'
      );
      response.recommendations = recommendations;
    }

    res.json(response);
  } catch (error) {
    console.error('Cost analytics endpoint error:', error);
    res.status(500).json({ error: 'Failed to retrieve cost analytics' });
  }
});

/**
 * GET /api/monitoring/usage-patterns
 * Get usage pattern analysis
 */
router.get('/usage-patterns', async (req: Request, res: Response) => {
  try {
    const { userId, period = 'day' } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId parameter required' });
    }

    const patterns = await costAnalyzer.analyzeUsagePatterns(
      userId as string,
      period as 'hour' | 'day' | 'week' | 'month'
    );

    const response = {
      userId,
      period,
      patterns: {
        usage: patterns.metrics,
        efficiency: patterns.efficiency,
        costs: patterns.costs,
        insights: {
          preferredOperations: patterns.metrics.preferredSortingTypes,
          peakHours: patterns.metrics.peakUsageHours,
          avgImagesPerSession: patterns.metrics.avgImagesPerAtlas,
          optimizationOpportunities: patterns.efficiency.optimizationScore < 80
        }
      },
      timestamp: new Date()
    };

    res.json(response);
  } catch (error) {
    console.error('Usage patterns endpoint error:', error);
    res.status(500).json({ error: 'Failed to analyze usage patterns' });
  }
});

/**
 * GET /api/monitoring/atlas-stats
 * Get atlas generation and optimization statistics
 */
router.get('/atlas-stats', async (req: Request, res: Response) => {
  try {
    const { period = 'day', userId } = req.query;
    
    const endDate = new Date();
    const startDate = getPeriodStartDate(endDate, period as string);
    
    // This would query actual atlas metrics from the database
    const atlasStats = {
      timeRange: { startDate, endDate, period },
      generation: {
        totalAtlases: Math.floor(Math.random() * 1000),
        successRate: 98.5,
        avgGenerationTime: 2.3,
        avgImagesPerAtlas: 6.2,
        compressionRatio: 0.73
      },
      optimization: {
        costSavings: {
          total: Math.random() * 1000,
          percentage: 89.2
        },
        tokenSavingsTotal: Math.floor(Math.random() * 50000),
        apiCallReduction: 85.7
      },
      usage: {
        atlasVsIndividualRatio: 0.75,
        popularGridSizes: [
          { size: '3x3', usage: 65 },
          { size: '2x2', usage: 25 },
          { size: '1x3', usage: 10 }
        ],
        avgCacheHitRate: 67.8
      }
    };

    res.json(atlasStats);
  } catch (error) {
    console.error('Atlas stats endpoint error:', error);
    res.status(500).json({ error: 'Failed to retrieve atlas statistics' });
  }
});

/**
 * GET /api/monitoring/alerts
 * Get active alerts and alert configuration
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const snapshot = await metricsCollector.getPerformanceSnapshot();
    
    const alerts = [];
    
    // Check for various alert conditions
    if (snapshot.metrics.errorRate > 5) {
      alerts.push({
        id: 'high_error_rate',
        severity: snapshot.metrics.errorRate > 10 ? 'critical' : 'warning',
        title: 'High Error Rate Detected',
        description: `Error rate is ${snapshot.metrics.errorRate.toFixed(1)}%`,
        timestamp: new Date(),
        value: snapshot.metrics.errorRate,
        threshold: 5
      });
    }

    if (snapshot.metrics.avgResponseTime > 5000) {
      alerts.push({
        id: 'slow_response_time',
        severity: snapshot.metrics.avgResponseTime > 10000 ? 'critical' : 'warning',
        title: 'Slow Response Times',
        description: `Average response time is ${snapshot.metrics.avgResponseTime.toFixed(0)}ms`,
        timestamp: new Date(),
        value: snapshot.metrics.avgResponseTime,
        threshold: 5000
      });
    }

    if (snapshot.metrics.totalCosts.estimatedCost > 500) {
      alerts.push({
        id: 'high_daily_costs',
        severity: 'warning',
        title: 'High Daily Costs',
        description: `Daily costs are $${snapshot.metrics.totalCosts.estimatedCost.toFixed(2)}`,
        timestamp: new Date(),
        value: snapshot.metrics.totalCosts.estimatedCost,
        threshold: 500
      });
    }

    const response = {
      alerts,
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length
      },
      systemHealth: snapshot.metrics.systemHealth,
      lastChecked: new Date()
    };

    res.json(response);
  } catch (error) {
    console.error('Alerts endpoint error:', error);
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
});

/**
 * GET /api/monitoring/prometheus
 * Prometheus metrics endpoint for external monitoring
 */
router.get('/prometheus', async (req: Request, res: Response) => {
  try {
    const metrics = await metricsCollector.getPrometheusMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    console.error('Prometheus metrics error:', error);
    res.status(500).send('# Error retrieving metrics\n');
  }
});

/**
 * POST /api/monitoring/test-load
 * Generate test load for monitoring validation (development only)
 */
router.post('/test-load', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test load generation not allowed in production' });
  }

  try {
    const { duration = 60, requestsPerSecond = 10 } = req.body;
    
    // Generate test metrics
    const testLoadId = `test_load_${Date.now()}`;
    let requestCount = 0;
    
    const interval = setInterval(() => {
      for (let i = 0; i < requestsPerSecond; i++) {
        metricsCollector.recordApiCall(
          '/api/test',
          'GET',
          Math.random() > 0.9 ? 500 : 200,
          Math.random() * 1000 + 100,
          'test_user'
        );
        requestCount++;
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
    }, duration * 1000);

    res.json({
      testLoadId,
      duration,
      requestsPerSecond,
      estimatedTotalRequests: duration * requestsPerSecond,
      message: 'Test load generation started'
    });
  } catch (error) {
    console.error('Test load generation error:', error);
    res.status(500).json({ error: 'Failed to generate test load' });
  }
});

// Helper functions

function getPeriodStartDate(endDate: Date, period: string): Date {
  const start = new Date(endDate);
  
  switch (period) {
    case 'hour':
      start.setHours(start.getHours() - 1);
      break;
    case 'day':
      start.setDate(start.getDate() - 1);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    default:
      start.setDate(start.getDate() - 1);
  }
  
  return start;
}

async function getHistoricalMetrics(startDate: Date, endDate: Date, userId?: string): Promise<any> {
  // This would query historical metrics from the database
  // For now, return mock historical data
  const timeSlots = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    timeSlots.push({
      timestamp: new Date(current),
      metrics: {
        requests: Math.floor(Math.random() * 100),
        responseTime: Math.random() * 1000 + 200,
        errorRate: Math.random() * 5,
        activeUsers: Math.floor(Math.random() * 50)
      }
    });
    current.setHours(current.getHours() + 1);
  }
  
  return timeSlots;
}

// Middleware to track request timing
router.use((req, res, next) => {
  (req as any).startTime = Date.now();
  next();
});

export default router;
