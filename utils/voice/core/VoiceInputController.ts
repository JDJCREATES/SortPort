import { AudioRecorderService } from './AudioRecorderService';
import { TranscriptionService, TranscriptionConfig } from './TranscriptionService';
import { VoiceStateManager } from './VoiceStateManager';
import { 
  VoiceInputConfig, 
  VoiceInputCallbacks, 
  VoiceInputState,
  VoiceRecordingResult,
  TranscriptionResult,
  VoiceError,
  VoiceErrorCode 
} from '../types/VoiceTypes';
import { AudioRecorderConfig } from '../types/AudioTypes';
import { TranscriptionOptions } from '../providers/OpenAITranscriptionProvider';

export interface VoiceControllerConfig {
  audio?: Partial<AudioRecorderConfig>;
  transcription?: TranscriptionConfig;
  voice?: VoiceInputConfig;
}

export class VoiceInputController {
  private audioService: AudioRecorderService;
  private transcriptionService: TranscriptionService;
  private stateManager: VoiceStateManager;
  private callbacks: VoiceInputCallbacks;
  private config: VoiceInputConfig;

  constructor(config: VoiceControllerConfig = {}, callbacks: VoiceInputCallbacks = {}) {
    this.callbacks = callbacks;
    this.config = {
      maxRecordingDuration: 60, // 60 seconds default
      autoStop: true,
      enableNoiseReduction: true,
      ...config.voice
    };

    this.stateManager = new VoiceStateManager();
    
    // Create services with integrated callbacks
    this.audioService = new AudioRecorderService(
      config.audio, 
      this.createAudioCallbacks()
    );
    
    this.transcriptionService = new TranscriptionService(
      config.transcription,
      this.createTranscriptionCallbacks()
    );
  }

  private createAudioCallbacks(): VoiceInputCallbacks {
    return {
      onRecordingStart: () => {
        this.stateManager.setRecordingState(true);
        this.stateManager.clearError();
        this.callbacks.onRecordingStart?.();
      },
      
      onRecordingStop: (result: VoiceRecordingResult) => {
        this.stateManager.setRecordingState(false);
        this.stateManager.setLastRecording(result);
        this.callbacks.onRecordingStop?.(result);
      },
      
      onError: (error: VoiceError) => {
        this.stateManager.setError(error);
        this.stateManager.resetRecordingState();
        this.callbacks.onError?.(error);
      },
      
      onStateChange: (state) => {
        this.stateManager.updateRecordingState({
          isRecording: state.isRecording,
          isPaused: state.isPaused,
          recordingDuration: state.recordingDuration,
          audioLevel: state.audioLevel,
        });
        this.callbacks.onStateChange?.(this.stateManager.getState());
      },
      
      onAudioLevel: (level: number) => {
        this.stateManager.setAudioLevel(level);
        this.callbacks.onAudioLevel?.(level);
      }
    };
  }

  private createTranscriptionCallbacks(): VoiceInputCallbacks {
    return {
      onTranscriptionStart: () => {
        this.stateManager.setTranscribingState(true);
        this.stateManager.clearError();
        this.callbacks.onTranscriptionStart?.();
      },
      
      onTranscriptionComplete: (result: TranscriptionResult) => {
        this.stateManager.setTranscribingState(false);
        this.stateManager.setLastTranscription(result);
        this.callbacks.onTranscriptionComplete?.(result);
      },
      
      onError: (error: VoiceError) => {
        this.stateManager.setError(error);
        this.stateManager.setTranscribingState(false);
        this.callbacks.onError?.(error);
      }
    };
  }

  // Core functionality
  async initialize(): Promise<void> {
    try {
      await this.audioService.initialize();
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to initialize voice input',
        details: error
      });
      
      this.stateManager.setError(voiceError);
      throw voiceError;
    }
  }

  async startRecording(): Promise<void> {
    if (!this.stateManager.canStartRecording()) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Cannot start recording in current state'
      });
    }

    await this.audioService.startRecording();
  }

  async stopRecording(): Promise<VoiceRecordingResult> {
    if (!this.stateManager.canStopRecording()) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording to stop'
      });
    }

    return await this.audioService.stopRecording();
  }

  async pauseRecording(): Promise<void> {
    if (!this.stateManager.canPauseRecording()) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Cannot pause recording in current state'
      });
    }

    await this.audioService.pauseRecording();
  }

  async resumeRecording(): Promise<void> {
    if (!this.stateManager.canResumeRecording()) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Cannot resume recording in current state'
      });
    }

    await this.audioService.resumeRecording();
  }

  async cancelRecording(): Promise<void> {
    await this.audioService.cancelRecording();
    this.stateManager.resetRecordingState();
  }

  async transcribeAudio(audioUri: string, options?: TranscriptionOptions): Promise<TranscriptionResult> {
    if (!this.transcriptionService.isAvailable()) {
      throw new VoiceError({
        code: VoiceErrorCode.TRANSCRIPTION_FAILED,
        message: 'No transcription service available'
      });
    }

    return await this.transcriptionService.transcribe(audioUri, options);
  }

  // Convenience method: record and transcribe in one call
  async recordAndTranscribe(options?: TranscriptionOptions): Promise<TranscriptionResult> {
    const recording = await this.stopRecording();
    return await this.transcribeAudio(recording.uri, options);
  }

  // Voice input workflow: start recording, wait for user to stop, then transcribe
  async startVoiceInput(): Promise<void> {
    await this.startRecording();
  }

  async completeVoiceInput(options?: TranscriptionOptions): Promise<TranscriptionResult> {
    const recording = await this.stopRecording();
    return await this.transcribeAudio(recording.uri, options);
  }

  // State management
  getState(): VoiceInputState {
    return this.stateManager.getState();
  }

  subscribe(listener: (state: VoiceInputState) => void): () => void {
    return this.stateManager.subscribe(listener);
  }

  // Utility methods
  isAvailable(): boolean {
    return this.audioService.isAvailable() && this.transcriptionService.isAvailable();
  }

  isRecording(): boolean {
    return this.stateManager.getState().isRecording;
  }

  isTranscribing(): boolean {
    return this.stateManager.getState().isTranscribing;
  }

  isActive(): boolean {
    return this.stateManager.isActive();
  }

  getAvailableTranscriptionProviders(): string[] {
    return this.transcriptionService.getAvailableProviders();
  }

  // Configuration updates
  updateCallbacks(callbacks: Partial<VoiceInputCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.audioService.updateCallbacks(this.createAudioCallbacks());
    this.transcriptionService.updateCallbacks(this.createTranscriptionCallbacks());
  }

  updateConfig(config: Partial<VoiceInputConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    await this.audioService.cleanup();
    this.stateManager.destroy();
  }
}
