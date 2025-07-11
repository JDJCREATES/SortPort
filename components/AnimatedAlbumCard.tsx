import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  interpolate,
  runOnJS
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Album } from '../types';
import { AlbumViewMode } from '../types/display';
import { OptimizedImage } from './OptimizedImage';
import { getCurrentTheme, ThemeManager } from '../utils/theme';
import { AppTheme } from '../types';

interface AnimatedAlbumCardProps {
  album: Album;
  onPress: () => void;
  showLocked?: boolean;
  index?: number;
  viewMode?: AlbumViewMode;
  showDetails?: boolean;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function AnimatedAlbumCard({ 
  album, 
  onPress, 
  showLocked = true, 
  index = 0,
  viewMode = 'grid-2',
  showDetails = true
}: AnimatedAlbumCardProps) {
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());

  // Subscribe to theme changes for instant updates
  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    return unsubscribe;
  }, []);

  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(50);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    const delay = index * 100;
    
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 600 });
      translateY.value = withSpring(0, { damping: 15, stiffness: 100 });
    }, delay);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value * pressScale.value },
        { translateY: translateY.value },
      ],
      opacity: opacity.value,
    };
  });

  const handlePressIn = () => {
    pressScale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    runOnJS(onPress)();
  };

  const isCompactMode = viewMode === 'grid-6' || viewMode === 'grid-8';
  const isLargeMode = viewMode === 'large';

  const styles = React.useMemo(() => createStyles(currentTheme), [currentTheme]);

  return (
    <AnimatedTouchableOpacity 
      style={[
        styles.container, 
        isLargeMode && styles.largeContainer,
        isCompactMode && styles.compactContainer,
        animatedStyle
      ]} 
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <View style={[
        styles.imageContainer,
        isLargeMode && styles.largeImageContainer
      ]}>
        {album.thumbnail ? (
          <OptimizedImage
            uri={album.thumbnail}
            thumbnailUri={album.thumbnail} // For album cards, thumbnail is already optimized
            style={[
              styles.thumbnail,
              isLargeMode && styles.largeThumbnail
            ]}
            priority="high"
            showLoadingIndicator={true}
          />
        ) : (
          <View style={[
            styles.placeholderThumbnail,
            isLargeMode && styles.largePlaceholderThumbnail
          ]}>
            <Ionicons 
              name="sparkles" 
              size={isCompactMode ? 16 : isLargeMode ? 48 : 32} 
              color={currentTheme.colors.primary} 
            />
          </View>
        )}
        {album.isLocked && showLocked && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={isCompactMode ? 12 : 16} color="white" />
          </View>
        )}
        <View style={[
          styles.countBadge,
          isCompactMode && styles.compactCountBadge
        ]}>
          <Text style={[
            styles.countText,
            isCompactMode && styles.compactCountText
          ]}>
            {album.count}
          </Text>
        </View>
        <View style={styles.gradient} />
      </View>
      
      {showDetails && (
        <View style={[
          styles.info,
          isLargeMode && styles.largeInfo
        ]}>
          <Text style={[
            styles.albumName,
            isLargeMode && styles.largeAlbumName
          ]} numberOfLines={isLargeMode ? 2 : 1}>
            {album.name}
          </Text>
          {album.tags.length > 0 && (
            <Text style={[
              styles.tags,
              isLargeMode && styles.largeTags
            ]} numberOfLines={isLargeMode ? 2 : 1}>
              {album.tags.slice(0, isLargeMode ? 4 : 2).join(' • ')}
            </Text>
          )}
        </View>
      )}
    </AnimatedTouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  largeContainer: {
    borderRadius: theme.borderRadius.xl,
    elevation: 4,
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  compactContainer: {
    borderRadius: theme.borderRadius.sm,
    elevation: 2,
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  imageContainer: {
    position: 'relative',
    aspectRatio: 1,
  },
  largeImageContainer: {
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.border,
  },
  largeThumbnail: {
    borderRadius: theme.borderRadius.lg,
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: `${theme.colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  largePlaceholderThumbnail: {
    borderRadius: theme.borderRadius.lg,
  },
  lockOverlay: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.xs,
  },
  moderatedOverlay: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: 'rgba(255, 152, 0, 0.9)', // Orange warning color
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.xs,
  },
  countBadge: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    minWidth: 28,
    alignItems: 'center',
  },
  compactCountBadge: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    minWidth: 20,
    borderRadius: theme.borderRadius.sm,
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  compactCountText: {
    fontSize: 10,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'transparent',
  },
  info: {
    padding: theme.spacing.md,
  },
  largeInfo: {
    padding: theme.spacing.lg,
  },
  albumName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  largeAlbumName: {
    fontSize: 20,
    marginBottom: theme.spacing.sm,
  },
  tags: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  largeTags: {
    fontSize: 14,
    lineHeight: 20,
  },
});