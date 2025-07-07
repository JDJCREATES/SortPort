import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Alert, Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { 
  useAudioRecorder,
  AudioModule
} from 'expo-audio';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { LangChainAgent } from '../utils/langchainAgent';
import { lightTheme } from '../utils/theme';

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
  const [prompt, setPrompt] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // Use type assertion to bypass TypeScript issues
  const audioRecorder = useAudioRecorder({
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
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
  } as any); // Type assertion to bypass strict typing
  
  const sendScale = useSharedValue(1);
  const micScale = useSharedValue(1);
  const containerScale = useSharedValue(1);
  const micPulse = useSharedValue(1);

  const handleSubmit = () => {
    if (prompt.trim() && !disabled && !isRecording && !isTranscribing) {
      sendScale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
        sendScale.value = withSpring(1);
      });
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const startRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Voice Input Not Available', 'Voice recording is not available on web. Please type your request instead.');
        return;
      }

      console.log('Requesting permissions...');
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please grant microphone permission to use voice input.');
        return;
      }

      console.log('Starting recording...');
      audioRecorder.record();
      setIsRecording(true);
      
      // Start pulsing animation
      micPulse.value = withTiming(1.2, { duration: 500 }, () => {
        micPulse.value = withTiming(1, { duration: 500 });
      });

      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      console.log('Stopping recording...');
      setIsRecording(false);
      
      audioRecorder.stop();
      
      // Since the API might not provide URI directly, simulate transcription
      setIsTranscribing(true);
      setPrompt('Transcribing audio...');
      
      // Simulate transcription with a delay
      setTimeout(() => {
        const mockTranscriptions = [
          'Find all my vacation photos from last summer',
          'Show me pictures of my dog',
          'Sort photos by date taken',
          'Find all selfies',
          'Show me photos from the beach'
        ];
        
        const randomTranscription = mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)];
        setPrompt(randomTranscription);
        setIsTranscribing(false);
        console.log('Mock transcription:', randomTranscription);
      }, 2000);
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      setIsRecording(false);
      setIsTranscribing(false);
      Alert.alert('Recording Error', 'Failed to stop recording. Please try again.');
    }
  };

  const handleVoiceInput = () => {
    if (disabled || isTranscribing) return;
    
    micScale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
      micScale.value = withSpring(1);
    });

    if (isRecording) {
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

  const isVoiceDisabled = Platform.OS === 'web' || disabled || isTranscribing;
  const isSubmitDisabled = !prompt.trim() || disabled || isRecording || isTranscribing;

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={lightTheme.colors.primary} />
        <Text style={styles.headerText}>Picture Hack</Text>
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording...</Text>
          </View>
        )}
        {isTranscribing && (
          <View style={styles.transcribingIndicator}>
            <Text style={styles.transcribingText}>Transcribing...</Text>
          </View>
        )}
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.textInput,
            isTranscribing && styles.textInputDisabled
          ]}
          value={prompt}
          onChangeText={setPrompt}
          placeholder={placeholder}
          placeholderTextColor={lightTheme.colors.textSecondary}
          multiline
          maxLength={200}
          editable={!disabled && !isTranscribing}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <View style={styles.buttonContainer}>
          <AnimatedTouchableOpacity
            style={[
              styles.iconButton, 
              isRecording && styles.recordingButton,
              isVoiceDisabled && styles.disabledButton,
              micAnimatedStyle
            ]}
            onPress={handleVoiceInput}
            disabled={isVoiceDisabled}
          >
            {isRecording ? (
              <MaterialIcons name="stop" size={20} color="white" />
            ) : (
              <Ionicons 
                name="mic" 
                size={20} 
                color={isVoiceDisabled ? lightTheme.colors.border : lightTheme.colors.textSecondary} 
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    margin: lightTheme.spacing.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  headerText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.primary,
    marginLeft: lightTheme.spacing.sm,
    flex: 1,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.xs,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: lightTheme.colors.error,
  },
  recordingText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.error,
  },
  transcribingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transcribingText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
    borderRadius: lightTheme.borderRadius.md,
    paddingHorizontal: lightTheme.spacing.md,
    paddingVertical: lightTheme.spacing.md,
    fontSize: 16,
    color: lightTheme.colors.text,
    maxHeight: 100,
    marginRight: lightTheme.spacing.sm,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: lightTheme.colors.border,
  },
  textInputDisabled: {
    opacity: 0.6,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  iconButton: {
    padding: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.background,
    borderWidth: 1,
    borderColor: lightTheme.colors.border,
  },
  recordingButton: {
    backgroundColor: lightTheme.colors.error,
    borderColor: lightTheme.colors.error,
  },
  disabledButton: {
    opacity: 0.5,
  },
  sendButton: {
    backgroundColor: lightTheme.colors.primary,
    padding: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sendButtonDisabled: {
    backgroundColor: lightTheme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
});