/**
 *  Handles dynamic performance adjustments based on real-time performance metrics.
 *  -- Adjusts Uploading to the bulk moderation system
 */


export interface PerformanceMetrics {
  compressionTimeMs: number;
  uploadTimeMs: number;
  memoryUsageRatio: number;
  successRate: number;
  errorRate: number;
}

export interface ProcessingSettings {
  compressionWorkers: number;
  batchSize: number;
  uploadConcurrency: number;
  cacheSize: number;
  retryAttempts: number;
}

export class DynamicPerformanceAdjuster {
  private static readonly MIN_WORKERS = 2;
  private static readonly MAX_WORKERS = 16;
  private static readonly MIN_BATCH_SIZE = 5;
  private static readonly MAX_BATCH_SIZE = 50;
  private static readonly MIN_UPLOAD_CONCURRENCY = 1;
  private static readonly MAX_UPLOAD_CONCURRENCY = 8;

  /**
   * Adjust settings based on real-time performance metrics
   */
  static adjustSettings(
    currentSettings: ProcessingSettings,
    metrics: PerformanceMetrics
  ): ProcessingSettings {
    const newSettings = { ...currentSettings };
    
    // Adjust compression workers
    newSettings.compressionWorkers = this.adjustCompressionWorkers(
      currentSettings.compressionWorkers,
      metrics.compressionTimeMs
    );
    
    // Adjust batch size based on memory and performance
    newSettings.batchSize = this.adjustBatchSize(
      currentSettings.batchSize,
      metrics.memoryUsageRatio,
      metrics.compressionTimeMs
    );
    
    // Adjust upload concurrency based on network performance
    newSettings.uploadConcurrency = this.adjustUploadConcurrency(
      currentSettings.uploadConcurrency,
      metrics.uploadTimeMs,
      metrics.successRate
    );
    
    // Adjust retry attempts based on error rate
    newSettings.retryAttempts = this.adjustRetryAttempts(
      currentSettings.retryAttempts,
      metrics.errorRate
    );
    
    return newSettings;
  }

  private static adjustCompressionWorkers(current: number, avgTimeMs: number): number {
    if (avgTimeMs < 100 && current < this.MAX_WORKERS) {
      return Math.min(this.MAX_WORKERS, current + 2);
    } else if (avgTimeMs > 500 && current > this.MIN_WORKERS) {
      return Math.max(this.MIN_WORKERS, current - 1);
    }
    return current;
  }

  private static adjustBatchSize(
    current: number,
    memoryUsage: number,
    compressionTime: number
  ): number {
    // Reduce batch size if memory is high
    if (memoryUsage > 0.9) {
      return Math.max(this.MIN_BATCH_SIZE, current - 2);
    }
    
    // Increase batch size if memory is low and compression is fast
    if (memoryUsage < 0.5 && compressionTime < 200) {
      return Math.min(this.MAX_BATCH_SIZE, current + 2);
    }
    
    return current;
  }

  private static adjustUploadConcurrency(
    current: number,
    avgUploadTimeMs: number,
    successRate: number
  ): number {
    // Increase concurrency if uploads are fast and successful
    if (avgUploadTimeMs < 5000 && successRate > 0.95 && current < this.MAX_UPLOAD_CONCURRENCY) {
      return current + 1;
    }
    
    // Only decrease concurrency if uploads are VERY slow or failing significantly
    if ((avgUploadTimeMs > 20000 || successRate < 0.7) && current > this.MIN_UPLOAD_CONCURRENCY) {
      return current - 1;
    }
    
    return current;
  }

  private static adjustRetryAttempts(current: number, errorRate: number): number {
    if (errorRate > 0.2 && current < 5) {
      return current + 1;
    } else if (errorRate < 0.05 && current > 2) {
      return current - 1;
    }
    return current;
  }

  /**
   * Get recommended settings based on device profile
   */
  static getRecommendedSettings(deviceTier: 'low' | 'mid' | 'high' | 'flagship'): ProcessingSettings {
    const profiles = {
      low: {
        compressionWorkers: 4,
        batchSize: 10,
        uploadConcurrency: 2,
        cacheSize: 100,
        retryAttempts: 3
      },
      mid: {
        compressionWorkers: 6,
        batchSize: 20,
        uploadConcurrency: 4,
        cacheSize: 200,
        retryAttempts: 3
      },
      high: {
        compressionWorkers: 8,
        batchSize: 30,
        uploadConcurrency: 6,
        cacheSize: 300,
        retryAttempts: 2
      },
      flagship: {
        compressionWorkers: 12,
        batchSize: 40,
        uploadConcurrency: 8,
        cacheSize: 500,
        retryAttempts: 2
      }
    };
    
    return profiles[deviceTier];
  }

  /**
   * Calculate performance score based on metrics
   */
  static calculatePerformanceScore(metrics: PerformanceMetrics): number {
    const compressionScore = Math.max(0, 100 - metrics.compressionTimeMs / 10);
    const uploadScore = Math.max(0, 100 - metrics.uploadTimeMs / 50);
    const memoryScore = Math.max(0, 100 - metrics.memoryUsageRatio * 100);
    const reliabilityScore = metrics.successRate * 100;
    
    return (compressionScore + uploadScore + memoryScore + reliabilityScore) / 4;
  }

  /**
   * Get optimization recommendations
   */
  static getOptimizationRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.compressionTimeMs > 1000) {
      recommendations.push('Consider reducing image quality or resolution');
    }
    
    if (metrics.uploadTimeMs > 5000) {
      recommendations.push('Network connection may be slow - consider reducing concurrency');
    }
    
    if (metrics.memoryUsageRatio > 0.9) {
      recommendations.push('Memory usage is high - consider reducing batch size');
    }
    
    if (metrics.errorRate > 0.1) {
      recommendations.push('High error rate detected - check network stability');
    }
    
    if (metrics.successRate < 0.9) {
      recommendations.push('Low success rate - consider increasing retry attempts');
    }
    
    return recommendations;
  }
}
