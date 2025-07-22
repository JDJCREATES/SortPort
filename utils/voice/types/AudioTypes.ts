import { Platform } from 'react-native';

export interface AudioRecorderAdapter {
  initialize(config: AudioRecorderConfig): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<AudioRecordingResult>;
  pauseRecording(): Promise<void>;
  resumeRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
  getRecordingStatus(): AudioRecordingStatus;
  requestPermissions(): Promise<PermissionResult>;
  isAvailable(): boolean;
  cleanup(): Promise<void>;
}

export interface AudioRecorderConfig {
  sampleRate: number;
  channels: number;
  bitRate: number;
  format: string;
  maxDuration?: number;
  enableMetering?: boolean;
  recorderInstance?: any; // For passing React hook instance
  android?: {
    extension: string;
    outputFormat: string;
    audioEncoder: string;
    sampleRate: number;
  };
  ios?: {
    extension: string;
    outputFormat: string;
    sampleRate: number;
  };
  web?: {
    mimeType: string;
    audioBitsPerSecond: number;
  };
}

export interface AudioRecordingResult {
  uri: string;
  duration: number;
  size?: number;
  channels?: number;
  sampleRate?: number;
  bitRate?: number;
}

export interface AudioRecordingStatus {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  metering?: number;
}

export interface PermissionResult {
  granted: boolean;
  canAskAgain?: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

export interface PlatformCapabilities {
  canRecord: boolean;
  canPause: boolean;
  supportedFormats: string[];
  maxDuration?: number;
  hasMetering: boolean;
}

export const DEFAULT_AUDIO_CONFIG: AudioRecorderConfig = {
  sampleRate: 44100,
  channels: 1,
  bitRate: 128000,
  format: Platform.select({
    ios: 'm4a',
    android: 'm4a',
    web: 'webm',
    default: 'm4a'
  }),
  enableMetering: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 44100,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'mpeg4aac',
    sampleRate: 44100,
  },
  web: {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000,
  }
};
