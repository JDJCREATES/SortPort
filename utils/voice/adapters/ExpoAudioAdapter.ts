import { Platform } from 'react-native';
import { useAudioRecorder, AudioModule } from 'expo-audio';
import { 
  AudioRecorderAdapter, 
  AudioRecorderConfig, 
  AudioRecordingResult, 
  AudioRecordingStatus, 
  PermissionResult 
} from '../types/AudioTypes';
import { VoiceError, VoiceErrorCode } from '../types/VoiceTypes';

export class ExpoAudioAdapter implements AudioRecorderAdapter {
  private recorder: any = null;
  private config: AudioRecorderConfig | null = null;
  private isInitialized = false;

  async initialize(config: AudioRecorderConfig): Promise<void> {
    if (Platform.OS === 'web') {
      throw new VoiceError({
        code: VoiceErrorCode.UNSUPPORTED_PLATFORM,
        message: 'Expo Audio is not supported on web platform'
      });
    }

    try {
      this.config = config;
      
      if (config.recorderInstance) {
        // Use the passed recorder instance from React hook
        this.recorder = config.recorderInstance;
      } else {
        throw new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'No recorder instance provided. useAudioRecorder hook must be called at component level.'
        });
      }

      this.isInitialized = true;
    } catch (error) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to initialize Expo Audio recorder',
        details: error
      });
    }
  }

  async startRecording(): Promise<void> {
    if (!this.isInitialized || !this.recorder) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Recorder not initialized'
      });
    }

    try {
      console.log('🎤 ExpoAudioAdapter: Starting recording...');
      console.log('🎤 Recorder state before:', {
        isRecording: this.recorder.isRecording,
        isPaused: this.recorder.isPaused,
        isReleased: this.recorder._isReleased,
        hasNative: this.recorder._native !== null
      });
      
      // Check if recorder is still valid (not released)
      if (this.recorder._isReleased || this.recorder._native === null) {
        console.log('❌ Recorder is released or has no native object');
        throw new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'Audio recorder has been released. Please reinitialize.'
        });
      }
      
      console.log('🎤 Preparing recorder...');
      await this.recorder.prepareToRecordAsync();
      
      console.log('🎤 Calling recorder.record()...');
      await this.recorder.record();
      
      console.log('🎤 recorder.record() completed, waiting for state update...');
      
      // Wait for React hook state to update (hooks are async)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('🎤 Recorder state after delay:', {
        isRecording: this.recorder.isRecording,
        isPaused: this.recorder.isPaused,
        duration: this.recorder.duration
      });
      
      // Give it one more chance with longer delay if still not recording
      if (!this.recorder.isRecording) {
        console.log('🎤 First check failed, waiting longer...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log('🎤 Recorder state after longer delay:', {
          isRecording: this.recorder.isRecording,
          isPaused: this.recorder.isPaused,
          duration: this.recorder.duration
        });
      }
      
      // Verify recording actually started
      if (!this.recorder.isRecording) {
        console.log('❌ Recording failed to start after delays - isRecording is still false');
        throw new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'Recording failed to start. This might be an expo-audio configuration issue.'
        });
      }
      
      console.log('✅ Recording successfully started');
    } catch (error) {
      // Handle specific Expo Audio errors
      if (error instanceof Error && error.message.includes('shared object that was already released')) {
        throw new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'Audio recorder was released. Please restart the recording.'
        });
      }
      
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to start recording',
        details: error
      });
    }
  }

  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.recorder) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording to stop'
      });
    }

    try {
      // Check if recorder is still valid before stopping
      if (this.recorder._isReleased || this.recorder._native === null) {
        throw new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'Audio recorder has been released'
        });
      }
      
      await this.recorder.stop();
      
      // Wait for recording to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      let uri = this.recorder.uri;
      
      // Try alternative methods to get URI
      if (!uri) {
        uri = (this.recorder as any).getURI?.() || 
              (this.recorder as any).recordingUri || 
              (this.recorder as any).fileUri;
      }

      if (!uri) {
        throw new VoiceError({
          code: VoiceErrorCode.INVALID_AUDIO,
          message: 'Recording URI not available'
        });
      }

      // Get recording info if available
      const duration = (this.recorder as any).duration || 0;
      const size = (this.recorder as any).size;

      return {
        uri,
        duration,
        size,
        channels: this.config?.channels,
        sampleRate: this.config?.sampleRate,
        bitRate: this.config?.bitRate,
      };
    } catch (error) {
      if (error instanceof VoiceError) {
        throw error;
      }
      
      // Handle shared object released error
      if (error instanceof Error && error.message.includes('shared object that was already released')) {
        throw new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'Audio recorder was released during recording'
        });
      }
      
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to stop recording',
        details: error
      });
    }
  }

  async pauseRecording(): Promise<void> {
    if (!this.recorder?.pause) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Pause functionality not available'
      });
    }

    try {
      await this.recorder.pause();
    } catch (error) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to pause recording',
        details: error
      });
    }
  }

  async resumeRecording(): Promise<void> {
    if (!this.recorder?.resume) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Resume functionality not available'
      });
    }

    try {
      await this.recorder.resume();
    } catch (error) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to resume recording',
        details: error
      });
    }
  }

  async cancelRecording(): Promise<void> {
    if (!this.recorder) {
      return; // Nothing to cancel
    }

    try {
      if (this.recorder.isRecording) {
        await this.recorder.stop();
      }
      // Clear the recorder state
      this.recorder = null;
    } catch (error) {
      console.warn('Error canceling recording:', error);
    }
  }

  getRecordingStatus(): AudioRecordingStatus {
    if (!this.recorder || this.recorder._isReleased || this.recorder._native === null) {
      return {
        isRecording: false,
        isPaused: false,
        duration: 0,
      };
    }

    try {
      return {
        isRecording: this.recorder.isRecording || false,
        isPaused: this.recorder.isPaused || false,
        duration: this.recorder.duration || 0,
        metering: this.recorder.metering,
      };
    } catch (error) {
      // If recorder is released, return default state
      return {
        isRecording: false,
        isPaused: false,
        duration: 0,
      };
    }
  }

  async requestPermissions(): Promise<PermissionResult> {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      
      return {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.granted ? 'granted' : 'denied'
      };
    } catch (error) {
      throw new VoiceError({
        code: VoiceErrorCode.PERMISSION_DENIED,
        message: 'Failed to request recording permissions',
        details: error
      });
    }
  }

  isAvailable(): boolean {
    return Platform.OS !== 'web' && AudioModule !== undefined;
  }

  async cleanup(): Promise<void> {
    try {
      if (this.recorder && !this.recorder._isReleased) {
        // Only try to stop if recorder is still valid
        if (this.recorder.isRecording) {
          try {
            await this.recorder.stop();
          } catch (error) {
            console.warn('Error stopping recorder during cleanup:', error);
          }
        }
      }
      this.recorder = null;
      this.config = null;
      this.isInitialized = false;
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }
}
