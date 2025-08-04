import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Load environment variables
dotenv.config();

// Validate environment and get secure configuration
import { envValidator } from './lib/security/envValidator';
import { secureLogger } from './lib/security/secureLogger';

// Validate environment variables at startup
const config = envValidator.validateAndGetConfig();

// Import routes
import { sortRoutes } from './routes/sort';
import { healthRoutes } from './routes/health';
import monitoringRoutes from './routes/monitoring';
import lcelSortRoutes from './routes/lcel_sort';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';

// Import production components
import { productionSecurity } from './lib/security/productionMiddleware';
import { metricsCollector } from './lib/monitoring/metricsCollector';

const app = express();
const PORT = config.server.port;

// Phase 4 Production Security Middleware (applied first)
app.use(productionSecurity.getSecurityHeaders());
app.use(productionSecurity.getDDoSProtection());
app.use(productionSecurity.getGlobalRateLimit());
app.use(productionSecurity.getSpeedLimiter());
app.use(productionSecurity.getValidationMiddleware());
app.use(productionSecurity.getSanitizationMiddleware());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false
}));

// CORS configuration with production security
app.use(cors(productionSecurity.getCORSOptions()));

// General middleware
app.use(compression());
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Metrics collection middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.recordApiCall(
      req.path, 
      req.method, 
      res.statusCode, 
      duration,
      (req as any).user?.id
    );
  });
  
  next();
});

// Note: Legacy rateLimiter deprecated in favor of production security middleware

// Health check (no auth required)
app.use('/health', healthRoutes);

// Monitoring endpoints (protected with production auth)
app.use('/api/monitoring', monitoringRoutes);

// Protected routes (require auth)
app.use('/api/sort', authMiddleware, productionSecurity.getCostBasedRateLimit(), sortRoutes);
app.use('/api/lcel', authMiddleware, productionSecurity.getCostBasedRateLimit(), lcelSortRoutes); // LCEL system

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown with cleanup
process.on('SIGTERM', () => {
  secureLogger.info('SIGTERM received, shutting down gracefully');
  metricsCollector.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  secureLogger.info('SIGINT received, shutting down gracefully');
  metricsCollector.destroy();
  process.exit(0);
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  // Use secure logging that redacts sensitive information
  secureLogger.serverStartup(PORT, config.isProduction ? 'production' : 'development');
  
  if (config.isDevelopment) {
    console.log(`🔍 Metrics endpoint: http://localhost:${PORT}/api/monitoring/prometheus`);
    console.log(`💰 Cost analytics: http://localhost:${PORT}/api/monitoring/costs`);
    console.log('');
    console.log('🎯 Sorting Systems:');
    console.log(`   LCEL:   http://localhost:${PORT}/api/lcel`);
    console.log(`   Status: http://localhost:${PORT}/api/lcel/status`);
  }
  
  if (config.isProduction) {
    secureLogger.info('Production security features enabled');
    if (envValidator.isSecureProduction()) {
      secureLogger.info('All security features properly configured');
    } else {
      secureLogger.warn('Some production security features are not fully configured');
    }
  }
});

export { app };
