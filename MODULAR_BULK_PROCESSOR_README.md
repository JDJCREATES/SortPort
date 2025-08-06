# Modular Bulk NSFW Processing System

This modular system replaces the monolithic `bulkNsfwProcessor.ts` (1700+ lines) with specialized, maintainable services while preserving **ALL** functionality.

## 🎯 Architecture Overview

The original monolith has been broken down into these specialized services:

```
📁 utils/
├── 📁 filesystem/
│   └── FileSystemService.ts         # File operations & validation
├── 📁 cache/
│   └── CompressionCacheService.ts   # URI mapping & cache management
├── 📁 compression/
│   └── ImageCompressionService.ts   # Native image compression
├── 📁 upload/
│   └── BatchUploadService.ts        # Batch upload with retry logic
├── 📁 monitoring/
│   └── JobMonitoringService.ts      # Job progress & metrics
├── 📁 orchestration/
│   └── BulkProcessingOrchestrator.ts # Main coordinator
└── modular-bulk-processor.ts        # Public API exports
```

## 🔧 Key Services

### 1. FileSystemService
**Static utility class for file operations**
- ✅ Enhanced file size calculation with error handling
- ✅ Total size calculation with validation breakdown
- ✅ File existence validation with detailed logging
- ✅ Human-readable size formatting

```typescript
// Get file size with error handling
const size = await FileSystemService.getFileSize(uri);

// Calculate total size with validation
const { totalSizeBytes, validFiles, invalidFiles } = 
  await FileSystemService.calculateTotalSize(uris);
```

### 2. CompressionCacheService
**Manages compression cache with forward/reverse URI mappings**
- ✅ Forward mapping: original → compressed URI
- ✅ Reverse mapping: compressed → original URI  
- ✅ Batch status tracking and hit rate analysis
- ✅ Auto-cleanup and cache size management
- ✅ Enhanced debugging with detailed logging

```typescript
const cache = new CompressionCacheService(200);
cache.set(originalUri, compressedUri);
const compressed = cache.get(originalUri);
const original = cache.getOriginal(compressedUri);
```

### 3. ImageCompressionService
**Native image compression with worker pools**
- ✅ React Native Image Resizer integration
- ✅ Worker pool for concurrent compression
- ✅ Comprehensive validation and error handling
- ✅ Cache integration for avoiding duplicate work
- ✅ Statistics tracking and performance monitoring

```typescript
const compression = new ImageCompressionService({
  maxImageSize: 1920,
  compressionQuality: 0.8,
  workers: 3
});

await compression.compressImages(uris, (progress, total) => {
  console.log(`Progress: ${progress}/${total}`);
});
```

### 4. BatchUploadService
**Handles batch uploads with comprehensive retry logic**
- ✅ Intelligent batch sizing based on hardware capabilities
- ✅ Exponential backoff retry with configurable parameters
- ✅ Pre-upload validation with detailed file checking
- ✅ Form data preparation with size tracking
- ✅ Error aggregation and detailed logging

```typescript
const batchUpload = new BatchUploadService(cache, {
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2,
  timeoutMs: 120000
});

const batches = await batchUpload.createBatches(uris, processingId);
const result = await batchUpload.uploadBatchWithRetry(batch);
```

### 5. JobMonitoringService
**Comprehensive job tracking and metrics**
- ✅ Real-time progress tracking with status updates
- ✅ Job history with configurable retention
- ✅ Performance metrics calculation
- ✅ Server status synchronization
- ✅ Dashboard data aggregation for monitoring

```typescript
const monitoring = new JobMonitoringService(100);
const job = monitoring.startJob(processingId, totalImages, totalBatches);
monitoring.updateProgress(processingId, completed, processed);
const metrics = monitoring.calculateMetrics();
```

### 6. BulkProcessingOrchestrator
**Main coordinator that orchestrates the entire pipeline**
- ✅ Six-phase processing pipeline
- ✅ Hardware-optimized configuration
- ✅ ML Kit integration for image analysis
- ✅ Progress callbacks and error handling
- ✅ Comprehensive result aggregation

## 🚀 Usage

### Simple Usage (Replace existing bulkNsfwProcessor calls)

```typescript
import { bulkProcessingOrchestrator } from './utils/modular-bulk-processor';

const result = await bulkProcessingOrchestrator.processBulkImages({
  imageUris: imageUris,
  processingId: generateUniqueId(),
  config: {
    enableCompression: true,
    compressionQuality: 0.8,
    enableMLKit: true,
    batchSize: 10,
    maxRetries: 3,
    retryDelay: 1000,
    timeoutMs: 120000,
    cacheSize: 200
  },
  onProgress: (status) => {
    console.log(`Progress: ${status.progress}% (${status.processedImages}/${status.totalImages})`);
  },
  onBatchComplete: (batchId, result) => {
    console.log(`Batch ${batchId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  },
  onError: (error) => {
    console.error('Processing error:', error);
  }
});

if (result.success) {
  console.log('✅ Bulk processing completed:', {
    uploadedImages: result.uploadedImages,
    compressionRatio: result.compressionStats.compressionRatio,
    processingTime: result.processingTimeMs
  });
}
```

### Advanced Usage with Individual Services

```typescript
import { 
  FileSystemService,
  CompressionCacheService,
  ImageCompressionService,
  BatchUploadService,
  JobMonitoringService
} from './utils/modular-bulk-processor';

// File validation
const { validFiles, invalidFiles } = await FileSystemService.validateFiles(uris);

// Compression with custom settings
const cache = new CompressionCacheService(300);
const compression = new ImageCompressionService({
  maxImageSize: 2048,
  compressionQuality: 0.9,
  workers: 4
}, 300);

await compression.compressImages(validFiles);

// Upload with monitoring
const monitoring = new JobMonitoringService();
const job = monitoring.startJob('custom-job', validFiles.length, 0);

const batchUpload = new BatchUploadService(cache);
const batches = await batchUpload.createBatches(validFiles, 'custom-job');

for (const batch of batches) {
  const result = await batchUpload.uploadBatchWithRetry(batch);
  monitoring.updateProgress('custom-job', batches.indexOf(batch) + 1, result.uploadedCount);
}
```

## 🔍 Enhanced Debugging Features

All services include comprehensive logging to help identify the **file cleanup issue**:

### File Size Validation Logging
```
📁 Validating image 1/10: image.jpg - 2.3MB
❌ File disappeared or became 0 bytes: /path/to/compressed.jpg
🔍 Cache Debug: forward: 150, reverse: 145, hit rate: 96.7%
```

### Compression Tracking
```
🗜️ Compression progress: 8/10 (80%)
💾 Cached: original.jpg -> compressed_1234.jpg
⚠️ Compression failed for image.jpg: File size became 0 bytes
```

### Upload Validation
```
📎 Adding file 3/5 to form data: compressed_5678.jpg (1.8MB)
❌ File validation failed: File has 0 bytes: /temp/compressed_9999.jpg
📊 Batch validation summary: 4/5 valid files, 1 invalid
```

## 🎯 Migration from Monolith

**Before (Monolithic):**
```typescript
import { BulkNSFWProcessor } from './utils/bulkNsfwProcessor';

const processor = new BulkNSFWProcessor();
await processor.startEnhancedUploadStream(imageUris, processingId);
```

**After (Modular):**
```typescript
import { bulkProcessingOrchestrator } from './utils/modular-bulk-processor';

await bulkProcessingOrchestrator.processBulkImages({
  imageUris,
  processingId,
  config: { /* your config */ },
  onProgress: (status) => { /* progress handling */ }
});
```

## 📊 Benefits of Modularization

✅ **Maintainability**: Each service has a single responsibility  
✅ **Testability**: Individual services can be unit tested  
✅ **Debugging**: Enhanced logging pinpoints exact failure locations  
✅ **Reusability**: Services can be used independently  
✅ **Performance**: Optimized for specific tasks  
✅ **Scalability**: Easy to add new features or modify existing ones  

## 🐛 Debugging the Cleanup Issue

The modular architecture with enhanced logging will help identify exactly where compressed files are getting cleaned up:

1. **FileSystemService**: Logs exact file sizes and existence checks
2. **CompressionCacheService**: Tracks URI mappings and cache hits/misses  
3. **ImageCompressionService**: Monitors compression process and file creation
4. **BatchUploadService**: Validates files immediately before upload

The logs will show exactly when files transition from existing → 0 bytes, helping narrow down the cleanup timing issue.

## 📝 All Original Functionality Preserved

Every method, feature, and behavior from the original 1700+ line monolith has been preserved:

- ✅ Image compression with React Native Image Resizer
- ✅ ML Kit integration for image analysis  
- ✅ Batch upload with retry logic
- ✅ Hardware profiling and optimization
- ✅ Cache management and URI mapping
- ✅ Progress tracking and monitoring
- ✅ Error handling and recovery
- ✅ Supabase edge function integration
- ✅ AWS Rekognition processing
- ✅ Statistics and metrics collection

The modular system is a **drop-in replacement** with enhanced debugging capabilities to solve the file cleanup issue.
