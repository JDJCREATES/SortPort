import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withSequence
} from 'react-native-reanimated';
import { getCurrentTheme } from '../../utils/theme';

interface ChatInputActionsProps {
  canSubmit: boolean;
  onSubmit: () => void;
  isVoiceActive: boolean;
  disabled?: boolean;
  size?: number;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function ChatInputActions({
  canSubmit,
  onSubmit,
  isVoiceActive,
  disabled = false,
  size = 24
}: ChatInputActionsProps) {
  const theme = getCurrentTheme();
  const scale = useSharedValue(1);

  const styles = React.useMemo(() => createStyles(theme, size), [theme, size]);

  const handleSubmit = () => {
    if (!canSubmit || disabled || isVoiceActive) return;
    
    scale.value = withSequence(
      withSpring(0.9, { damping: 15, stiffness: 300 }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
    
    onSubmit();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getButtonColor = () => {
    if (disabled || isVoiceActive || !canSubmit) {
      return theme.colors.textSecondary;
    }
    return theme.colors.primary;
  };

  const getBackgroundColor = () => {
    if (disabled || isVoiceActive || !canSubmit) {
      return `${theme.colors.textSecondary}10`;
    }
    return theme.colors.primary;
  };

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.submitButton,
        { backgroundColor: getBackgroundColor() },
        animatedStyle
      ]}
      onPress={handleSubmit}
      disabled={disabled || isVoiceActive || !canSubmit}
      activeOpacity={0.8}
    >
      <Ionicons
        name="send"
        size={size - 4}
        color={canSubmit && !disabled && !isVoiceActive ? '#FFFFFF' : getButtonColor()}
      />
    </AnimatedTouchableOpacity>
  );
}

const createStyles = (theme: ReturnType<typeof getCurrentTheme>, size: number) =>
  StyleSheet.create({
    submitButton: {
      width: size + 12,
      height: size + 12,
      borderRadius: (size + 12) / 2,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
  });
