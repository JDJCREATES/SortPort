/**
 * Sorting Progress Component
 * 
 * Displays real-time progress during natural language image sorting operations.
 * Shows current stage, progress percentage, and estimated time remaining.
 * 
 * Key Features:
 * - Animated progress bar with smooth transitions
 * - Stage-specific messaging and icons
 * - Cancellation support with confirmation
 * - Cost estimation and credit tracking
 * - Error state handling with retry options
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming,
  withRepeat,
  withSequence
} from 'react-native-reanimated';
import { getCurrentTheme } from '../utils/theme';
import { SortingProgress as SortingProgressType } from '../utils/sortingService';

const { width: screenWidth } = Dimensions.get('window');

interface SortingProgressProps {
  progress: SortingProgressType;
  onCancel?: () => void;
  onRetry?: () => void;
  isVisible: boolean;
  estimatedCost?: number;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const STAGE_CONFIG = {
  analyzing: {
    icon: 'search' as const,
    title: 'Analyzing Request',
    color: '#3B82F6',
    description: 'Understanding your natural language query'
  },
  embedding: {
    icon: 'git-network' as const,
    title: 'Processing Images',
    color: '#8B5CF6',
    description: 'Generating semantic embeddings for your images'
  },
  sorting: {
    icon: 'swap-vertical' as const,
    title: 'Intelligent Sorting',
    color: '#10B981',
    description: 'Applying AI-powered sorting algorithms'
  },
  vision: {
    icon: 'eye' as const,
    title: 'Visual Analysis',
    color: '#F59E0B',
    description: 'Analyzing visual content with advanced AI'
  },
  complete: {
    icon: 'checkmark-circle' as const,
    title: 'Complete',
    color: '#10B981',
    description: 'Sorting completed successfully'
  },
  error: {
    icon: 'alert-circle' as const,
    title: 'Error',
    color: '#EF4444',
    description: 'Something went wrong'
  }
};

export function SortingProgress({
  progress,
  onCancel,
  onRetry,
  isVisible,
  estimatedCost = 1
}: SortingProgressProps) {
  const theme = getCurrentTheme();
  const styles = createStyles(theme);

  // Animation values
  const containerScale = useSharedValue(isVisible ? 1 : 0.9);
  const containerOpacity = useSharedValue(isVisible ? 1 : 0);
  const progressWidth = useSharedValue(0);
  const iconRotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  // Update animations when visibility changes
  useEffect(() => {
    if (isVisible) {
      containerScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      containerOpacity.value = withSpring(1, { damping: 15, stiffness: 300 });
    } else {
      containerScale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
      containerOpacity.value = withSpring(0, { damping: 15, stiffness: 300 });
    }
  }, [isVisible]);

  // Update progress bar when progress changes
  useEffect(() => {
    progressWidth.value = withTiming(progress.progress, { duration: 500 });
  }, [progress.progress]);

  // Animate icon based on stage
  useEffect(() => {
    if (progress.stage === 'analyzing' || progress.stage === 'embedding') {
      // Continuous rotation for processing stages
      iconRotation.value = withRepeat(
        withTiming(360, { duration: 2000 }),
        -1,
        false
      );
    } else if (progress.stage === 'error') {
      // Shake animation for errors
      iconRotation.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
    } else {
      iconRotation.value = withSpring(0);
    }

    // Pulse animation for active stages
    if (progress.stage !== 'complete' && progress.stage !== 'error') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withSpring(1);
    }
  }, [progress.stage]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
    opacity: containerOpacity.value,
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${iconRotation.value}deg` },
      { scale: pulseScale.value }
    ],
  }));

  const handleCancel = () => {
    Alert.alert(
      'Cancel Sorting',
      'Are you sure you want to cancel the current sorting operation?',
      [
        { text: 'Continue', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: onCancel
        }
      ]
    );
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const stageConfig = STAGE_CONFIG[progress.stage];

  if (!isVisible) return null;

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Animated.View style={[styles.iconContainer, iconAnimatedStyle]}>
              <Ionicons
                name={stageConfig.icon}
                size={24}
                color={stageConfig.color}
              />
            </Animated.View>
            <View style={styles.headerText}>
              <Text style={styles.stageTitle}>{stageConfig.title}</Text>
              <Text style={styles.stageDescription}>{stageConfig.description}</Text>
            </View>
          </View>
          
          {(progress.stage !== 'complete' && progress.stage !== 'error') && onCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                { backgroundColor: stageConfig.color },
                progressBarStyle
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress.progress}%</Text>
        </View>

        {/* Status Message */}
        <Text style={styles.statusMessage}>{progress.message}</Text>

        {/* Time and Cost Info */}
        <View style={styles.infoContainer}>
          {progress.estimatedTimeRemaining && progress.estimatedTimeRemaining > 0 && (
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.infoText}>
                {formatTimeRemaining(progress.estimatedTimeRemaining)} remaining
              </Text>
            </View>
          )}
          
          <View style={styles.infoItem}>
            <MaterialIcons name="account-balance-wallet" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>
              {estimatedCost} credit{estimatedCost !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Error Actions */}
        {progress.stage === 'error' && (
          <View style={styles.errorActions}>
            {onRetry && (
              <TouchableOpacity
                style={[styles.actionButton, styles.retryButton]}
                onPress={onRetry}
              >
                <Ionicons name="refresh" size={16} color={theme.colors.primary} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            )}
            
            {onCancel && (
              <TouchableOpacity
                style={[styles.actionButton, styles.dismissButton]}
                onPress={onCancel}
              >
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Success Actions */}
        {progress.stage === 'complete' && (
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={32} color="white" />
            </View>
            <Text style={styles.successText}>Sorting completed successfully!</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  content: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    marginHorizontal: theme.spacing.lg,
    width: screenWidth - theme.spacing.lg * 2,
    maxWidth: 400,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  headerText: {
    flex: 1,
  },
  stageTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  stageDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  cancelButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: theme.spacing.md,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    minWidth: 40,
    textAlign: 'right',
  },
  statusMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: 18,
  },
  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  infoText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  errorActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
  },
  retryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  dismissButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dismissButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
  },
  successContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  successText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.success,
    textAlign: 'center',
  },
});
