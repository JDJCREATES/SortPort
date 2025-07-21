// Core services
export { VoiceInputController } from './core/VoiceInputController';
export { AudioRecorderService } from './core/AudioRecorderService';
export { TranscriptionService } from './core/TranscriptionService';
export { VoiceStateManager } from './core/VoiceStateManager';

// Adapters
export { ExpoAudioAdapter } from './adapters/ExpoAudioAdapter';
export { WebAudioAdapter } from './adapters/WebAudioAdapter';
export { PlatformAudioFactory } from './adapters/PlatformAudioFactory';

// Providers
export { OpenAITranscriptionProvider } from './providers/OpenAITranscriptionProvider';
export type { TranscriptionProvider, TranscriptionOptions } from './providers/OpenAITranscriptionProvider';

// Types
export * from './types/VoiceTypes';
export * from './types/AudioTypes';

// Hooks
export { useVoiceInput, useVoiceToText } from '../../hooks/useVoiceInput';
export type { UseVoiceInputConfig, UseVoiceInputReturn } from '../../hooks/useVoiceInput';
