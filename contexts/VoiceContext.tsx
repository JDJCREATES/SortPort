import React, { createContext, useContext, useEffect, useState } from 'react';
import { VoiceInputController, VoiceControllerConfig } from '../utils/voice/core/VoiceInputController';
import { 
  VoiceInputState, 
  VoiceInputCallbacks, 
  TranscriptionResult, 
  VoiceRecordingResult,
  VoiceError 
} from '../utils/voice/types/VoiceTypes';
import { TranscriptionOptions } from '../utils/voice/providers/OpenAITranscriptionProvider';

interface VoiceContextValue {
  // State
  state: VoiceInputState;
  isAvailable: boolean;
  isInitialized: boolean;
  
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
  updateCallbacks: (callbacks: Partial<VoiceInputCallbacks>) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

interface VoiceProviderProps {
  children: React.ReactNode;
  config?: VoiceControllerConfig;
  callbacks?: VoiceInputCallbacks;
}

export function VoiceProvider({ children, config = {}, callbacks = {} }: VoiceProviderProps) {
  const [controller, setController] = useState<VoiceInputController | null>(null);
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    isPaused: false,
    recordingDuration: 0,
    audioLevel: 0,
  });
  const [isAvailable, setIsAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize controller
  useEffect(() => {
    const voiceController = new VoiceInputController(config, {
      ...callbacks,
      onStateChange: (newState) => {
        setState(newState);
        callbacks.onStateChange?.(newState);
      },
    });
    
    setController(voiceController);
    setIsAvailable(voiceController.isAvailable());
    
    return () => {
      voiceController.cleanup();
    };
  }, []);

  // Update callbacks when they change
  useEffect(() => {
    if (controller) {
      controller.updateCallbacks({
        ...callbacks,
        onStateChange: (newState) => {
          setState(newState);
          callbacks.onStateChange?.(newState);
        },
      });
    }
  }, [controller, callbacks]);

  const initialize = async (): Promise<void> => {
    if (!controller || isInitialized) return;
    
    try {
      await controller.initialize();
      setIsInitialized(true);
      setIsAvailable(controller.isAvailable());
    } catch (error) {
      console.error('Failed to initialize voice context:', error);
      setIsAvailable(false);
      throw error;
    }
  };

  const startRecording = async (): Promise<void> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    if (!isInitialized) {
      await initialize();
    }
    
    return controller.startRecording();
  };

  const stopRecording = async (): Promise<VoiceRecordingResult> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    return controller.stopRecording();
  };

  const pauseRecording = async (): Promise<void> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    return controller.pauseRecording();
  };

  const resumeRecording = async (): Promise<void> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    return controller.resumeRecording();
  };

  const cancelRecording = async (): Promise<void> => {
    if (!controller) {
      return;
    }
    
    return controller.cancelRecording();
  };

  const transcribeAudio = async (
    audioUri: string, 
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    return controller.transcribeAudio(audioUri, options);
  };

  const recordAndTranscribe = async (
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    return controller.recordAndTranscribe(options);
  };

  const startVoiceInput = async (): Promise<void> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    if (!isInitialized) {
      await initialize();
    }
    
    return controller.startVoiceInput();
  };

  const completeVoiceInput = async (
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> => {
    if (!controller) {
      throw new Error('Voice controller not initialized');
    }
    
    return controller.completeVoiceInput(options);
  };

  const clearError = (): void => {
    setState(prev => ({ ...prev, error: undefined }));
  };

  const updateCallbacks = (newCallbacks: Partial<VoiceInputCallbacks>): void => {
    if (controller) {
      controller.updateCallbacks({
        ...callbacks,
        ...newCallbacks,
        onStateChange: (newState) => {
          setState(newState);
          newCallbacks.onStateChange?.(newState);
        },
      });
    }
  };

  const contextValue: VoiceContextValue = {
    // State
    state,
    isAvailable,
    isInitialized,
    
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
    updateCallbacks,
  };

  return (
    <VoiceContext.Provider value={contextValue}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const context = useContext(VoiceContext);
  
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  
  return context;
}

export { VoiceContext };
