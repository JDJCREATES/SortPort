/**
 * Sorting Results Component
 * 
 * Displays the results of natural language image sorting with interactive features.
 * Shows sorted images, reasoning, confidence scores, and cost information.
 * 
 * Key Features:
 * - Responsive grid layout for sorted images
 * - Detailed reasoning and confidence display
 * - Cost breakdown and savings information
 * - Interactive image reordering
 * - Export and save functionality
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  runOnJS
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { getCurrentTheme } from '../utils/theme';
import { SortingResult, SortedImage } from '../utils/sortingService';

const { width: screenWidth } = Dimensions.get('window');

interface SortingResultsProps {
  result: SortingResult;
  onImagePress?: (image: SortedImage, index: number) => void;
  onSaveResults?: (result: SortingResult) => void;
  onApplySort?: (images: SortedImage[]) => void;
  onClose?: () => void;
  isVisible: boolean;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function SortingResults({
  result,
  onImagePress,
  onSaveResults,
  onApplySort,
  onClose,
  isVisible
}: SortingResultsProps) {
  const [expandedDetails, setExpandedDetails] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const theme = getCurrentTheme();
  const styles = createStyles(theme);

  const containerScale = useSharedValue(isVisible ? 1 : 0.95);
  const containerOpacity = useSharedValue(isVisible ? 1 : 0);

  // Animate container when visibility changes
  React.useEffect(() => {
    if (isVisible) {
      containerScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      containerOpacity.value = withSpring(1, { damping: 15, stiffness: 300 });
    } else {
      containerScale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
      containerOpacity.value = withSpring(0, { damping: 15, stiffness: 300 });
    }
  }, [isVisible]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
    opacity: containerOpacity.value,
  }));

  const handleImagePress = useCallback((image: SortedImage, index: number) => {
    if (onImagePress) {
      onImagePress(image, index);
    }
  }, [onImagePress]);

  const toggleImageSelection = useCallback((imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  }, []);

  const handleSaveResults = useCallback(() => {
    if (onSaveResults) {
      onSaveResults(result);
    }
  }, [result, onSaveResults]);

  const handleApplySort = useCallback(() => {
    Alert.alert(
      'Apply Sorting',
      `Apply this sorting order to your ${result.sortedImages.length} images?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: () => {
            if (onApplySort) {
              onApplySort(result.sortedImages);
            }
          }
        }
      ]
    );
  }, [result.sortedImages, onApplySort]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return theme.colors.success;
    if (confidence >= 0.6) return theme.colors.warning;
    return theme.colors.error;
  };

  const getGridColumns = () => {
    if (screenWidth > 768) return 4;
    if (screenWidth > 480) return 3;
    return 2;
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
        <Text style={styles.headerTitle}>Sorting Results</Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity
          style={[styles.iconButton, styles.saveButton]}
          onPress={handleSaveResults}
        >
          <Ionicons name="bookmark-outline" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onClose}
        >
          <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSummary = () => (
    <View style={styles.summary}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Images</Text>
          <Text style={styles.summaryValue}>{result.sortedImages.length}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Confidence</Text>
          <View style={styles.confidenceContainer}>
            <Text style={[styles.summaryValue, { color: getConfidenceColor(result.confidence) }]}>
              {(result.confidence * 100).toFixed(0)}%
            </Text>
            <View style={[styles.confidenceBar, { backgroundColor: theme.colors.border }]}>
              <View
                style={[
                  styles.confidenceIndicator,
                  {
                    width: `${result.confidence * 100}%`,
                    backgroundColor: getConfidenceColor(result.confidence)
                  }
                ]}
              />
            </View>
          </View>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Cost</Text>
          <Text style={styles.summaryValue}>{result.cost.balance} credits</Text>
        </View>
      </View>
    </View>
  );

  const renderReasoning = () => (
    <View style={styles.reasoningContainer}>
      <TouchableOpacity
        style={styles.reasoningHeader}
        onPress={() => setExpandedDetails(!expandedDetails)}
      >
        <Text style={styles.reasoningTitle}>AI Reasoning</Text>
        <Ionicons
          name={expandedDetails ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>
      
      {expandedDetails && (
        <View style={styles.reasoningContent}>
          <Text style={styles.reasoningText}>{result.reasoning}</Text>
          
          <View style={styles.metadataContainer}>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Processing Time:</Text>
              <Text style={styles.metadataValue}>
                {(result.processingTime / 1000).toFixed(1)}s
              </Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Vision Analysis:</Text>
              <Text style={styles.metadataValue}>
                {result.usedVision ? 'Yes' : 'No'}
              </Text>
            </View>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Cost Breakdown:</Text>
              <View style={styles.costBreakdown}>
                <Text style={styles.costItem}>
                  Embedding: {result.cost.breakdown.embedding}
                </Text>
                <Text style={styles.costItem}>
                  Vision: {result.cost.breakdown.vision}
                </Text>
                <Text style={styles.costItem}>
                  Processing: {result.cost.breakdown.processing}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const renderImageGrid = () => {
    const columns = getGridColumns();
    const imageSize = (screenWidth - theme.spacing.lg * 4) / columns - theme.spacing.sm;

    return (
      <View style={styles.gridContainer}>
        <Text style={styles.gridTitle}>Sorted Images</Text>
        <View style={styles.grid}>
          {result.sortedImages.map((sortedImage, index) => (
            <AnimatedTouchableOpacity
              key={sortedImage.id}
              style={[styles.gridItem, { width: imageSize, height: imageSize }]}
              onPress={() => handleImagePress(sortedImage, index)}
              onLongPress={() => toggleImageSelection(sortedImage.id)}
            >
              <Image
                source={{ uri: sortedImage.originalPath }}
                style={styles.gridImage}
                contentFit="cover"
              />
              
              {/* Position indicator */}
              <View style={styles.positionBadge}>
                <Text style={styles.positionText}>{sortedImage.position}</Text>
              </View>

              {/* Selection indicator */}
              {selectedImages.has(sortedImage.id) && (
                <View style={styles.selectionOverlay}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.primary} />
                </View>
              )}

              {/* Score indicator */}
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreText}>
                  {(sortedImage.sortScore * 100).toFixed(0)}%
                </Text>
              </View>

              {/* Metadata indicators */}
              {sortedImage.metadata && (
                <View style={styles.metadataIndicators}>
                  {sortedImage.metadata.tone && (
                    <View style={[styles.indicator, styles.toneIndicator]}>
                      <Text style={styles.indicatorText}>
                        {sortedImage.metadata.tone.substring(0, 3)}
                      </Text>
                    </View>
                  )}
                  {sortedImage.metadata.scene && (
                    <View style={[styles.indicator, styles.sceneIndicator]}>
                      <Text style={styles.indicatorText}>
                        {sortedImage.metadata.scene.substring(0, 3)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </AnimatedTouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderActions = () => (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.actionButton, styles.secondaryButton]}
        onPress={() => setExpandedDetails(!expandedDetails)}
      >
        <MaterialIcons name="info-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.secondaryButtonText}>Details</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.actionButton, styles.primaryButton]}
        onPress={handleApplySort}
      >
        <Ionicons name="checkmark" size={18} color="white" />
        <Text style={styles.primaryButtonText}>Apply Sort</Text>
      </TouchableOpacity>
    </View>
  );

  if (!isVisible) return null;

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderHeader()}
        {renderSummary()}
        {renderReasoning()}
        {renderImageGrid()}
      </ScrollView>
      {renderActions()}
    </Animated.View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  saveButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  summary: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  confidenceContainer: {
    alignItems: 'center',
    width: '100%',
  },
  confidenceBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: theme.spacing.xs,
    overflow: 'hidden',
  },
  confidenceIndicator: {
    height: '100%',
    borderRadius: 2,
  },
  reasoningContainer: {
    margin: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  reasoningHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  reasoningTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  reasoningContent: {
    padding: theme.spacing.md,
    paddingTop: 0,
  },
  reasoningText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  metadataContainer: {
    gap: theme.spacing.sm,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metadataLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  metadataValue: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  costBreakdown: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  costItem: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
  gridContainer: {
    padding: theme.spacing.lg,
  },
  gridTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  gridItem: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  positionBadge: {
    position: 'absolute',
    top: theme.spacing.xs,
    left: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  positionText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: 'white',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreContainer: {
    position: 'absolute',
    bottom: theme.spacing.xs,
    right: theme.spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  scoreText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: 'white',
  },
  metadataIndicators: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    flexDirection: 'row',
    gap: 2,
  },
  indicator: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  toneIndicator: {
    backgroundColor: theme.colors.success,
  },
  sceneIndicator: {
    backgroundColor: theme.colors.warning,
  },
  indicatorText: {
    fontSize: 8,
    fontFamily: 'Inter-Bold',
    color: 'white',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    flex: 0.45,
    gap: theme.spacing.sm,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.primary,
  },
});
