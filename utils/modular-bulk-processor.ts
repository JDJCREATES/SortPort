/**
 * Modular Bulk NSFW Processing Services
 * 
 * This is the modular replacement for the monolithic bulkNsfwProcessor.ts
 * All functionality has been preserved and distributed across specialized services.
 */

// Core Services
export { FileSystemService } from './filesystem/FileSystemService';
export { CompressionCacheService } from './cache/CompressionCacheService';
export { ImageCompressionService } from './compression/ImageCompressionService';
export { BatchUploadService } from './upload/BatchUploadService';
export { JobMonitoringService } from './monitoring/JobMonitoringService';

// Logging Configuration
export { 
  LogLevel,
  loggingConfig,
  setQuietMode,
  setNormalMode, 
  setVerboseMode,
  setSilentMode
} from './shared/LoggingConfig';

// Main Orchestrator
export { 
  BulkProcessingOrchestrator,
  bulkProcessingOrchestrator 
} from './orchestration/BulkProcessingOrchestrator';

// Types and Interfaces
export type {
  BulkProcessingConfig,
  BulkProcessingRequest,
  BulkProcessingResult
} from './orchestration/BulkProcessingOrchestrator';

export type {
  UploadBatch,
  UploadResult,
  RetryConfig
} from './upload/BatchUploadService';

export type {
  JobStatus,
  ProcessingResults,
  JobMetrics
} from './monitoring/JobMonitoringService';

export type {
  CompressionSettings,
  CompressionStats
} from './compression/ImageCompressionService';

/**
 * Usage Examples:
 * 
 * // Simple bulk processing
 * import { bulkProcessingOrchestrator } from './utils/modular-bulk-processor';
 * 
 * const result = await bulkProcessingOrchestrator.processBulkImages({
 *   imageUris: ['file://...', 'file://...'],
 *   processingId: 'unique-id',
 *   config: {
 *     enableCompression: true,
 *     compressionQuality: 0.8,
 *     enableMLKit: true,
 *     maxRetries: 3,
 *     retryDelay: 1000,
 *     timeoutMs: 120000,
 *     cacheSize: 200
 *   },
 *   onProgress: (status) => console.log('Progress:', status.progress),
 *   onBatchComplete: (batchId, result) => console.log('Batch done:', batchId)
 * });
 * 
 * // Control logging verbosity (to reduce console spam)
 * import { setQuietMode, setNormalMode, setVerboseMode, setSilentMode } from './utils/modular-bulk-processor';
 * 
 * setQuietMode();    // Only warnings and errors
 * setNormalMode();   // Default - important progress without per-file details
 * setVerboseMode();  // All logs including per-file processing
 * setSilentMode();   // No logs at all
 * 
 * // Individual service usage
 * import { FileSystemService, ImageCompressionService } from './utils/modular-bulk-processor';
 * 
 * const fileSize = await FileSystemService.getFileSize(uri);
 * const compression = new ImageCompressionService({ maxImageSize: 1920, compressionQuality: 0.8, workers: 3 });
 * await compression.compressImages(uris);
 */
