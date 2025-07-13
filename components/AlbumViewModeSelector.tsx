import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Alert } from 'react-native';
import { Pressable } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import { AlbumViewMode } from '../types/display';
import { getCurrentTheme } from '../utils/theme';

interface AlbumViewModeSelectorProps {
  currentMode: AlbumViewMode;
  onModeChange: (mode: AlbumViewMode) => void;
  disabled?: boolean;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const VIEW_MODE_OPTIONS: Array<{
  mode: AlbumViewMode;
  icon: React.ReactNode;
  label: string;
  description: string;
}> = [
  {
    mode: 'large',
    icon: <MaterialIcons name="fullscreen" size={16} />,
    label: 'Large',
    description: 'Single large view with details',
  },
  {
    mode: 'large-portrait',
    icon: <MaterialIcons name="view-column" size={16} />,
    label: 'Portrait',
    description: 'Two large portrait views side by side',
  },
  {
    mode: 'grid-2',
    icon: <Ionicons name="grid" size={16} />,
    label: '2×2',
    description: 'Comfortable grid with details',
  },
  {
    mode: 'grid-3',
    icon: <Ionicons name="grid" size={16} />,
    label: '3×3',
    description: 'Balanced grid view',
  },
  {
    mode: 'grid-4',
    icon: <Ionicons name="apps" size={16} />,
    label: '4×4',
    description: 'Compact grid view',
  },
  {
    mode: 'grid-6',
    icon: <Ionicons name="apps" size={16} />,
    label: '6×6',
    description: 'Dense grid view',
  },
  {
    mode: 'grid-8',
    icon: <Ionicons name="apps" size={16} />,
    label: '8×8',
    description: 'Maximum density view',
  },
];

export function AlbumViewModeSelector({ 
  currentMode, 
  onModeChange,
  disabled = false,
  testID = 'album-view-mode-selector'
}: AlbumViewModeSelectorProps) {
  const theme = getCurrentTheme();
  const [isChanging, setIsChanging] = useState(false);
  
  // Animation values
  const containerScale = useSharedValue(1);
  const fadeOpacity = useSharedValue(1);
  
  // Memoize styles to prevent recreation
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleModePress = useCallback(async (mode: AlbumViewMode) => {
    if (disabled || isChanging || mode === currentMode) return;

    try {
      setIsChanging(true);
      
      // Animate selection feedback
      containerScale.value = withSpring(0.98, { damping: 15, stiffness: 300 }, () => {
        containerScale.value = withSpring(1);
      });

      // Brief fade for visual feedback
      fadeOpacity.value = withTiming(0.7, { duration: 100 }, () => {
        fadeOpacity.value = withTiming(1, { duration: 200 });
      });

      // Call the change handler
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for UX
      onModeChange(mode);
      
    } catch (error) {
      console.error('Error changing view mode:', error);
      Alert.alert(
        'View Mode Error',
        'Failed to change view mode. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsChanging(false);
    }
  }, [disabled, isChanging, currentMode, onModeChange, containerScale, fadeOpacity]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
    opacity: fadeOpacity.value,
  }));

  const renderModeButton = useCallback((option: typeof VIEW_MODE_OPTIONS[0], index: number) => {
    const isSelected = currentMode === option.mode;
    const isDisabled = disabled || isChanging;
    
    const buttonScale = useSharedValue(1);
    const buttonOpacity = useSharedValue(1);
    
    const handlePressIn = () => {
      if (isDisabled) return;
      buttonScale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
      buttonOpacity.value = withTiming(0.8, { duration: 100 });
    };

    const handlePressOut = () => {
      if (isDisabled) return;
      buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      buttonOpacity.value = withTiming(1, { duration: 100 });
    };

    const buttonAnimatedStyle = useAnimatedStyle(() => {
      const scale = interpolate(
        buttonScale.value,
        [0.9, 1],
        [0.9, isSelected ? 1.05 : 1]
      );
      
      return {
        transform: [{ scale }],
        opacity: buttonOpacity.value,
      };
    });

    const iconColor = isSelected 
      ? 'white' 
      : isDisabled 
        ? theme.colors.border 
        : theme.colors.textSecondary;

    return (
      <AnimatedPressable
        key={option.mode}
        style={[
          styles.modeButton,
          isSelected && styles.modeButtonSelected,
          isDisabled && styles.modeButtonDisabled,
          buttonAnimatedStyle,
        ]}
        onPress={() => handleModePress(option.mode)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        testID={`${testID}-${option.mode}`}
        accessible={true}
        accessibilityLabel={`${option.label} view mode: ${option.description}`}
        accessibilityRole="button"
        accessibilityState={{ 
          selected: isSelected,
          disabled: isDisabled 
        }}
      >
        <View style={styles.iconContainer}>
          {React.cloneElement(option.icon as React.ReactElement<any>, {
            color: iconColor,
          })}
        </View>
        <Text style={[
          styles.modeLabel,
          isSelected && styles.modeLabelSelected,
          isDisabled && styles.modeLabelDisabled,
        ]}>
          {option.label}
        </Text>
      </AnimatedPressable>
    );
  }, [currentMode, disabled, isChanging, handleModePress, styles, theme.colors, testID]);

  return (
    <Animated.View 
      style={[styles.container, containerAnimatedStyle]}
      testID={testID}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        decelerationRate="fast"
        testID={`${testID}-scroll-view`}
      >
        {VIEW_MODE_OPTIONS.map(renderModeButton)}
      </ScrollView>
      
      {/* Loading indicator when changing modes */}
      {isChanging && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingIndicator} />
        </View>
      )}
    </Animated.View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  modeButton: {
    minWidth: 60,
    height: 44,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  modeButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    elevation: 3,
    shadowOpacity: 0.2,
    shadowColor: theme.colors.primary,
  },
  modeButtonDisabled: {
    opacity: 0.5,
    elevation: 0,
    shadowOpacity: 0,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  modeLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  modeLabelSelected: {
    color: 'white',
    fontFamily: 'Inter-SemiBold',
  },
  modeLabelDisabled: {
    color: theme.colors.border,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.borderRadius.lg,
  },
  loadingIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    opacity: 0.6,
  },
});