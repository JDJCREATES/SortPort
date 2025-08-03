import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform, Alert, Dimensions, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  interpolate
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentTheme } from '../utils/theme';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import { VoiceError, VoiceErrorCode } from '../utils/voice/types/VoiceTypes';
import { router } from 'expo-router';

const { height: screenHeight } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 50;
const EXPANDED_HEIGHT = screenHeight * 0.25; // 25% of screen height

export function GlobalChatOverlay() {
  const theme = getCurrentTheme();
  const insets = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const textInputRef = useRef<TextInput>(null);
  
  // Animation
  const heightAnimation = useSharedValue(0);
  
  // Voice setup
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const voice = useVoiceInput({
    audio: {
      maxDuration: 60,
      sampleRate: 44100,
      channels: 1,
      bitRate: 128000,
      recorderInstance: audioRecorder,
    },
    transcription: {
      primaryProvider: 'openai',
      retryAttempts: 3,
    }
  }, {
    onTranscriptionStart: () => {
      console.log('🎯 Transcription started');
    },
    onTranscriptionComplete: (result: any) => {
      console.log('🎯 Transcription complete:', result);
      if (result && result.text) {
        console.log('📝 Setting message to:', result.text);
        setMessage(prev => {
          console.log('📝 Previous message:', prev);
          console.log('📝 New message:', result.text);
          return result.text;
        });
        
        // Also try setting directly on TextInput as fallback
        setTimeout(() => {
          if (textInputRef.current) {
            console.log('📝 Setting TextInput value directly as fallback');
            textInputRef.current.setNativeProps({ text: result.text });
          }
        }, 100);
      } else {
        console.warn('⚠️ No text in transcription result:', result);
      }
    },
    onError: handleVoiceError,
    onRecordingStart: () => {
      console.log('🎤 Recording started callback');
    },
    onRecordingStop: () => {
      console.log('🛑 Recording stopped callback');
    }
  });

  function handleVoiceError(error: VoiceError) {
    console.error('Voice error:', error);
    
    switch (error.code) {
      case VoiceErrorCode.PERMISSION_DENIED:
        Alert.alert('Permission Required', 'Please grant microphone permission to use voice input.');
        break;
      case VoiceErrorCode.TRANSCRIPTION_FAILED:
        Alert.alert('Transcription Error', 'Failed to transcribe audio. Please try again.');
        break;
      default:
        Alert.alert('Voice Error', error.message || 'An error occurred with voice input.');
    }
  }

  const handleToggle = useCallback(() => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    
    heightAnimation.value = withSpring(newState ? 1 : 0, {
      damping: 20,
      stiffness: 300,
    });
  }, [isExpanded, heightAnimation]);

  const handleSubmit = useCallback(async () => {
    if (message.trim()) {
      console.log('🚀 Processing chat message:', message.trim());
      
      // TODO: Add prompt validation and server processing here
      // For now, just show a message that processing will be added
      Alert.alert(
        'Processing Request',
        'Your sorting request has been received. Processing pipeline will be implemented shortly.',
        [{ text: 'OK' }]
      );
      
      setMessage('');
      setIsExpanded(false);
      heightAnimation.value = withSpring(0);
    }
  }, [message, heightAnimation]);

  const handleVoicePress = useCallback(async () => {
    // Dismiss keyboard when starting voice recording
    if (!voice.state.isRecording) {
      Keyboard.dismiss();
      console.log('⌨️ Keyboard dismissed for voice recording');
    }
    
    if (voice.state.isRecording) {
      console.log('🛑 Stopping voice recording and transcribing...');
      try {
        setMessage('Transcribing audio...');
        const result = await voice.completeVoiceInput();
        console.log('🎯 Voice input completed:', result);
      } catch (error) {
        console.error('❌ Error completing voice input:', error);
        setMessage(''); // Clear transcribing message on error
      }
    } else {
      console.log('🎤 Starting voice recording...');
      try {
        setMessage(''); // Clear any existing text
        await voice.startVoiceInput();
      } catch (error) {
        console.error('❌ Error starting voice input:', error);
      }
    }
  }, [voice]);

  const styles = React.useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      heightAnimation.value,
      [0, 1],
      [COLLAPSED_HEIGHT, EXPANDED_HEIGHT]
    );
    
    return {
      height,
    };
  });

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Collapsed: Just arrow button */}
      {!isExpanded && (
        <TouchableOpacity style={styles.toggleBar} onPress={handleToggle}>
          <Ionicons 
            name="chevron-up" 
            size={24} 
            color={theme.colors.textSecondary} 
          />
        </TouchableOpacity>
      )}

      {/* Expanded: Full chat area */}
      {isExpanded && (
        <View style={styles.expandedContainer}>
          {/* Header with down arrow */}
          <TouchableOpacity style={styles.headerBar} onPress={handleToggle}>
            <Ionicons 
              name="chevron-down" 
              size={24} 
              color={theme.colors.textSecondary} 
            />
          </TouchableOpacity>

          {/* Chat input area */}
          <View style={styles.chatArea}>
            <TextInput
              ref={textInputRef}
              style={styles.textInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Ask me to organize your photos..."
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              autoFocus
            />
            
            {/* Submit button with voice icon */}
            <View style={styles.submitRow}>
              <TouchableOpacity 
                style={[
                  styles.submitButton, 
                  { opacity: message.trim() ? 1 : 0.5 }
                ]}
                onPress={handleSubmit}
                disabled={!message.trim()}
              >
                <View style={styles.submitContent}>
                  <Ionicons name="send" size={18} color="white" />
                  <TouchableOpacity 
                    style={styles.voiceButton}
                    onPress={handleVoicePress}
                  >
                    <Ionicons
                      name={voice.state.isRecording ? "stop" : "mic"}
                      size={16}
                      color={voice.state.isRecording ? theme.colors.error : theme.colors.primary}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const createStyles = (theme: ReturnType<typeof getCurrentTheme>, bottomInset: number) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 60 + (Platform.OS === 'android' ? Math.max(bottomInset, 8) : bottomInset), // Above tab bar
      left: 0,
      right: 0,
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.text,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 10,
    },
    toggleBar: {
      height: COLLAPSED_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    expandedContainer: {
      height: EXPANDED_HEIGHT,
      flexDirection: 'column',
    },
    headerBar: {
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: `${theme.colors.border}50`,
    },
    chatArea: {
      flex: 1,
      padding: 16,
      justifyContent: 'space-between',
    },
    textInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.text,
      textAlignVertical: 'top',
      marginBottom: 12,
    },
    submitRow: {
      width: '100%',
    },
    submitButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    voiceButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${theme.colors.background}50`,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
