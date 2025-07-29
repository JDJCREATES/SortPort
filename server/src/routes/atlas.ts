import { Router } from 'express';
import { ApiResponse, AtlasRequestSchema, AtlasResponse } from '../types/api';
import { asyncHandler } from '../middleware/errorHandler';
import { visionRateLimiter } from '../middleware/rateLimiter';
import { requireCredits, updateCreditsMiddleware } from '../middleware/auth';
import { ValidationError } from '../types/api';
import { VirtualImageQueries } from '../lib/supabase/queries';
import { atlasGenerator, atlasVisionAnalyzer } from '../lib/langchain/utils/atlas';

const router = Router();

// Generate atlas endpoint
router.post('/generate',
  visionRateLimiter,
  requireCredits(2), // Atlas generation costs 2 credits
  updateCreditsMiddleware(2),
  asyncHandler(async (req, res) => {
    // Validate request
    const validationResult = AtlasRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError('Invalid atlas request data', validationResult.error);
    }

    const atlasRequest = validationResult.data;
    
    // Ensure user can only generate atlases for their own images
    if (atlasRequest.userId !== req.user.id) {
      throw new ValidationError('Cannot generate atlas for another user');
    }

    // Validate image count (max 9 for 3x3 grid)
    if (atlasRequest.imageIds.length > 9) {
      throw new ValidationError('Maximum 9 images allowed per atlas');
    }

    // Load user's images
    const images = await VirtualImageQueries.getByIds(atlasRequest.imageIds, atlasRequest.userId);
    
    if (images.length === 0) {
      throw new ValidationError('No valid images found for atlas generation');
    }

    // Generate cache key
    const cacheKey = atlasGenerator.generateCacheKey(images, atlasRequest.purpose);
    
    // Generate atlas
    const atlasResult = await atlasGenerator.generateAtlas(images, {
      purpose: atlasRequest.purpose,
      cacheKey,
      includeLabels: true
    });

    // Upload atlas and get URL
    const fileName = `${cacheKey}_${Date.now()}.jpg`;
    const atlasUrl = await atlasGenerator.uploadAtlas(atlasResult.atlasBuffer, fileName);

    const result: AtlasResponse = {
      atlasUrl,
      imageMap: atlasResult.imageMap,
      cacheKey,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
    };

    const response: ApiResponse<AtlasResponse> = {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        version: '1.0.0'
      }
    };

    res.json(response);
  })
);

// Get cached atlas endpoint
router.get('/cache/:cacheKey',
  asyncHandler(async (req, res) => {
    const { cacheKey } = req.params;
    
    // Validate cache key format (basic validation)
    if (!cacheKey.startsWith('atlas_')) {
      throw new ValidationError('Invalid cache key format');
    }

    // Get cache stats to check if atlas exists
    const cacheStats = atlasGenerator.getCacheStats();
    const isInCache = cacheStats.keys.includes(cacheKey);

    if (!isInCache) {
      const response: ApiResponse = {
        success: false,
        error: 'Atlas not found in cache',
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '1.0.0'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        cacheKey,
        status: 'cached',
        message: 'Atlas found in cache'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        version: '1.0.0'
      }
    };

    res.json(response);
  })
);

// List user's atlases endpoint
router.get('/list',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    
    // TODO: Implement atlas listing
    // const atlases = await atlasService.listByUser(req.user.id, { page, limit });
    
    // Placeholder response
    const response: ApiResponse = {
      success: true,
      data: {
        atlases: [],
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: 0,
          totalPages: 0
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        version: '1.0.0'
      }
    };

    res.json(response);
  })
);

// Delete atlas endpoint
router.delete('/:cacheKey',
  asyncHandler(async (req, res) => {
    const { cacheKey } = req.params;
    
    // Validate cache key format
    if (!cacheKey.startsWith(`atlas_${req.user.id}_`)) {
      throw new ValidationError('Invalid cache key for user');
    }

    // TODO: Implement atlas deletion
    // await atlasService.delete(cacheKey, req.user.id);
    
    const response: ApiResponse = {
      success: true,
      message: 'Atlas deletion not yet implemented',
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        version: '1.0.0'
      }
    };

    res.json(response);
  })
);

// Atlas stats endpoint
router.get('/stats',
  asyncHandler(async (req, res) => {
    const cacheStats = atlasGenerator.getCacheStats();
    
    const response: ApiResponse = {
      success: true,
      data: {
        totalAtlases: cacheStats.size,
        cacheSize: cacheStats.size,
        cachedAtlases: cacheStats.keys,
        storageUsed: '0 MB', // TODO: Calculate actual storage usage
        cacheHitRate: 0, // TODO: Implement cache hit rate tracking
        averageGenerationTime: 0, // TODO: Track generation times
        costSavings: {
          totalVisionCalls: 0, // TODO: Track vision call statistics
          callsSaved: cacheStats.size * 8, // Estimated: 9 images per atlas vs 1 per image
          creditsSpent: 0,
          creditsSaved: cacheStats.size * 16 // Estimated savings
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        version: '1.0.0'
      }
    };

    res.json(response);
  })
);

export { router as atlasRoutes };
