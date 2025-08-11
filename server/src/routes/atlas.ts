import { Router } from 'express';
import { ApiResponse } from '../types/api';

const router = Router();

// Atlas generation has been moved to background processing
// All endpoints return 410 Gone status

router.all('*', (req, res) => {
  const response: ApiResponse = {
    success: false,
    error: 'Atlas endpoints have been deprecated. Atlas generation now happens automatically during background image processing.',
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string || 'unknown',
      version: '1.0.0'
    }
  };
  
  res.status(410).json(response); // 410 Gone
});

export default router;
