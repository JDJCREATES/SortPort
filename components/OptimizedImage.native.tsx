import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import FastImage, { FastImageProps, ResizeMode } from 'react-native-fast-image';
import { ImageStyle } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  runOnJS
} from 'react-native-reanimated';
import { lightTheme } from '../utils/theme';

interface OptimizedImageProps {
  uri: string;
  thumbnailUri?: string;
  style?: ImageStyle | ImageStyle[];
  resizeMode?: ResizeMode;
  priority?: 'low' | 'normal' | 'high';
  showLoadingIndicator?: boolean;
  placeholderColor?: string;
  onLoad?: () => void;
  onError?: (error: any) => void;
  testID?: string;
}

const AnimatedFastImage = Animated.createAnimatedComponent(FastImage);

export function OptimizedImage({
  uri,
  thumbnailUri,
  style,
  resizeMode = FastImage.resizeMode.cover,
  priority = 'normal',
  showLoadingIndicator = true,
  placeholderColor = lightTheme.colors.surface,
  onLoad,
  onError,
  testID,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(!thumbnailUri);

  const opacity = useSharedValue(0);
  const thumbnailOpacity = useSharedValue(thumbnailUri ? 1 : 0);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    opacity.value = withTiming(1, { duration: 300 });
    
    if (thumbnailUri && !showFullImage) {
      // Hide thumbnail and show full image
      thumbnailOpacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setShowFullImage)(true);
      });
    }
    
    onLoad?.();
  }, [opacity, thumbnailOpacity, thumbnailUri, showFullImage, onLoad]);

  const handleError = useCallback((error: any) => {
    setIsLoading(false);
    setHasError(true);
    onError?.(error);
  }, [onError]);

  const handleThumbnailLoad = useCallback(() => {
    if (thumbnailUri) {
      thumbnailOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [thumbnailUri, thumbnailOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const thumbnailAnimatedStyle = useAnimatedStyle(() => ({
    opacity: thumbnailOpacity.value,
  }));

  const flattenedStyle = StyleSheet.flatten(style);
  const containerStyle = {
    width: flattenedStyle?.width,
    height: flattenedStyle?.height,
    backgroundColor: placeholderColor,
    ...flattenedStyle,
  };

  // Determine FastImage priority
  const fastImagePriority = priority === 'high' 
    ? FastImage.priority.high 
    : priority === 'low' 
    ? FastImage.priority.low 
    : FastImage.priority.normal;

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {/* Thumbnail layer */}
      {thumbnailUri && !showFullImage && (
        <AnimatedFastImage
          source={{ uri: thumbnailUri, priority: FastImage.priority.high }}
          style={[StyleSheet.absoluteFill, thumbnailAnimatedStyle]}
          resizeMode={resizeMode}
          onLoad={handleThumbnailLoad}
        />
      )}

      {/* Full image layer */}
      {(showFullImage || !thumbnailUri) && (
        <AnimatedFastImage
          source={{ uri, priority: fastImagePriority }}
          style={[StyleSheet.absoluteFill, animatedStyle]}
          resizeMode={resizeMode}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Loading indicator */}
      {isLoading && showLoadingIndicator && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={lightTheme.colors.primary} />
        </View>
      )}

      {/* Error state */}
      {hasError && (
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <View style={styles.errorIconInner} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.border,
  },
  errorIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: lightTheme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconInner: {
    width: 2,
    height: 12,
    backgroundColor: 'white',
    borderRadius: 1,
  },
});