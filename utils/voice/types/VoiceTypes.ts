export interface VoiceRecordingState {
  isRecording: boolean;
  isTranscribing: boolean;
  isPaused: boolean;
  recordingDuration: number;
  audioLevel: number;
}

export interface VoiceRecordingResult {
  uri: string;
  duration: number;
  size?: number;
  format?: string;
  channels?: number;
  sampleRate?: number;
  bitRate?: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  duration?: number;
}

export class VoiceError extends Error {
  public readonly code: VoiceErrorCode;
  public readonly details?: any;

  constructor(config: { code: VoiceErrorCode; message: string; details?: any }) {
    super(config.message);
    this.name = 'VoiceError';
    this.code = config.code;
    this.details = config.details;
  }
}

export enum VoiceErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RECORDING_FAILED = 'RECORDING_FAILED',
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  UNSUPPORTED_PLATFORM = 'UNSUPPORTED_PLATFORM',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_AUDIO = 'INVALID_AUDIO',
  API_QUOTA_EXCEEDED = 'API_QUOTA_EXCEEDED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface VoiceInputConfig {
  maxRecordingDuration?: number; // seconds
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  format?: AudioFormat;
  autoStop?: boolean;
  enableNoiseReduction?: boolean;
}

export enum AudioFormat {
  M4A = 'm4a',
  WAV = 'wav',
  MP3 = 'mp3',
  WEBM = 'webm'
}

export interface VoiceInputCallbacks {
  onRecordingStart?: () => void;
  onRecordingStop?: (result: VoiceRecordingResult) => void;
  onTranscriptionStart?: () => void;
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
  onError?: (error: VoiceError) => void;
  onStateChange?: (state: VoiceRecordingState) => void;
  onAudioLevel?: (level: number) => void;
}

export interface VoiceInputState extends VoiceRecordingState {
  lastRecording?: VoiceRecordingResult;
  lastTranscription?: TranscriptionResult;
  error?: VoiceError;
}
