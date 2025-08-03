import React from 'react';
import { TouchableOpacity, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withSequence,
  AnimatedStyleProp
} from 'react-native-reanimated';
import { getCurrentTheme } from '../../utils/theme';

interface ChatToggleButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  animatedStyle?: AnimatedStyleProp<ViewStyle>;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function ChatToggleButton({
  isExpanded,
  onToggle,
  disabled = false,
  animatedStyle
}: ChatToggleButtonProps) {
  const theme = getCurrentTheme();
  const pressScale = useSharedValue(1);

  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const handlePress = () => {
    if (disabled) return;
    
    pressScale.value = withSequence(
      withSpring(0.95, { damping: 15, stiffness: 300 }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
    
    onToggle();
  };

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <AnimatedTouchableOpacity
      style={[styles.container, pressAnimatedStyle]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <View style={styles.leftContent}>
          <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.primary}15` }]}>
            <Ionicons 
              name="chatbubble" 
              size={20} 
              color={theme.colors.primary} 
            />
          </View>
          <Text style={styles.label}>
            {isExpanded ? 'Tap to minimize chat' : 'Ask me anything...'}
          </Text>
        </View>
        
        <Animated.View style={[styles.chevronContainer, animatedStyle]}>
          <Ionicons 
            name="chevron-up" 
            size={18} 
            color={theme.colors.textSecondary} 
          />
        </Animated.View>
      </View>
      
      {/* Optional visual indicator for drag handle */}
      <View style={styles.dragHandle} />
    </AnimatedTouchableOpacity>
  );
}

const createStyles = (theme: ReturnType<typeof getCurrentTheme>) =>
  StyleSheet.create({
    container: {
      width: '100%',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    leftContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    label: {
      fontSize: 16,
      color: theme.colors.text,
      fontWeight: '500',
      flex: 1,
    },
    chevronContainer: {
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dragHandle: {
      width: 40,
      height: 4,
      backgroundColor: theme.colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 8,
    },
  });
