import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Load environment variables
dotenv.config();

// Import routes
import { sortRoutes } from './routes/sort.js';
import { healthRoutes } from './routes/health.js';
import { atlasRoutes } from './routes/atlas.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8081'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// General middleware
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimiter);

// Health check (no auth required)
app.use('/health', healthRoutes);

// Protected routes (require auth)
app.use('/api/sort', authMiddleware, sortRoutes);
app.use('/api/atlas', authMiddleware, atlasRoutes);

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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 SnapSort LangChain Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export { app };
