import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
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
  resizeMode?: ImageContentFit;
  priority?: 'low' | 'normal' | 'high';
  showLoadingIndicator?: boolean;
  placeholderColor?: string;
  onPress?: () => void;
  onLoad?: () => void;
  onError?: () => void;
  testID?: string;
}

const AnimatedImage = Animated.createAnimatedComponent(Image);

export function OptimizedImage({
  uri,
  thumbnailUri,
  style,
  resizeMode = 'cover',
  priority = 'normal',
  showLoadingIndicator = true,
  placeholderColor = lightTheme.colors.surface,
  onPress,
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
      thumbnailOpacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setShowFullImage)(true);
      });
    }
    
    onLoad?.();
  }, [opacity, thumbnailOpacity, thumbnailUri, showFullImage, onLoad]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
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

  // Expo Image priority mapping
  const imagePriority = priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'normal';

  return (
    <TouchableOpacity 
      style={[styles.container, containerStyle]} 
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      {/* Thumbnail layer */}
      {thumbnailUri && !showFullImage && (
        <AnimatedImage
          source={{ uri: thumbnailUri }}
          style={[StyleSheet.absoluteFill, thumbnailAnimatedStyle]}
          contentFit={resizeMode}
          priority="high" // Thumbnails always high priority
          onLoad={handleThumbnailLoad}
          cachePolicy="memory-disk" // Best caching
          recyclingKey={`thumb-${thumbnailUri}`} // Optimize memory usage
        />
      )}

      {/* Full image layer */}
      {(showFullImage || !thumbnailUri) && (
        <AnimatedImage
          source={{ uri }}
          style={[StyleSheet.absoluteFill, animatedStyle]}
          contentFit={resizeMode}
          priority={imagePriority}
          onLoad={handleLoad}
          onError={handleError}
          cachePolicy="memory-disk" // Best caching
          recyclingKey={`full-${uri}`} // Optimize memory usage
          placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }} // Optional: add blur placeholder
          transition={300} // Smooth transition
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
    </TouchableOpacity>
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
