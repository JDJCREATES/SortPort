import { VoiceInputState, VoiceRecordingResult, TranscriptionResult, VoiceError } from '../types/VoiceTypes';

export type VoiceStateListener = (state: VoiceInputState) => void;

export class VoiceStateManager {
  private state: VoiceInputState = {
    isRecording: false,
    isTranscribing: false,
    isPaused: false,
    recordingDuration: 0,
    audioLevel: 0,
  };

  private listeners: Set<VoiceStateListener> = new Set();

  getState(): VoiceInputState {
    return { ...this.state };
  }

  subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('Error in voice state listener:', error);
      }
    });
  }

  private updateState(updates: Partial<VoiceInputState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  // Recording state management
  setRecordingState(isRecording: boolean): void {
    this.updateState({ isRecording });
  }

  setPausedState(isPaused: boolean): void {
    this.updateState({ isPaused });
  }

  setRecordingDuration(duration: number): void {
    this.updateState({ recordingDuration: duration });
  }

  setAudioLevel(level: number): void {
    this.updateState({ audioLevel: level });
  }

  // Transcription state management
  setTranscribingState(isTranscribing: boolean): void {
    this.updateState({ isTranscribing });
  }

  // Result management
  setLastRecording(recording: VoiceRecordingResult): void {
    this.updateState({ lastRecording: recording });
  }

  setLastTranscription(transcription: TranscriptionResult): void {
    this.updateState({ lastTranscription: transcription });
  }

  // Error management
  setError(error: VoiceError | undefined): void {
    this.updateState({ error });
  }

  clearError(): void {
    this.updateState({ error: undefined });
  }

  // Bulk state updates
  updateRecordingState(updates: {
    isRecording?: boolean;
    isPaused?: boolean;
    recordingDuration?: number;
    audioLevel?: number;
  }): void {
    this.updateState(updates);
  }

  // Reset methods
  resetRecordingState(): void {
    this.updateState({
      isRecording: false,
      isPaused: false,
      recordingDuration: 0,
      audioLevel: 0,
    });
  }

  resetTranscriptionState(): void {
    this.updateState({
      isTranscribing: false,
      lastTranscription: undefined,
    });
  }

  resetAll(): void {
    this.state = {
      isRecording: false,
      isTranscribing: false,
      isPaused: false,
      recordingDuration: 0,
      audioLevel: 0,
    };
    this.notifyListeners();
  }

  // Utility methods
  isActive(): boolean {
    return this.state.isRecording || this.state.isTranscribing;
  }

  canStartRecording(): boolean {
    return !this.state.isRecording && !this.state.isTranscribing;
  }

  canStopRecording(): boolean {
    return this.state.isRecording;
  }

  canPauseRecording(): boolean {
    return this.state.isRecording && !this.state.isPaused;
  }

  canResumeRecording(): boolean {
    return this.state.isRecording && this.state.isPaused;
  }

  // Cleanup
  destroy(): void {
    this.listeners.clear();
    this.resetAll();
  }
}
