import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Mic, Send, Sparkles } from 'lucide-react-native';
import { lightTheme } from '../utils/theme';

interface PictureHackBarProps {
  onSubmit: (prompt: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PictureHackBar({ 
  onSubmit, 
  placeholder = "What would you like to sort?",
  disabled = false 
}: PictureHackBarProps) {
  const [prompt, setPrompt] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const handleSubmit = () => {
    if (prompt.trim() && !disabled) {
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const handleVoiceInput = () => {
    if (!disabled) {
      setIsRecording(!isRecording);
      // TODO: Implement voice recording
    }
  };

  return (
    <View style={styles.container}>
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
        />
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.iconButton, isRecording && styles.recordingButton]}
            onPress={handleVoiceInput}
            disabled={disabled}
          >
            <Mic size={20} color={isRecording ? 'white' : lightTheme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, (!prompt.trim() || disabled) && styles.sendButtonDisabled]}
            onPress={handleSubmit}
            disabled={!prompt.trim() || disabled}
          >
            <Send size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.md,
    margin: lightTheme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightTheme.colors.primary,
    marginLeft: lightTheme.spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
    borderRadius: lightTheme.borderRadius.md,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.sm,
    fontSize: 16,
    color: lightTheme.colors.text,
    maxHeight: 80,
    marginRight: lightTheme.spacing.sm,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.xs,
  },
  iconButton: {
    padding: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.background,
  },
  recordingButton: {
    backgroundColor: lightTheme.colors.error,
  },
  sendButton: {
    backgroundColor: lightTheme.colors.primary,
    padding: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
  },
  sendButtonDisabled: {
    backgroundColor: lightTheme.colors.border,
  },
});