import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Pressable } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { AlbumViewMode } from '../types/display';
import { lightTheme } from '../utils/theme';

interface AlbumViewModeSelectorProps {
  currentMode: AlbumViewMode;
  onModeChange: (mode: AlbumViewMode) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const VIEW_MODE_OPTIONS: Array<{
  mode: AlbumViewMode;
  icon: React.ReactNode;
  label: string;
}> = [
  {
    mode: 'large',
    icon: <MaterialIcons name="fullscreen" size={16} />,
    label: 'Large',
  },
  {
    mode: 'grid-2',
    icon: <Ionicons name="grid" size={16} />,
    label: '2×2',
  },
  {
    mode: 'grid-3',
    icon: <Ionicons name="grid" size={16} />,
    label: '3×3',
  },
  {
    mode: 'grid-4',
    icon: <Ionicons name="apps" size={16} />,
    label: '4×4',
  },
  {
    mode: 'grid-6',
    icon: <Ionicons name="apps" size={16} />,
    label: '6×6',
  },
  {
    mode: 'grid-8',
    icon: <Ionicons name="apps" size={16} />,
    label: '8×8',
  },
];

export function AlbumViewModeSelector({ currentMode, onModeChange }: AlbumViewModeSelectorProps) {
  const handleModePress = (mode: AlbumViewMode) => {
    onModeChange(mode);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {VIEW_MODE_OPTIONS.map((option) => {
          const isSelected = currentMode === option.mode;
          const iconColor = isSelected ? 'white' : lightTheme.colors.textSecondary;
          
          const animatedStyle = useAnimatedStyle(() => ({
            transform: [
              {
                scale: withSpring(isSelected ? 1.05 : 1, {
                  damping: 15,
                  stiffness: 200,
                }),
              },
            ],
          }));

          return (
            <AnimatedPressable
              key={option.mode}
              style={[
                styles.modeButton,
                isSelected && styles.modeButtonSelected,
                animatedStyle,
              ]}
              onPress={() => handleModePress(option.mode)}
            >
              <View style={styles.iconContainer}>
                {React.cloneElement(option.icon as React.ReactElement<any>, {
                  color: iconColor,
                })}
              </View>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
  },
  scrollContent: {
    paddingHorizontal: lightTheme.spacing.md,
    gap: lightTheme.spacing.sm,
    alignItems: 'center',
  },
  modeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightTheme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: lightTheme.colors.border,
  },
  modeButtonSelected: {
    backgroundColor: lightTheme.colors.primary,
    borderColor: lightTheme.colors.primary,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});