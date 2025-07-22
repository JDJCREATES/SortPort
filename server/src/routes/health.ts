import { Router } from 'express';
import { ApiResponse } from '../types/api.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Basic health check
router.get('/', asyncHandler(async (req, res) => {
  const response: ApiResponse = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substring(7),
      version: '1.0.0'
    }
  };

  res.json(response);
}));

// Detailed health check with dependencies
router.get('/detailed', asyncHandler(async (req, res) => {
  const checks = await Promise.allSettled([
    checkSupabase(),
    checkOpenAI(),
    checkMemory(),
    checkEnvironment()
  ]);

  const results = {
    supabase: checks[0],
    openai: checks[1],
    memory: checks[2],
    environment: checks[3]
  };

  const allHealthy = checks.every(check => check.status === 'fulfilled');

  const response: ApiResponse = {
    success: allHealthy,
    data: {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: results
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substring(7),
      version: '1.0.0'
    }
  };

  res.status(allHealthy ? 200 : 503).json(response);
}));

// Individual service health checks
async function checkSupabase(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  
  try {
    // Simple query to test connection
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    return {
      status: 'healthy',
      latency: Date.now() - start
    };
  } catch (error) {
    throw new Error(`Supabase connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkOpenAI(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Simple API call to test connectivity
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned ${response.status}`);
    }

    return {
      status: 'healthy',
      latency: Date.now() - start
    };
  } catch (error) {
    throw new Error(`OpenAI connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkMemory(): Promise<{ status: string; usage: any }> {
  const usage = process.memoryUsage();
  const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const percentage = Math.round((usage.heapUsed / usage.heapTotal) * 100);

  return {
    status: percentage > 90 ? 'warning' : 'healthy',
    usage: {
      heapUsed: `${usedMB}MB`,
      heapTotal: `${totalMB}MB`,
      percentage: `${percentage}%`,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    }
  };
}

async function checkEnvironment(): Promise<{ status: string; config: any }> {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY', 
    'SUPABASE_ANON_KEY',
    'OPENAI_API_KEY'
  ];

  const missing = requiredEnvVars.filter(name => !process.env[name]);

  return {
    status: missing.length === 0 ? 'healthy' : 'error',
    config: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env.NODE_ENV || 'development',
      missingEnvVars: missing
    }
  };
}

export { router as healthRoutes };
