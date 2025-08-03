import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { getCurrentTheme } from '../../utils/theme';

interface VoiceInputButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function VoiceInputButton({
  isRecording,
  isTranscribing,
  onPress,
  disabled = false,
  size = 24
}: VoiceInputButtonProps) {
  const theme = getCurrentTheme();
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  const styles = React.useMemo(() => createStyles(theme, size), [theme, size]);

  // Handle press animation
  const handlePress = () => {
    if (disabled) return;
    
    scale.value = withSequence(
      withSpring(0.9, { damping: 15, stiffness: 300 }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
    
    onPress();
  };

  // Pulse animation for recording state
  React.useEffect(() => {
    if (isRecording) {
      pulseScale.value = withSequence(
        withTiming(1.2, { duration: 600 }),
        withTiming(1, { duration: 600 })
      );
      
      // Continue pulsing while recording
      const interval = setInterval(() => {
        if (isRecording) {
          pulseScale.value = withSequence(
            withTiming(1.2, { duration: 600 }),
            withTiming(1, { duration: 600 })
          );
        }
      }, 1200);
      
      return () => clearInterval(interval);
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
    }
  }, [isRecording, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { scale: pulseScale.value }
    ],
  }));

  const getIconName = () => {
    if (isTranscribing) return 'sync';
    if (isRecording) return 'stop';
    return 'mic';
  };

  const getButtonColor = () => {
    if (disabled) return theme.colors.textSecondary;
    if (isRecording) return theme.colors.error;
    if (isTranscribing) return theme.colors.warning;
    return theme.colors.primary;
  };

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.button,
        { backgroundColor: `${getButtonColor()}15` },
        animatedStyle
      ]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons
        name={getIconName()}
        size={size}
        color={getButtonColor()}
      />
    </AnimatedTouchableOpacity>
  );
}

const createStyles = (theme: ReturnType<typeof getCurrentTheme>, size: number) =>
  StyleSheet.create({
    button: {
      width: size + 16,
      height: size + 16,
      borderRadius: (size + 16) / 2,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
  });
