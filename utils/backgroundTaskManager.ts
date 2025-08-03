import { AppState, AppStateStatus } from 'react-native';

/**
 * 📱 Background Task Manager
 *  private async registerBackgroundTask() {
    // Skip background task registration to avoid ExpoTaskManager errors
    // console.log('📱 Background task registration skipped (using app state monitoring only)');
    this.backgroundTaskRegistered = false;
  }les app state changes and keeps critical operations running
 * when the app goes to background during uploads/processing
 */

export interface BackgroundTaskConfig {
  taskName: string;
  interval: number; // in seconds
  enableInBackground: boolean;
}

export interface ActiveUpload {
  id: string;
  jobId: string;
  totalBatches: number;
  completedBatches: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  startTime: number;
}

class BackgroundTaskManager {
  private static instance: BackgroundTaskManager;
  private appState: AppStateStatus = 'active';
  private activeUploads = new Map<string, ActiveUpload>();
  private backgroundTaskRegistered = false;
  private uploadStateListeners = new Set<(uploads: ActiveUpload[]) => void>();
  private appStateSubscription: any = null;
  private lastStateChangeTime = 0;
  private stateChangeDebounceMs = 2000; // 2 second debounce for real state changes
  private pendingStateTimeout: NodeJS.Timeout | null = null;

  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager();
    }
    return BackgroundTaskManager.instance;
  }

  constructor() {
    this.setupAppStateListener();
    this.registerBackgroundTask(); // Safe now - just logs a message
  }

  private setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    const now = Date.now();
    const previousState = this.appState;
    
    // Skip if same state
    if (previousState === nextAppState) {
      return;
    }
    
    // Clear any pending timeout
    if (this.pendingStateTimeout) {
      clearTimeout(this.pendingStateTimeout);
      this.pendingStateTimeout = null;
    }
    
    // For background transitions, debounce to avoid modal spam
    if (nextAppState === 'background') {
      // Set a timeout to confirm this is a real background transition
      this.pendingStateTimeout = setTimeout(() => {
        if (this.appState !== 'active') { // Still not active after debounce
          this.handleAppGoingToBackground();
        }
        this.pendingStateTimeout = null;
      }, this.stateChangeDebounceMs);
      
      // Update state immediately but don't trigger actions yet
      this.appState = nextAppState;
      return;
    }
    
    // For active transitions, process immediately but with rate limiting
    if (nextAppState === 'active') {
      this.appState = nextAppState;
      
      // Only trigger foreground handling if it's been a reasonable time since last change
      if (now - this.lastStateChangeTime > 1000) {
        this.handleAppComingToForeground();
        this.lastStateChangeTime = now;
      }
      return;
    }
    
    // For other state changes (inactive), just update silently
    this.appState = nextAppState;
  };

  private async registerBackgroundTask() {
    // Skip background task registration to avoid ExpoTaskManager errors
    console.log('� Background task registration skipped (using app state monitoring only)');
    this.backgroundTaskRegistered = false;
  }

  private handleAppGoingToBackground() {
    const activeUploadCount = Array.from(this.activeUploads.values())
      .filter(upload => upload.status === 'uploading' || upload.status === 'processing').length;

    if (activeUploadCount > 0) {
      console.log(`🔄 ${activeUploadCount} uploads continuing in background`);
      this.showBackgroundUploadNotification();
    }
  }

  private handleAppComingToForeground() {
    // Only log if there were active uploads
    const activeUploadCount = Array.from(this.activeUploads.values()).length;
    if (activeUploadCount > 0) {
      console.log('📱 Returned to foreground');
    }
    this.notifyUploadStateListeners();
  }

  private showBackgroundUploadNotification() {
    // Could implement push notifications here to inform user
    console.log('🔔 Would show notification: Upload continuing in background...');
  }

  // Public API for upload management
  public registerUpload(uploadId: string, jobId: string, totalBatches: number): void {
    this.activeUploads.set(uploadId, {
      id: uploadId,
      jobId,
      totalBatches,
      completedBatches: 0,
      status: 'uploading',
      startTime: Date.now(),
    });

    this.notifyUploadStateListeners();
  }

  public updateUploadProgress(uploadId: string, completedBatches: number): void {
    const upload = this.activeUploads.get(uploadId);
    if (upload) {
      upload.completedBatches = completedBatches;
      // Only log meaningful progress (not every single batch)
      if (completedBatches === upload.totalBatches) {
        console.log(`✅ Upload completed: ${uploadId}`);
      }
      this.notifyUploadStateListeners();
    }
  }

  public updateUploadStatus(uploadId: string, status: ActiveUpload['status']): void {
    const upload = this.activeUploads.get(uploadId);
    if (upload) {
      upload.status = status;
      
      // Only log final status changes
      if (status === 'completed' || status === 'failed') {
        console.log(`📊 Upload ${status}: ${uploadId}`);
      }

      // Clean up completed/failed uploads after 5 minutes
      if (status === 'completed' || status === 'failed') {
        setTimeout(() => {
          this.activeUploads.delete(uploadId);
          this.notifyUploadStateListeners();
        }, 5 * 60 * 1000);
      }

      this.notifyUploadStateListeners();
    }
  }

  public getActiveUploads(): ActiveUpload[] {
    return Array.from(this.activeUploads.values());
  }

  public addUploadStateListener(listener: (uploads: ActiveUpload[]) => void): void {
    this.uploadStateListeners.add(listener);
  }

  public removeUploadStateListener(listener: (uploads: ActiveUpload[]) => void): void {
    this.uploadStateListeners.delete(listener);
  }

  private notifyUploadStateListeners(): void {
    const uploads = this.getActiveUploads();
    this.uploadStateListeners.forEach(listener => listener(uploads));
  }

  public isAppInBackground(): boolean {
    return this.appState === 'background';
  }

  public getCurrentAppState(): AppStateStatus {
    return this.appState;
  }

  // Cleanup
  public cleanup(): void {
    if (this.pendingStateTimeout) {
      clearTimeout(this.pendingStateTimeout);
      this.pendingStateTimeout = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.uploadStateListeners.clear();
    this.activeUploads.clear();
  }
}

export const backgroundTaskManager = BackgroundTaskManager.getInstance();
