import { supabase } from '../supabase';
import { MLKitAnalysisResult } from '../mlkit/types/MLKitTypes';

export interface JobStatus {
  processingId: string;
  jobId?: string;  // Server-assigned job ID for status tracking
  bucketName?: string;  // S3 bucket name for AWS operations
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalImages: number;
  processedImages: number;
  completedBatches: number;
  totalBatches: number;
  startTime: number;
  endTime?: number;
  errors: string[];
  warnings: string[];
  results?: ProcessingResults;
}

export interface ProcessingResults {
  moderationResults: any[];
  mlkitResults: Record<string, MLKitAnalysisResult>;
  uploadedImages: number;
  failedImages: number;
  processingTimeMs: number;
  compressionStats: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}

export interface JobMetrics {
  averageProcessingTime: number;
  successRate: number;
  compressionEfficiency: number;
  errorRate: number;
  throughputImagesPerSecond: number;
}

export class JobMonitoringService {
  private activeJobs = new Map<string, JobStatus>();
  private jobHistory: JobStatus[] = [];
  private maxHistorySize: number;
  
  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Start monitoring a new job
   */
  startJob(processingId: string, totalImages: number, totalBatches: number): JobStatus {
    const job: JobStatus = {
      processingId,
      status: 'pending',
      progress: 0,
      totalImages,
      processedImages: 0,
      completedBatches: 0,
      totalBatches,
      startTime: Date.now(),
      errors: [],
      warnings: []
    };

    this.activeJobs.set(processingId, job);
    
    console.log(`🎯 Started monitoring job: ${processingId}`, {
      totalImages,
      totalBatches,
      timestamp: new Date().toISOString()
    });

    return job;
  }

  /**
   * Update job progress
   */
  updateProgress(
    processingId: string, 
    completedBatches: number, 
    processedImages: number,
    errors: string[] = [],
    warnings: string[] = []
  ): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      // Check if job exists in history before warning
      const historicalJob = this.jobHistory.find(j => j.processingId === processingId);
      if (!historicalJob) {
        console.warn(`⚠️ Attempted to update unknown job: ${processingId}`);
      }
      return null;
    }

    job.completedBatches = completedBatches;
    job.processedImages = processedImages;
    
    // Calculate progress based on phase:
    // - If totalBatches > 0: use batch completion progress (upload phase)
    // - If totalBatches = 0: use image processing progress (ML Kit/compression phase)
    if (job.totalBatches > 0) {
      job.progress = (completedBatches / job.totalBatches) * 100;
    } else if (job.totalImages > 0) {
      job.progress = (processedImages / job.totalImages) * 100;
    } else {
      job.progress = 0;
    }
    
    // Job is completed only when:
    // 1. We have batches configured (totalBatches > 0)
    // 2. All batches are completed (completedBatches >= totalBatches)
    job.status = (job.totalBatches > 0 && completedBatches >= job.totalBatches) ? 'completed' : 'processing';
    
    job.errors.push(...errors);
    job.warnings.push(...warnings);

    // ✅ CRITICAL FIX: Don't move to history immediately - let virtual image processing complete
    // But keep the status as 'completed' for compatibility with existing system
    if (job.status === 'completed') {
      job.endTime = Date.now();
      // DON'T move to history here - the job stays active for virtual image processing
      console.log(`✅ Job upload completed, keeping active for virtual image processing: ${processingId}`);
    }
    
    console.log(`📈 Job progress updated: ${processingId}`, {
      progress: `${job.progress.toFixed(1)}%`,
      completedBatches: `${completedBatches}/${job.totalBatches}`,
      processedImages: `${processedImages}/${job.totalImages}`,
      status: job.status,
      errors: errors.length,
      warnings: warnings.length
    });

    return job;
  }

  /**
   * Mark job as failed with error details
   */
  failJob(processingId: string, error: string): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      console.warn(`⚠️ Attempted to fail unknown job: ${processingId}`);
      return null;
    }

    job.status = 'failed';
    job.endTime = Date.now();
    job.errors.push(error);

    console.error(`❌ Job failed: ${processingId}`, {
      error,
      processingTime: job.endTime - job.startTime,
      progress: `${job.progress.toFixed(1)}%`,
      completedBatches: `${job.completedBatches}/${job.totalBatches}`
    });

    this.moveToHistory(job);
    return job;
  }

  /**
   * Cancel a running job
   */
  cancelJob(processingId: string, reason?: string): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      console.warn(`⚠️ Attempted to cancel unknown job: ${processingId}`);
      return null;
    }

    job.status = 'cancelled';
    job.endTime = Date.now();
    
    if (reason) {
      job.warnings.push(`Job cancelled: ${reason}`);
    }

    console.log(`🛑 Job cancelled: ${processingId}`, {
      reason: reason || 'User requested',
      processingTime: job.endTime - job.startTime,
      progress: `${job.progress.toFixed(1)}%`
    });

    this.moveToHistory(job);
    return job;
  }

  /**
   * Update job with server-assigned jobId after successful upload
   */
  updateJobId(processingId: string, jobId: string): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      // ✅ CRITICAL FIX: Check job history before warning - job might be completed but still processing virtual images
      const historicalJob = this.jobHistory.find(j => j.processingId === processingId);
      if (historicalJob) {
        console.log(`🔗 Job ID assigned to completed job (OK): ${processingId} → ${jobId}`);
        historicalJob.jobId = jobId;
        return historicalJob;
      }
      
      console.warn(`⚠️ Attempted to update jobId for unknown job: ${processingId}`);
      return null;
    }

    job.jobId = jobId;
    console.log(`🔗 Job ID assigned: ${processingId} → ${jobId}`);
    return job;
  }

  /**
   * Update job with S3 bucket name after successful upload
   */
  updateBucketName(processingId: string, bucketName: string): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      // Check if job exists in history before warning
      const historicalJob = this.jobHistory.find(j => j.processingId === processingId);
      if (!historicalJob) {
        console.warn(`⚠️ Attempted to update bucketName for unknown job: ${processingId}`);
      }
      return null;
    }

    job.bucketName = bucketName;
    console.log(`🪣 Bucket name assigned: ${processingId} → ${bucketName}`);
    return job;
  }

  /**
   * Update job with total batch count after batch creation
   */
  updateTotalBatches(processingId: string, totalBatches: number): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      console.warn(`⚠️ Attempted to update totalBatches for unknown job: ${processingId}`);
      return null;
    }

    job.totalBatches = totalBatches;
    console.log(`📦 Total batches updated: ${processingId} → ${totalBatches} batches`);
    return job;
  }

  /**
   * Complete job with final results
   */
  completeJob(processingId: string, results: ProcessingResults): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      // Check if job exists in history before warning
      const historicalJob = this.jobHistory.find(j => j.processingId === processingId);
      if (!historicalJob) {
        console.warn(`⚠️ Attempted to complete unknown job: ${processingId}`);
      }
      return null;
    }

    job.status = 'completed';
    job.endTime = Date.now();
    job.results = results;
    job.progress = 100;

    const processingTime = job.endTime - job.startTime;
    
    console.log(`✅ Job completed: ${processingId}`, {
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      uploadedImages: results.uploadedImages,
      failedImages: results.failedImages,
      processingTimeMs: processingTime,
      compressionRatio: `${(results.compressionStats.compressionRatio * 100).toFixed(1)}%`,
      errors: job.errors.length,
      warnings: job.warnings.length
    });

    this.moveToHistory(job);
    return job;
  }

  /**
   * ✅ CRITICAL FIX: Complete job after virtual image processing
   * This ensures ML Kit data is preserved until the full pipeline is done
   */
  completeJobWithVirtualImages(processingId: string): JobStatus | null {
    const job = this.activeJobs.get(processingId);
    if (!job) {
      console.warn(`⚠️ Attempted to complete unknown job: ${processingId}`);
      return null;
    }

    job.status = 'completed';
    job.endTime = Date.now();
    
    console.log(`✅ Job fully completed including virtual images: ${processingId}`, {
      totalTime: `${((job.endTime - job.startTime) / 1000).toFixed(1)}s`,
      finalStatus: job.status,
      processedImages: job.processedImages,
      totalImages: job.totalImages
    });

    this.moveToHistory(job);
    return job;
  }

  /**
   * Get current job status
   */
  getJobStatus(processingId: string): JobStatus | null {
    return this.activeJobs.get(processingId) || 
           this.jobHistory.find(job => job.processingId === processingId) || 
           null;
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): JobStatus[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get job history
   */
  getJobHistory(limit?: number): JobStatus[] {
    const history = [...this.jobHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Monitor job status from server
   */
  async monitorServerStatus(processingId: string): Promise<{
    serverStatus: any;
    localStatus: JobStatus | null;
    syncedStatus: JobStatus | null;
  }> {
    try {
      const localStatus = this.getJobStatus(processingId);
      
      // Use jobId if available, otherwise fall back to processingId
      const requestParams = localStatus?.jobId 
        ? { jobId: localStatus.jobId }
        : { processingId };

      console.log(`🔍 Checking server status for ${processingId}:`, {
        ...requestParams,
        // DEBUGGING: Track job ID flow
        localJobId: localStatus?.jobId,
        bucketName: localStatus?.bucketName,
        localStatus: localStatus?.status,
        timestamp: new Date().toISOString()
      });

      // Get server status
      const { data: serverData, error } = await supabase.functions.invoke('bulk-nsfw-status', {
        body: requestParams
      });

      if (error) {
        console.error(`❌ Failed to get server status for ${processingId}:`, error);
        return {
          serverStatus: null,
          localStatus,
          syncedStatus: null
        };
      }
      
      // Sync local status with server if available
      let syncedStatus: JobStatus | null = null;
      if (localStatus && serverData) {
        syncedStatus = {
          ...localStatus,
          processedImages: serverData.processedImages || localStatus.processedImages,
          completedBatches: serverData.completedBatches || localStatus.completedBatches,
          progress: serverData.progress || localStatus.progress,
          status: serverData.status || localStatus.status
        };

        // Update local job if it's still active
        if (this.activeJobs.has(processingId)) {
          this.activeJobs.set(processingId, syncedStatus);
        }
      }

      return {
        serverStatus: serverData,
        localStatus,
        syncedStatus
      };

    } catch (error) {
      console.error(`❌ Server status monitoring error for ${processingId}:`, error);
      return {
        serverStatus: null,
        localStatus: this.getJobStatus(processingId),
        syncedStatus: null
      };
    }
  }

  /**
   * Calculate job metrics
   */
  calculateMetrics(): JobMetrics {
    const completedJobs = this.jobHistory.filter(job => 
      job.status === 'completed' && job.endTime && job.results
    );

    if (completedJobs.length === 0) {
      return {
        averageProcessingTime: 0,
        successRate: 0,
        compressionEfficiency: 0,
        errorRate: 0,
        throughputImagesPerSecond: 0
      };
    }

    const totalJobs = this.jobHistory.length;
    const successfulJobs = completedJobs.length;
    const failedJobs = this.jobHistory.filter(job => job.status === 'failed').length;

    const avgProcessingTime = completedJobs.reduce((sum, job) => 
      sum + (job.endTime! - job.startTime), 0) / completedJobs.length;

    const totalImages = completedJobs.reduce((sum, job) => sum + job.totalImages, 0);
    const totalProcessingTime = completedJobs.reduce((sum, job) => 
      sum + (job.endTime! - job.startTime), 0) / 1000; // Convert to seconds

    const throughput = totalProcessingTime > 0 ? totalImages / totalProcessingTime : 0;

    const avgCompressionRatio = completedJobs
      .filter(job => job.results?.compressionStats)
      .reduce((sum, job) => sum + job.results!.compressionStats.compressionRatio, 0) / 
      completedJobs.filter(job => job.results?.compressionStats).length || 0;

    const metrics: JobMetrics = {
      averageProcessingTime: avgProcessingTime,
      successRate: totalJobs > 0 ? (successfulJobs / totalJobs) * 100 : 0,
      compressionEfficiency: avgCompressionRatio * 100,
      errorRate: totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0,
      throughputImagesPerSecond: throughput
    };

    return metrics;
  }

  /**
   * Clean up old job history
   */
  cleanupHistory(): void {
    if (this.jobHistory.length > this.maxHistorySize) {
      const removed = this.jobHistory.splice(0, this.jobHistory.length - this.maxHistorySize);
      console.log(`🧹 Cleaned up ${removed.length} old job entries`);
    }
  }

  /**
   * Get comprehensive monitoring dashboard data
   */
  getDashboardData(): {
    activeJobs: JobStatus[];
    recentHistory: JobStatus[];
    metrics: JobMetrics;
    systemStatus: {
      totalActiveJobs: number;
      longestRunningJob?: string;
      averageJobDuration: number;
    };
  } {
    const activeJobs = this.getActiveJobs();
    const recentHistory = this.getJobHistory(10);
    const metrics = this.calculateMetrics();

    let longestRunningJob: string | undefined;
    let maxDuration = 0;
    const now = Date.now();

    activeJobs.forEach(job => {
      const duration = now - job.startTime;
      if (duration > maxDuration) {
        maxDuration = duration;
        longestRunningJob = job.processingId;
      }
    });

    const averageJobDuration = recentHistory
      .filter(job => job.endTime)
      .reduce((sum, job) => sum + (job.endTime! - job.startTime), 0) / 
      Math.max(recentHistory.filter(job => job.endTime).length, 1);

    return {
      activeJobs,
      recentHistory,
      metrics,
      systemStatus: {
        totalActiveJobs: activeJobs.length,
        longestRunningJob,
        averageJobDuration
      }
    };
  }

  /**
   * Move job from active to history
   */
  private moveToHistory(job: JobStatus): void {
    this.activeJobs.delete(job.processingId);
    this.jobHistory.push(job);
    this.cleanupHistory();
  }

  /**
   * Export job data for analysis
   */
  exportJobData(): {
    activeJobs: JobStatus[];
    completedJobs: JobStatus[];
    failedJobs: JobStatus[];
    metrics: JobMetrics;
    exportTimestamp: string;
  } {
    const completedJobs = this.jobHistory.filter(job => job.status === 'completed');
    const failedJobs = this.jobHistory.filter(job => job.status === 'failed');

    return {
      activeJobs: this.getActiveJobs(),
      completedJobs,
      failedJobs,
      metrics: this.calculateMetrics(),
      exportTimestamp: new Date().toISOString()
    };
  }
}
