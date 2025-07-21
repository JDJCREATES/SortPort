import { Platform } from 'react-native';
import { 
  AudioRecorderAdapter, 
  AudioRecorderConfig, 
  AudioRecordingResult, 
  AudioRecordingStatus, 
  PermissionResult 
} from '../types/AudioTypes';
import { VoiceError, VoiceErrorCode } from '../types/VoiceTypes';

export class WebAudioAdapter implements AudioRecorderAdapter {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private config: AudioRecorderConfig | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private isRecording: boolean = false;
  private isPaused: boolean = false;

  async initialize(config: AudioRecorderConfig): Promise<void> {
    if (Platform.OS !== 'web') {
      throw new VoiceError({
        code: VoiceErrorCode.UNSUPPORTED_PLATFORM,
        message: 'Web Audio API is only available on web platform'
      });
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new VoiceError({
        code: VoiceErrorCode.UNSUPPORTED_PLATFORM,
        message: 'MediaDevices API not supported in this browser'
      });
    }

    this.config = config;
  }

  async startRecording(): Promise<void> {
    if (!this.config) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Adapter not initialized'
      });
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const mimeType = this.config.web?.mimeType || 'audio/webm;codecs=opus';
      
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn(`MIME type ${mimeType} not supported, falling back to default`);
      }

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
        audioBitsPerSecond: this.config.web?.audioBitsPerSecond || this.config.bitRate,
      });

      this.audioChunks = [];
      this.startTime = Date.now();

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;
      this.isPaused = false;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new VoiceError({
            code: VoiceErrorCode.PERMISSION_DENIED,
            message: 'Microphone permission denied'
          });
        }
        if (error.name === 'NotFoundError') {
          throw new VoiceError({
            code: VoiceErrorCode.RECORDING_FAILED,
            message: 'No microphone found'
          });
        }
      }
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'Failed to start recording',
        details: error
      });
    }
  }

  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.mediaRecorder || !this.isRecording) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording to stop'
      });
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new VoiceError({
          code: VoiceErrorCode.RECORDING_FAILED,
          message: 'MediaRecorder not available'
        }));
        return;
      }

      this.mediaRecorder.onstop = () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder?.mimeType || 'audio/webm' 
          });
          
          const uri = URL.createObjectURL(audioBlob);
          const duration = (Date.now() - this.startTime) / 1000;

          this.cleanup();

          resolve({
            uri,
            duration,
            size: audioBlob.size,
            channels: this.config?.channels,
            sampleRate: this.config?.sampleRate,
            bitRate: this.config?.bitRate,
          });
        } catch (error) {
          reject(new VoiceError({
            code: VoiceErrorCode.RECORDING_FAILED,
            message: 'Failed to process recording',
            details: error
          }));
        }
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  async pauseRecording(): Promise<void> {
    if (!this.mediaRecorder || !this.isRecording) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No active recording to pause'
      });
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
    }
  }

  async resumeRecording(): Promise<void> {
    if (!this.mediaRecorder || !this.isPaused) {
      throw new VoiceError({
        code: VoiceErrorCode.RECORDING_FAILED,
        message: 'No paused recording to resume'
      });
    }

    if (this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
    }
  }

  async cancelRecording(): Promise<void> {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  getRecordingStatus(): AudioRecordingStatus {
    const duration = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
    
    return {
      isRecording: this.isRecording && !this.isPaused,
      isPaused: this.isPaused,
      duration,
    };
  }

  async requestPermissions(): Promise<PermissionResult> {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return {
        granted: true,
        status: 'granted'
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        return {
          granted: false,
          status: 'denied'
        };
      }
      throw new VoiceError({
        code: VoiceErrorCode.PERMISSION_DENIED,
        message: 'Failed to request microphone permissions',
        details: error
      });
    }
  }

  isAvailable(): boolean {
    return Platform.OS === 'web' && 
           typeof navigator !== 'undefined' && 
           navigator.mediaDevices && 
           navigator.mediaDevices.getUserMedia &&
           typeof MediaRecorder !== 'undefined';
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = 0;
  }

  async cleanup(): Promise<void> {
    this.cleanup();
  }
}
