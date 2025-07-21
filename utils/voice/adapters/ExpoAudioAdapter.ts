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
      
      // Initialize the recorder with proper configuration
      this.recorder = useAudioRecorder({
        extension: config.format.startsWith('.') ? config.format : `.${config.format}`,
        sampleRate: config.sampleRate,
        numberOfChannels: config.channels,
        bitRate: config.bitRate,
        android: config.android,
        ios: config.ios,
      } as any);

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
      await this.recorder.record();
    } catch (error) {
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
    if (!this.recorder) {
      return {
        isRecording: false,
        isPaused: false,
        duration: 0,
      };
    }

    return {
      isRecording: this.recorder.isRecording || false,
      isPaused: this.recorder.isPaused || false,
      duration: this.recorder.duration || 0,
      metering: this.recorder.metering,
    };
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
      if (this.recorder?.isRecording) {
        await this.cancelRecording();
      }
      this.recorder = null;
      this.config = null;
      this.isInitialized = false;
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }
}
