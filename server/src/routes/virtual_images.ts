import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, requireCredits } from '../middleware/auth';
import { virtualImageManager } from '../lib/imageProcessing/virtual_image_manager';
import { z } from 'zod';

const router = Router();

// Schema for Edge Function webhook data (more flexible)
const EdgeFunctionWebhookSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  imageId: z.string().optional(),
  rekognitionData: z.any(), // More flexible for different Rekognition response structures
  originalPath: z.string(),
  originalName: z.string(), 
  hash: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  exifData: z.any().optional()
});

const CreateVirtualImageSchema = z.object({
  user_id: z.string(),
  original_path: z.string(),
  original_name: z.string(),
  hash: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  exifData: z.object({}).optional(),
  rekognitionData: z.object({}).optional()
});

/**
 * Edge Function Integration Endpoints
 */

// Webhook endpoint for Edge Function to send Rekognition results
router.post('/webhook/rekognition-complete', 
  asyncHandler(async (req, res) => {
    const validationResult = EdgeFunctionWebhookSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook data',
        details: validationResult.error
      });
    }

    const { jobId, userId, imageId, rekognitionData, originalPath, originalName, hash, fileSize, mimeType, exifData } = validationResult.data;

    try {
      let virtualImage;

      if (imageId) {
        // Update existing virtual image with Rekognition data
        virtualImage = await virtualImageManager.syncWithEdgeFunction(jobId, rekognitionData);
      } else {
        // Create new virtual image with Rekognition data
        virtualImage = await virtualImageManager.processImage({
          user_id: userId,
          original_path: originalPath,
          original_name: originalName,
          hash,
          fileSize,
          mimeType,
          exifData,
          rekognitionData
        });
      }

      if (!virtualImage) {
        return res.status(500).json({
          success: false,
          error: 'Failed to process virtual image'
        });
      }

      res.json({
        success: true,
        data: {
          imageId: virtualImage.id,
          processed: true,
          nsfwScore: virtualImage.nsfw_score,
          isFlagged: virtualImage.isflagged
        }
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

// Create virtual image (for initial upload before Rekognition)
router.post('/', 
  authMiddleware,
  requireCredits(0), // No credits required for creating placeholder
  asyncHandler(async (req, res) => {
    const validationResult = CreateVirtualImageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image data',
        details: validationResult.error
      });
    }

    const imageData = validationResult.data;

    // Ensure user can only create images for themselves
    if (imageData.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Cannot create images for another user'
      });
    }

    try {
      const virtualImage = await virtualImageManager.processImage(imageData);

      if (!virtualImage) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create virtual image'
        });
      }

      res.json({
        success: true,
        data: virtualImage
      });

    } catch (error) {
      console.error('Create virtual image error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  })
);

// Get virtual image by ID
router.get('/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const virtualImage = await virtualImageManager.getVirtualImage(id);

      if (!virtualImage) {
        return res.status(404).json({
          success: false,
          error: 'Virtual image not found'
        });
      }

      // Ensure user can only access their own images
      if (virtualImage.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: virtualImage
      });

    } catch (error) {
      console.error('Get virtual image error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  })
);

// Update virtual image
router.put('/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    try {
      // First check if image exists and belongs to user
      const existingImage = await virtualImageManager.getVirtualImage(id);
      
      if (!existingImage) {
        return res.status(404).json({
          success: false,
          error: 'Virtual image not found'
        });
      }

      if (existingImage.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const updatedImage = await virtualImageManager.updateVirtualImage(id, updates);

      if (!updatedImage) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update virtual image'
        });
      }

      res.json({
        success: true,
        data: updatedImage
      });

    } catch (error) {
      console.error('Update virtual image error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  })
);

// Get user's virtual images with pagination
router.get('/user/:userId',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    // Ensure user can only access their own images
    if (userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    try {
      const result = await virtualImageManager.getUserImages(userId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      });

      res.json({
        success: true,
        data: {
          images: result.images,
          pagination: {
            total: result.total,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            hasMore: result.total > parseInt(offset as string) + parseInt(limit as string)
          }
        }
      });

    } catch (error) {
      console.error('Get user images error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  })
);

// Batch create virtual images (for bulk uploads)
router.post('/batch',
  authMiddleware,
  requireCredits(0), // No credits for creating placeholders
  asyncHandler(async (req, res) => {
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Images array is required'
      });
    }

    // Validate all images belong to the authenticated user
    const invalidImages = images.filter(img => img.user_id !== req.user.id);
    if (invalidImages.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'Cannot create images for another user'
      });
    }

    try {
      const results = await virtualImageManager.processBatch(images, {
        batchSize: 50,
        concurrency: 10,
        enableCaching: true
      });

      const successful = results.filter(r => r !== null);
      const failed = results.length - successful.length;

      res.json({
        success: true,
        data: {
          processed: results.length,
          successful: successful.length,
          failed,
          images: successful
        }
      });

    } catch (error) {
      console.error('Batch create error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  })
);

// Delete virtual image
router.delete('/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      // First check if image exists and belongs to user
      const existingImage = await virtualImageManager.getVirtualImage(id);
      
      if (!existingImage) {
        return res.status(404).json({
          success: false,
          error: 'Virtual image not found'
        });
      }

      if (existingImage.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const deleted = await virtualImageManager.deleteVirtualImage(id);

      if (!deleted) {
        return res.status(500).json({
          success: false,
          error: 'Failed to delete virtual image'
        });
      }

      res.json({
        success: true,
        message: 'Virtual image deleted successfully'
      });

    } catch (error) {
      console.error('Delete virtual image error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  })
);

export default router;
