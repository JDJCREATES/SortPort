import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Alert, Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useApp } from '../contexts/AppContext';
import { CREDIT_COSTS } from '../utils/creditPurchaseManager';
import { getCurrentTheme } from '../utils/theme';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { VoiceError, VoiceErrorCode } from '../utils/voice/types/VoiceTypes';

/**
 * This is the main chatbar for the AI Sorting feature. This is the main entry point for the user to sort their images through natural language.
 */

interface PictureHackBarProps {
  onSubmit: (prompt: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function PictureHackBar({ 
  onSubmit, 
  placeholder = "What would you like to sort?",
  disabled = false 
}: PictureHackBarProps) {
  const { userFlags, deductCredits } = useApp();
  const [prompt, setPrompt] = useState('');
  const theme = getCurrentTheme();
  
  // Move useAudioRecorder here (React hook at component level)
  // Using RecordingPresets for proper configuration
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  
  // Initialize voice input with OpenAI transcription
  const voice = useVoiceInput({
    audio: {
      maxDuration: 60,
      sampleRate: 44100,
      channels: 1,
      bitRate: 128000,
      recorderInstance: audioRecorder, // Pass the recorder instance
    },
    transcription: {
      primaryProvider: 'openai',
      retryAttempts: 3,
    }
  }, {
    onTranscriptionComplete: (result) => {
      setPrompt(result.text);
    },
    onError: (error) => {
      handleVoiceError(error);
    }
  });

  const handleVoiceError = (error: VoiceError) => {
    console.error('Voice error:', error);
    
    switch (error.code) {
      case VoiceErrorCode.PERMISSION_DENIED:
        Alert.alert('Permission Required', 'Please grant microphone permission to use voice input.');
        break;
      case VoiceErrorCode.UNSUPPORTED_PLATFORM:
        Alert.alert('Voice Input Not Available', 'Voice recording is not available on this platform. Please type your request instead.');
        break;
      case VoiceErrorCode.TRANSCRIPTION_FAILED:
        Alert.alert('Transcription Error', 'Failed to transcribe audio. Please try again or check your internet connection.');
        break;
      case VoiceErrorCode.API_QUOTA_EXCEEDED:
        Alert.alert('Service Limit', 'Voice transcription service limit reached. Please try again later.');
        break;
      default:
        // Handle audio recorder released errors specifically
        if (error.message.includes('released') || error.message.includes('Audio recorder')) {
          Alert.alert('Voice Recording Error', 'The voice recorder needs to be restarted. Please try recording again.');
          // Force re-render to get a fresh recorder instance
          setPrompt('');
        } else {
          Alert.alert('Voice Error', error.message || 'An error occurred with voice input. Please try again.');
        }
    }
  };
  
  const sendScale = useSharedValue(1);
  const micScale = useSharedValue(1);
  const containerScale = useSharedValue(1);
  const micPulse = useSharedValue(1);

  const handleSubmit = () => {
    if (prompt.trim() && !disabled && !voice.state.isRecording && !voice.state.isTranscribing) {
      // Check if user has sufficient credits for the query
      if (userFlags.creditBalance < CREDIT_COSTS.NATURAL_LANGUAGE_QUERY) {
        Alert.alert(
          'Insufficient Credits',
          `You need ${CREDIT_COSTS.NATURAL_LANGUAGE_QUERY} credits to submit this query. Please purchase more credits.`,
          [{ text: 'OK' }]
        );
        return;
      }

      sendScale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
        sendScale.value = withSpring(1);
      });
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const startRecording = async () => {
    try {

      console.log('🎬 Starting recording...');


      setPrompt(''); // Clear any existing text
      
      // Start recording
      await voice.startVoiceInput();
      
      // Start pulsing animation
      const pulse = () => {
        micPulse.value = withTiming(1.2, { duration: 500 }, () => {
          micPulse.value = withTiming(1, { duration: 500 }, () => {
            if (voice.state.isRecording) pulse(); // Continue pulsing while recording
          });
        });
      };
      pulse();

     
    } catch (err) {
      console.error('Failed to start recording', err);
      // Error handling is done in the voice error callback
    }
  };

  const stopRecording = async () => {
    try {
      console.log('Stopping recording and transcribing...');
      setPrompt('Transcribing audio...');
      
      const result = await voice.completeVoiceInput();
      // The transcription result will be set via the onTranscriptionComplete callback
      console.log('Transcription completed:', result.text);
    } catch (error) {
      console.error('Error in voice input:', error);
      // Error handling is done in the voice error callback
    }
  };

  const handleVoiceInput = () => {
    if (disabled || voice.state.isTranscribing) return;
    
    micScale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
      micScale.value = withSpring(1);
    });

    if (voice.state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleFocus = () => {
    containerScale.value = withSpring(1.02, { damping: 15, stiffness: 200 });
  };

  const handleBlur = () => {
    containerScale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const sendAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const micAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value * micPulse.value }],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
  }));

  const isVoiceDisabled = !voice.isAvailable || disabled || voice.state.isTranscribing;
  const isSubmitDisabled = !prompt.trim() || disabled || voice.state.isRecording || voice.state.isTranscribing || userFlags.creditBalance < CREDIT_COSTS.NATURAL_LANGUAGE_QUERY;

  // Create styles with current theme
  const styles = createStyles(theme);

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={theme.colors.primary} />
        <Text style={styles.headerText}>Picture Hack</Text>
        {voice.state.isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording...</Text>
          </View>
        )}
        {voice.state.isTranscribing && (
          <View style={styles.transcribingIndicator}>
            <Text style={styles.transcribingText}>Transcribing...</Text>
          </View>
        )}
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.textInput,
            voice.state.isTranscribing && styles.textInputDisabled,
            userFlags.creditBalance < CREDIT_COSTS.NATURAL_LANGUAGE_QUERY && styles.textInputLowCredits
          ]}
          value={prompt}
          onChangeText={setPrompt}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          multiline
          maxLength={200}
          editable={!disabled && !voice.state.isTranscribing}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <View style={styles.buttonContainer}>
          <AnimatedTouchableOpacity
            style={[
              styles.iconButton, 
              voice.state.isRecording && styles.recordingButton,
              isVoiceDisabled && styles.disabledButton,
              micAnimatedStyle
            ]}
            onPress={handleVoiceInput}
            disabled={isVoiceDisabled}
          >
            {voice.state.isRecording ? (
              <MaterialIcons name="stop" size={20} color="white" />
            ) : (
              <Ionicons 
                name="mic" 
                size={20} 
                color={isVoiceDisabled ? theme.colors.border : theme.colors.textSecondary} 
              />
            )}
          </AnimatedTouchableOpacity>
          <AnimatedTouchableOpacity
            style={[
              styles.sendButton, 
              isSubmitDisabled && styles.sendButtonDisabled,
              sendAnimatedStyle
            ]}
            onPress={handleSubmit}
            disabled={isSubmitDisabled}
          >
            <Ionicons name="send" size={18} color="white" />
          </AnimatedTouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    margin: theme.spacing.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  headerText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.error,
  },
  recordingText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.error,
  },
  transcribingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transcribingText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.text,
    maxHeight: 100,
    marginRight: theme.spacing.sm,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  textInputDisabled: {
    opacity: 0.6,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconButton: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recordingButton: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  disabledButton: {
    opacity: 0.5,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    elevation: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  textInputLowCredits: {
    borderColor: theme.colors.warning,
    backgroundColor: `${theme.colors.warning}10`,
  },
  creditIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-end',
  },
  creditCost: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
});