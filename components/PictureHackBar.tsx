import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Mic, Send, Sparkles } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
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
  
  const sendScale = useSharedValue(1);
  const micScale = useSharedValue(1);
  const containerScale = useSharedValue(1);

  const handleSubmit = () => {
    if (prompt.trim() && !disabled) {
      sendScale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
        sendScale.value = withSpring(1);
      });
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const handleVoiceInput = () => {
    if (!disabled) {
      micScale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
        micScale.value = withSpring(1);
      });
      setIsRecording(!isRecording);
      // TODO: Implement voice recording
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
    transform: [{ scale: micScale.value }],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.header}>
        <Sparkles size={16} color={lightTheme.colors.primary} />
        <Text style={styles.headerText}>Picture Hack</Text>
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={prompt}
          onChangeText={setPrompt}
          placeholder={placeholder}
          placeholderTextColor={lightTheme.colors.textSecondary}
          multiline
          maxLength={200}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <View style={styles.buttonContainer}>
          <AnimatedTouchableOpacity
            style={[
              styles.iconButton, 
              isRecording && styles.recordingButton,
              micAnimatedStyle
            ]}
            onPress={handleVoiceInput}
            disabled={disabled}
          >
            <Mic size={20} color={isRecording ? 'white' : lightTheme.colors.textSecondary} />
          </AnimatedTouchableOpacity>
          <AnimatedTouchableOpacity
            style={[
              styles.sendButton, 
              (!prompt.trim() || disabled) && styles.sendButtonDisabled,
              sendAnimatedStyle
            ]}
            onPress={handleSubmit}
            disabled={!prompt.trim() || disabled}
          >
            <Send size={18} color="white" />
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