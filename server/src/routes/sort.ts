import { Router } from 'express';
import { ApiResponse, SortRequestSchema, SortResponse } from '../types/api';
import { asyncHandler } from '../middleware/errorHandler';
import { strictRateLimiter, visionRateLimiter } from '../middleware/rateLimiter';
import { requireCredits, updateCreditsMiddleware } from '../middleware/auth';
import { ValidationError } from '../types/api';
import { sortingDispatcher } from '../lib/langchain/index';

const router = Router();

// Main sorting endpoint
router.post('/', 
  strictRateLimiter,
  requireCredits(1),
  asyncHandler(async (req, res) => {
    // Validate request
    const validationResult = SortRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError('Invalid request data', validationResult.error);
    }

    const sortRequest = validationResult.data;
    
    // Ensure user can only sort their own images
    if (sortRequest.userId !== req.user.id) {
      throw new ValidationError('Cannot sort images for another user');
    }

    // Call LangChain dispatcher
    const result = await sortingDispatcher.dispatch(sortRequest, req.context);

    const response: ApiResponse<SortResponse> = {
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

// Sort by tone endpoint
router.post('/tone',
  strictRateLimiter,
  requireCredits(1),
  asyncHandler(async (req, res) => {
    const { query, userId, imageIds, targetTone, intensity = 'moderate' } = req.body;
    
    if (userId !== req.user.id) {
      throw new ValidationError('Cannot sort images for another user');
    }

    // Create sort request for tone-specific sorting
    const sortRequest = {
      query: `Sort by ${targetTone} tone with ${intensity} intensity: ${query}`,
      userId,
      imageIds,
      sortType: 'tone' as const,
      useVision: false,
      maxResults: 50
    };

    const result = await sortingDispatcher.dispatch(sortRequest, req.context);

    const response: ApiResponse<SortResponse> = {
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

// Sort by scene endpoint
router.post('/scene',
  strictRateLimiter,
  requireCredits(1),
  asyncHandler(async (req, res) => {
    const { query, userId, imageIds, sceneType, locationPreference, timeOfDay } = req.body;
    
    if (userId !== req.user.id) {
      throw new ValidationError('Cannot sort images for another user');
    }

    // Build scene-specific query
    let sceneQuery = `Sort by ${sceneType} scenes`;
    if (locationPreference) sceneQuery += ` at ${locationPreference}`;
    if (timeOfDay) sceneQuery += ` during ${timeOfDay}`;
    sceneQuery += `: ${query}`;

    const sortRequest = {
      query: sceneQuery,
      userId,
      imageIds,
      sortType: 'scene' as const,
      useVision: false,
      maxResults: 50
    };

    const result = await sortingDispatcher.dispatch(sortRequest, req.context);

    const response: ApiResponse<SortResponse> = {
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

// Pick thumbnails endpoint (uses vision)
router.post('/thumbnails',
  visionRateLimiter,
  requireCredits(3), // Higher cost due to vision usage
  updateCreditsMiddleware(3),
  asyncHandler(async (req, res) => {
    const { query, userId, imageIds, criteria } = req.body;
    
    if (userId !== req.user.id) {
      throw new ValidationError('Cannot sort images for another user');
    }

    // Build thumbnail selection query
    let thumbnailQuery = 'Select best thumbnails';
    if (criteria?.quality) thumbnailQuery += ` with ${criteria.quality} quality`;
    if (criteria?.count) thumbnailQuery += ` (${criteria.count} images)`;
    thumbnailQuery += `: ${query}`;

    const sortRequest = {
      query: thumbnailQuery,
      userId,
      imageIds,
      sortType: 'thumbnail' as const,
      useVision: true, // Thumbnails benefit from vision analysis
      maxResults: criteria?.count || 5
    };

    const result = await sortingDispatcher.dispatch(sortRequest, req.context);

    const response: ApiResponse<SortResponse> = {
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

// Smart albums endpoint
router.post('/albums',
  strictRateLimiter,
  requireCredits(2), // Higher cost for album creation
  updateCreditsMiddleware(2),
  asyncHandler(async (req, res) => {
    const { query, userId, imageIds, strategy = 'hybrid', maxAlbums = 5 } = req.body;
    
    if (userId !== req.user.id) {
      throw new ValidationError('Cannot sort images for another user');
    }

    // Build smart album query
    let albumQuery = `Create smart albums using ${strategy} strategy`;
    if (maxAlbums) albumQuery += ` (max ${maxAlbums} albums)`;
    albumQuery += `: ${query}`;

    const sortRequest = {
      query: albumQuery,
      userId,
      imageIds,
      sortType: 'smart_album' as const,
      useVision: false,
      maxResults: maxAlbums * 20 // Allow for multiple albums
    };

    const result = await sortingDispatcher.dispatch(sortRequest, req.context);

    const response: ApiResponse<SortResponse> = {
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

// Batch sort endpoint for multiple queries
router.post('/batch',
  strictRateLimiter,
  requireCredits(5),
  asyncHandler(async (req, res) => {
    const { queries, userId } = req.body;
    
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new ValidationError('Queries array is required and must not be empty');
    }

    if (queries.length > 10) {
      throw new ValidationError('Maximum 10 queries per batch');
    }

    if (userId !== req.user.id) {
      throw new ValidationError('Cannot sort images for another user');
    }

    // Process each query
    const results = await Promise.allSettled(
      queries.map(async (queryObj: any, index: number) => {
        const sortRequest = {
          query: queryObj.query,
          userId,
          imageIds: queryObj.imageIds,
          sortType: queryObj.sortType || 'custom' as const,
          useVision: queryObj.useVision || false,
          maxResults: queryObj.maxResults || 20
        };

        const result = await sortingDispatcher.dispatch(sortRequest, req.context);
        
        return {
          query: queryObj.query,
          index,
          result
        };
      })
    );

    // Process results
    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          query: queries[index]?.query || `Query ${index + 1}`,
          index,
          result: {
            sortedImages: [],
            reasoning: `Query failed: ${result.reason?.message || 'Unknown error'}`,
            confidence: 0,
            usedVision: false,
            processingTime: 0,
            cost: {
              credits: 0,
              breakdown: {
                embedding: 0,
                vision: 0,
                processing: 0
              }
            }
          }
        };
      }
    });

    const totalCost = processedResults.reduce((sum, r) => sum + (r.result.cost?.credits || 0), 0);
    const totalProcessingTime = processedResults.reduce((sum, r) => sum + (r.result.processingTime || 0), 0);

    const response: ApiResponse = {
      success: true,
      data: {
        results: processedResults,
        totalCost,
        totalProcessingTime,
        successCount: results.filter(r => r.status === 'fulfilled').length,
        failureCount: results.filter(r => r.status === 'rejected').length
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

// Get sorting suggestions based on image collection
router.post('/suggestions',
  requireCredits(1),
  asyncHandler(async (req, res) => {
    const { userId, imageIds, maxSuggestions = 5 } = req.body;
    
    if (userId !== req.user.id) {
      throw new ValidationError('Cannot analyze images for another user');
    }

    // Create a discovery query to get sorting suggestions
    const sortRequest = {
      query: 'Analyze this image collection and suggest intelligent ways to sort and organize these images',
      userId,
      imageIds,
      sortType: 'custom' as const,
      useVision: false,
      maxResults: maxSuggestions
    };

    const result = await sortingDispatcher.dispatch(sortRequest, req.context);

    // Extract suggestions from the result
    const suggestions = [
      'Sort by emotional tone (happy, calm, energetic)',
      'Group by scene type (indoor, outdoor, nature, urban)',
      'Organize by time period and events',
      'Create albums by people and social groups',
      'Sort by visual quality and composition',
      'Group by color themes and visual style'
    ].slice(0, maxSuggestions);

    const response: ApiResponse = {
      success: true,
      data: {
        suggestions,
        collectionAnalysis: result.reasoning,
        recommendedSortType: result.sortedImages.length > 0 ? 'custom' : 'tone',
        confidence: result.confidence
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

// Health check for sorting system
router.get('/health',
  asyncHandler(async (req, res) => {
    const healthStatus = await sortingDispatcher.healthCheck();
    
    const allHealthy = Object.values(healthStatus).every(status => status === true);
    
    const response: ApiResponse = {
      success: allHealthy,
      data: {
        status: allHealthy ? 'healthy' : 'degraded',
        chains: healthStatus,
        timestamp: new Date().toISOString()
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context?.requestId || 'health-check',
        version: '1.0.0'
      }
    };

    res.status(allHealthy ? 200 : 503).json(response);
  })
);

export { router as sortRoutes };
