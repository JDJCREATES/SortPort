import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  View, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Platform, 
  Alert, 
  Dimensions, 
  Keyboard,
  LayoutChangeEvent
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  interpolate,
  runOnJS,
  useAnimatedGestureHandler,
  withTiming,
  withSequence,
  Easing
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentTheme } from '../utils/theme';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import { VoiceError, VoiceErrorCode } from '../utils/voice/types/VoiceTypes';

const { height: screenHeight } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 50;
const MAX_INPUT_HEIGHT = 120; // Maximum height for text input
const MIN_INPUT_HEIGHT = 44; // Minimum height for text input
const INPUT_PADDING = 16;
const BUTTON_SIZE = 44;

export function GlobalChatOverlay() {
  const theme = getCurrentTheme();
  const insets = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const textInputRef = useRef<TextInput>(null);
  
  // Animation values
  const heightAnimation = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const buttonRotation = useSharedValue(0);
  const glowAnimation = useSharedValue(0);
  const pulseAnimation = useSharedValue(1);

  // Start subtle pulse animation for AI icon when idle
  useEffect(() => {
    if (!isExpanded) {
      pulseAnimation.value = withSequence(
        withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) })
      );
      
      // Repeat the pulse
      const interval = setInterval(() => {
        if (!isExpanded) {
          pulseAnimation.value = withSequence(
            withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) })
          );
        }
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [isExpanded, pulseAnimation]);
  
  // Calculate dynamic heights
  const expandedHeight = useMemo(() => {
    const baseHeight = 100; // Header + padding
    const contentHeight = Math.max(inputHeight, MIN_INPUT_HEIGHT);
    return Math.min(baseHeight + contentHeight, screenHeight * 0.4);
  }, [inputHeight]);

  // Voice error handler
  function handleVoiceError(error: VoiceError) {
    console.error('Voice error:', error);
    buttonRotation.value = withTiming(0, { duration: 200 });
    
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
  
  // Voice setup with optimized callbacks
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  
  const voice = useVoiceInput({
    autoInitialize: true, // Ensure auto initialization
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
    onTranscriptionStart: useCallback(() => {
      console.log('🎯 Transcription started');
    }, []),
    onTranscriptionComplete: useCallback((result: any) => {
      console.log('🎯 Transcription complete:', result);
      if (result?.text) {
        setMessage(result.text);
        // Animate button transition
        buttonRotation.value = withTiming(0, { duration: 200 });
      }
    }, [buttonRotation]),
    onError: handleVoiceError,
    onRecordingStart: useCallback(() => {
      console.log('🎤 Recording started callback');
      buttonRotation.value = withTiming(180, { duration: 200 });
    }, [buttonRotation]),
    onRecordingStop: useCallback(() => {
      console.log('🛑 Recording stopped callback');
      if (!message.trim()) {
        buttonRotation.value = withTiming(0, { duration: 200 });
      }
    }, [buttonRotation, message])
  });

  // Initialize voice input when component mounts
  useEffect(() => {
    if (voice.initialize) {
      voice.initialize().catch((error) => {
        console.error('❌ Failed to initialize voice input:', error);
      });
    }
    
    return () => {
      if (voice.cleanup) {
        voice.cleanup().catch((error) => {
          console.error('❌ Failed to cleanup voice input:', error);
        });
      }
    };
  }, []);

  // Determine if we should show send button (when there's text or transcription is complete)
  const shouldShowSend = useMemo(() => {
    return message.trim().length > 0 && !voice.state.isTranscribing;
  }, [message, voice.state.isTranscribing]);

  const handleToggle = useCallback(() => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    
    heightAnimation.value = withSpring(newState ? 1 : 0, {
      damping: 18,
      stiffness: 200,
    });

    // Animate glow effect
    glowAnimation.value = withTiming(newState ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });

    if (newState) {
      // Focus input when expanding
      setTimeout(() => textInputRef.current?.focus(), 100);
    } else {
      // Dismiss keyboard when collapsing
      Keyboard.dismiss();
    }
  }, [isExpanded, heightAnimation, glowAnimation]);

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) return;
    
    // Add haptic feedback
    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    
    console.log('🚀 Processing chat message:', message.trim());
    
    Alert.alert(
      'Processing Request',
      'Your sorting request has been received. Processing pipeline will be implemented shortly.',
      [{ text: 'OK' }]
    );
    
    setMessage('');
    setInputHeight(MIN_INPUT_HEIGHT);
    
    // Auto-collapse after sending
    setTimeout(() => {
      setIsExpanded(false);
      heightAnimation.value = withSpring(0);
    }, 500);
  }, [message, heightAnimation, buttonScale]);

  const handleVoicePress = useCallback(async () => {
    // Animate button press
    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );

    if (!voice.state.isRecording) {
      Keyboard.dismiss();
    }
    
    if (voice.state.isRecording) {
      try {
        const result = await voice.completeVoiceInput();
        console.log('🎯 Voice input completed:', result);
      } catch (error) {
        console.error('❌ Error completing voice input:', error);
      }
    } else {
      try {
        setMessage('');
        await voice.startVoiceInput();
      } catch (error) {
        console.error('❌ Error starting voice input:', error);
      }
    }
  }, [voice, buttonScale]);

  // Handle text input content size change for dynamic height
  const handleContentSizeChange = useCallback((event: any) => {
    const { height } = event.nativeEvent.contentSize;
    const newHeight = Math.min(Math.max(height, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
    setInputHeight(newHeight);
  }, []);

  // Handle text change with optimized re-renders
  const handleTextChange = useCallback((text: string) => {
    setMessage(text);
  }, []);

  const styles = React.useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      heightAnimation.value,
      [0, 1],
      [COLLAPSED_HEIGHT, expandedHeight]
    );
    
    return {
      height,
    };
  });

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: buttonScale.value },
        { rotate: `${buttonRotation.value}deg` }
      ],
    };
  });

  const aiIconAnimatedStyle = useAnimatedStyle(() => {
    const scale = isExpanded ? 1 : pulseAnimation.value;
    const opacity = interpolate(glowAnimation.value, [0, 1], [0.8, 1]);
    
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const aiGlowAnimatedStyle = useAnimatedStyle(() => {
    const glowOpacity = interpolate(glowAnimation.value, [0, 1], [0, 0.15]);
    const glowScale = interpolate(glowAnimation.value, [0, 1], [0.8, 1.2]);
    
    return {
      transform: [{ scale: glowScale }],
      opacity: glowOpacity,
    };
  });

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Collapsed: AI icon button */}
      {!isExpanded && (
        <TouchableOpacity style={styles.toggleBar} onPress={handleToggle}>
          <View style={styles.aiIconWrapper}>
            {/* Glow effect background */}
            <Animated.View style={[styles.aiGlowBackground, aiGlowAnimatedStyle]} />
            <Animated.View style={[styles.aiIconContainer, aiIconAnimatedStyle]}>
              <Ionicons 
                name="sparkles" 
                size={24} 
                color={theme.colors.primary} 
              />
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      {/* Expanded: Full chat area */}
      {isExpanded && (
        <View style={styles.expandedContainer}>
          {/* Header with AI icon */}
          <TouchableOpacity style={styles.headerBar} onPress={handleToggle}>
            <View style={styles.aiIconWrapper}>
              {/* Glow effect background */}
              <Animated.View style={[styles.aiGlowBackground, aiGlowAnimatedStyle]} />
              <Animated.View style={[styles.aiIconContainer, aiIconAnimatedStyle]}>
                <Ionicons 
                  name="sparkles" 
                  size={24} 
                  color={theme.colors.primary} 
                />
              </Animated.View>
            </View>
          </TouchableOpacity>

          {/* Chat input area */}
          <View style={styles.chatArea}>
            {/* Main input row */}
            <View style={styles.inputRow}>
              <TextInput
                ref={textInputRef}
                style={[styles.textInput, { height: Math.max(inputHeight, MIN_INPUT_HEIGHT) }]}
                value={message}
                onChangeText={handleTextChange}
                onContentSizeChange={handleContentSizeChange}
                placeholder="Ask me to organize your photos..."
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                textAlignVertical="top"
                maxLength={500}
                returnKeyType="default"
                blurOnSubmit={false}
              />
              
              {/* Dynamic Action Button */}
              <Animated.View style={[
                styles.actionButton, 
                buttonAnimatedStyle,
                {
                  backgroundColor: shouldShowSend 
                    ? theme.colors.primary 
                    : voice.state.isRecording 
                      ? theme.colors.error 
                      : `${theme.colors.primary}20` // Semi-transparent for mic
                }
              ]}>
                <TouchableOpacity
                  style={styles.actionButtonInner}
                  onPress={shouldShowSend ? handleSubmit : handleVoicePress}
                  disabled={voice.state.isTranscribing}
                >
                  <Ionicons
                    name={
                      voice.state.isTranscribing 
                        ? "ellipsis-horizontal" 
                        : shouldShowSend 
                          ? "send" 
                          : voice.state.isRecording 
                            ? "stop-circle" 
                            : "mic"
                    }
                    size={20}
                    color={
                      shouldShowSend
                        ? theme.colors.background  // White/light color for send button
                        : voice.state.isRecording
                          ? theme.colors.background  // White for stop button on red background
                          : theme.colors.primary  // Primary color for mic icon
                    }
                  />
                </TouchableOpacity>
              </Animated.View>
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
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
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
    aiIconContainer: {
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
      }),
    },
    aiIconWrapper: {
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },
    aiGlowBackground: {
      position: 'absolute',
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: theme.colors.primary,
    },
    expandedContainer: {
      flex: 1,
      flexDirection: 'column',
    },
    headerBar: {
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: `${theme.colors.border}30`,
    },
    chatArea: {
      flex: 1,
      padding: INPUT_PADDING,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 12,
    },
    textInput: {
      flex: 1,
      backgroundColor: 'transparent',
      fontSize: 16,
      color: theme.colors.text,
      textAlignVertical: 'top',
      paddingHorizontal: INPUT_PADDING,
      paddingVertical: 12,
      borderRadius: 0, // Remove border radius for seamless look
      borderWidth: 0, // Remove border completely
      maxHeight: MAX_INPUT_HEIGHT,
      minHeight: MIN_INPUT_HEIGHT,
    },
    actionButton: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: BUTTON_SIZE / 2,
      // backgroundColor removed - now set dynamically in component
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    actionButtonInner: {
      width: '100%',
      height: '100%',
      borderRadius: BUTTON_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Legacy styles for compatibility
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
