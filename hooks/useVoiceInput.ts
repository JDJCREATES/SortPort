import { useEffect, useRef, useState } from 'react';
import { VoiceInputController, VoiceControllerConfig } from '../utils/voice/core/VoiceInputController';
import { 
  VoiceInputState, 
  VoiceInputCallbacks, 
  TranscriptionResult, 
  VoiceRecordingResult,
  VoiceError 
} from '../utils/voice/types/VoiceTypes';
import { TranscriptionOptions } from '../utils/voice/providers/OpenAITranscriptionProvider';

export interface UseVoiceInputConfig extends VoiceControllerConfig {
  autoInitialize?: boolean;
}

export interface UseVoiceInputReturn {
  // State
  state: VoiceInputState;
  isAvailable: boolean;
  
  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<VoiceRecordingResult>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  transcribeAudio: (audioUri: string, options?: TranscriptionOptions) => Promise<TranscriptionResult>;
  recordAndTranscribe: (options?: TranscriptionOptions) => Promise<TranscriptionResult>;
  
  // Convenience methods
  startVoiceInput: () => Promise<void>;
  completeVoiceInput: (options?: TranscriptionOptions) => Promise<TranscriptionResult>;
  
  // Utils
  clearError: () => void;
  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export function useVoiceInput(
  config: UseVoiceInputConfig = {},
  callbacks: VoiceInputCallbacks = {}
): UseVoiceInputReturn {
  const controllerRef = useRef<VoiceInputController | null>(null);
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    isPaused: false,
    recordingDuration: 0,
    audioLevel: 0,
  });
  const [isAvailable, setIsAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasCleanedUp = useRef(false);

  // Create controller instance
  useEffect(() => {
    const controller = new VoiceInputController(config, {
      ...callbacks,
      onStateChange: (newState) => {
        setState(newState);
        callbacks.onStateChange?.(newState);
      },
    });
    
    controllerRef.current = controller;
    setIsAvailable(controller.isAvailable());

    // Subscribe to state manager for real-time updates
    const unsubscribe = controller.subscribe((newState) => {
      setState(newState);
    });

    // Auto-initialize if enabled
    if (config.autoInitialize !== false) {
      initialize();
    }

    return () => {
      unsubscribe();
      cleanup();
    };
  }, []);

  // Update callbacks when they change
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.updateCallbacks({
        ...callbacks,
        onStateChange: (newState) => {
          setState(newState);
          callbacks.onStateChange?.(newState);
        },
      });
    }
  }, [callbacks]);

  const initialize = async (): Promise<void> => {
    if (!controllerRef.current || isInitialized) return;
    
    try {
      await controllerRef.current.initialize();
      setIsInitialized(true);
      setIsAvailable(controllerRef.current.isAvailable());
    } catch (error) {
      console.error('Failed to initialize voice input:', error);
      setIsAvailable(false);
      throw error;
    }
  };

  const startRecording = async (): Promise<void> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    if (!isInitialized) {
      await initialize();
    }
    
    return controllerRef.current.startRecording();
  };

  const stopRecording = async (): Promise<VoiceRecordingResult> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    return controllerRef.current.stopRecording();
  };

  const pauseRecording = async (): Promise<void> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    return controllerRef.current.pauseRecording();
  };

  const resumeRecording = async (): Promise<void> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    return controllerRef.current.resumeRecording();
  };

  const cancelRecording = async (): Promise<void> => {
    if (!controllerRef.current) {
      return;
    }
    
    return controllerRef.current.cancelRecording();
  };

  const transcribeAudio = async (
    audioUri: string, 
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    return controllerRef.current.transcribeAudio(audioUri, options);
  };

  const recordAndTranscribe = async (
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    return controllerRef.current.recordAndTranscribe(options);
  };

  const startVoiceInput = async (): Promise<void> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    if (!isInitialized) {
      await initialize();
    }
    
    return controllerRef.current.startVoiceInput();
  };

  const completeVoiceInput = async (
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> => {
    if (!controllerRef.current) {
      throw new Error('Voice input not initialized');
    }
    
    return controllerRef.current.completeVoiceInput(options);
  };

  const clearError = (): void => {
    if (controllerRef.current) {
      // Clear error from state
      setState(prev => ({ ...prev, error: undefined }));
    }
  };

const cleanup = async (): Promise<void> => {
  if (hasCleanedUp.current) return;
  hasCleanedUp.current = true;
  if (controllerRef.current) {
    await controllerRef.current.cleanup();
    controllerRef.current = null;
  }
  setIsInitialized(false);
  setIsAvailable(false);
};

  return {
    // State
    state,
    isAvailable,
    
    // Actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    transcribeAudio,
    recordAndTranscribe,
    
    // Convenience methods
    startVoiceInput,
    completeVoiceInput,
    
    // Utils
    clearError,
    initialize,
    cleanup,
  };
}

// Convenience hook for simple voice-to-text use cases
export function useVoiceToText(
  onTranscription: (text: string) => void,
  config?: UseVoiceInputConfig
) {
  const voiceInput = useVoiceInput(config, {
    onTranscriptionComplete: (result) => {
      onTranscription(result.text);
    },
  });

  const startAndWaitForTranscription = async (options?: TranscriptionOptions): Promise<string> => {
    await voiceInput.startVoiceInput();
    // User needs to manually stop recording
    // This is typically bound to a button press/release
    return '';
  };

  const completeTranscription = async (options?: TranscriptionOptions): Promise<string> => {
    const result = await voiceInput.completeVoiceInput(options);
    return result.text;
  };

  return {
    ...voiceInput,
    startAndWaitForTranscription,
    completeTranscription,
  };
}
