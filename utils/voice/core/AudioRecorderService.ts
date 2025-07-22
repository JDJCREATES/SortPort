import { AudioRecorderAdapter, AudioRecorderConfig, AudioRecordingResult, AudioRecordingStatus, DEFAULT_AUDIO_CONFIG } from '../types/AudioTypes';
import { VoiceError, VoiceErrorCode, VoiceInputCallbacks } from '../types/VoiceTypes';
import { PlatformAudioFactory } from '../adapters/PlatformAudioFactory';

export class AudioRecorderService {
  private adapter: AudioRecorderAdapter | null = null;
  private config: AudioRecorderConfig;
  private callbacks: VoiceInputCallbacks;
  private recordingTimer: NodeJS.Timeout | null = null;
  private meteringTimer: NodeJS.Timeout | null = null;
  private startTime: number = 0;

  constructor(config?: Partial<AudioRecorderConfig>, callbacks?: VoiceInputCallbacks) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
    this.callbacks = callbacks || {};
  }

  async initialize(): Promise<void> {
    try {
      this.adapter = PlatformAudioFactory.createAdapter();
      
      if (!this.adapter.isAvailable()) {
        throw new VoiceError({
          code: VoiceErrorCode.UNSUPPORTED_PLATFORM,
          message: 'Audio recording not available on this platform'
        });
      }

      await this.adapter.initialize(this.config);
    } catch (error) {
      if (error instanceof VoiceError) {
        throw error;
      }
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to initialize audio recorder',
        details: error
      });
    }
  }

  async requestPermissions(): Promise<boolean> {
    console.log('🔐 AudioRecorderService: Requesting permissions...');
    
    if (!this.adapter) {
      console.log('🔐 No adapter, initializing...');
      await this.initialize();
    }

    try {
      console.log('🔐 Calling adapter.requestPermissions()...');
      const result = await this.adapter!.requestPermissions();
      console.log('🔐 Permission result:', result);
      return result.granted;
    } catch (error) {
      console.log('❌ Permission request failed:', error);
      this.callbacks.onError?.(error instanceof VoiceError ? error : new VoiceError({
        code: VoiceErrorCode.PERMISSION_DENIED,
        message: 'Failed to request permissions',
        details: error
      }));
      return false;
    }
  }

  async startRecording(): Promise<void> {
    console.log('🎧 AudioRecorderService: Starting recording...');
    
    if (!this.adapter) {
      console.log('🎧 No adapter, initializing...');
      await this.initialize();
    }

    try {
      // Check permissions first
      console.log('🎧 Checking permissions...');
      const hasPermission = await this.requestPermissions();
      console.log('🎧 Permission result:', hasPermission);
      
      if (!hasPermission) {
        console.log('❌ Permission denied');
        throw new VoiceError({
          code: VoiceErrorCode.PERMISSION_DENIED,
          message: 'Microphone permission required'
        });
      }

      console.log('🎧 Calling adapter.startRecording()...');
      await this.adapter!.startRecording();
      console.log('🎧 Adapter startRecording completed successfully');
      
      this.startTime = Date.now();
      
      console.log('🎧 Firing onRecordingStart callback...');
      this.callbacks.onRecordingStart?.();
      console.log('🎧 Starting timers...');
      this.startTimers();
      
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to start recording',
        details: error
      });
      
      this.callbacks.onError?.(voiceError);
      throw voiceError;
    }
  }

  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.adapter) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording session'
      });
    }

    try {
      this.stopTimers();
      const result = await this.adapter.stopRecording();
      
      this.callbacks.onRecordingStop?.(result);
      return result;
      
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to stop recording',
        details: error
      });
      
      this.callbacks.onError?.(voiceError);
      throw voiceError;
    }
  }

  async pauseRecording(): Promise<void> {
    if (!this.adapter) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording session'
      });
    }

    try {
      await this.adapter.pauseRecording();
      this.stopTimers();
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to pause recording',
        details: error
      });
      
      this.callbacks.onError?.(voiceError);
      throw voiceError;
    }
  }

  async resumeRecording(): Promise<void> {
    if (!this.adapter) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording session'
      });
    }

    try {
      await this.adapter.resumeRecording();
      this.startTimers();
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to resume recording',
        details: error
      });
      
      this.callbacks.onError?.(voiceError);
      throw voiceError;
    }
  }

  async cancelRecording(): Promise<void> {
    try {
      this.stopTimers();
      await this.adapter?.cancelRecording();
    } catch (error) {
      console.warn('Error canceling recording:', error);
    }
  }

  getRecordingStatus(): AudioRecordingStatus {
    if (!this.adapter) {
      return {
        isRecording: false,
        isPaused: false,
        duration: 0,
      };
    }

    return this.adapter.getRecordingStatus();
  }

  isAvailable(): boolean {
    return PlatformAudioFactory.getAvailableAdapter() !== null;
  }

  private startTimers(): void {
    // Update recording duration every 100ms
    this.recordingTimer = setInterval(() => {
      const status = this.getRecordingStatus();
      this.callbacks.onStateChange?.({
        isRecording: status.isRecording,
        isTranscribing: false,
        isPaused: status.isPaused,
        recordingDuration: status.duration,
        audioLevel: status.metering || 0,
      });
    }, 100);

    // Update audio level metering if supported
    if (this.config.enableMetering) {
      this.meteringTimer = setInterval(() => {
        const status = this.getRecordingStatus();
        if (status.metering !== undefined) {
          this.callbacks.onAudioLevel?.(status.metering);
        }
      }, 50);
    }

    // Auto-stop recording if max duration is reached
    if (this.config.maxDuration) {
      setTimeout(() => {
        const status = this.getRecordingStatus();
        if (status.isRecording && status.duration >= this.config.maxDuration!) {
          this.stopRecording().catch(console.error);
        }
      }, this.config.maxDuration * 1000);
    }
  }

  private stopTimers(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    
    if (this.meteringTimer) {
      clearInterval(this.meteringTimer);
      this.meteringTimer = null;
    }
  }

  updateCallbacks(callbacks: VoiceInputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async cleanup(): Promise<void> {
    this.stopTimers();
    await this.adapter?.cleanup();
    this.adapter = null;
  }
}
