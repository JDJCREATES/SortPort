import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  interpolate,
  runOnJS
} from 'react-native-reanimated';
import { Lock, Sparkles } from 'lucide-react-native';
import { Album } from '../types';
import { lightTheme } from '../utils/theme';

interface AnimatedAlbumCardProps {
  album: Album;
  onPress: () => void;
  showLocked?: boolean;
  index?: number;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function AnimatedAlbumCard({ album, onPress, showLocked = true, index = 0 }: AnimatedAlbumCardProps) {
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

  return (
    <AnimatedTouchableOpacity 
      style={[styles.container, animatedStyle]} 
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <View style={styles.imageContainer}>
        {album.thumbnail ? (
          <Image source={{ uri: album.thumbnail }} style={styles.thumbnail} />
        ) : (
          <View style={styles.placeholderThumbnail}>
            <Sparkles size={32} color={lightTheme.colors.primary} />
          </View>
        )}
        {album.isLocked && showLocked && (
          <View style={styles.lockOverlay}>
            <Lock size={16} color="white" />
          </View>
        )}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{album.count}</Text>
        </View>
        <View style={styles.gradient} />
      </View>
      <View style={styles.info}>
        <Text style={styles.albumName} numberOfLines={1}>
          {album.name}
        </Text>
        {album.tags.length > 0 && (
          <Text style={styles.tags} numberOfLines={1}>
            {album.tags.slice(0, 2).join(' • ')}
          </Text>
        )}
      </View>
    </AnimatedTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '48%',
    marginBottom: lightTheme.spacing.lg,
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  imageContainer: {
    position: 'relative',
    aspectRatio: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: lightTheme.colors.border,
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: `${lightTheme.colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    top: lightTheme.spacing.sm,
    right: lightTheme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: lightTheme.borderRadius.sm,
    padding: lightTheme.spacing.xs,
  },
  countBadge: {
    position: 'absolute',
    bottom: lightTheme.spacing.sm,
    right: lightTheme.spacing.sm,
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.md,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
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
    padding: lightTheme.spacing.md,
  },
  albumName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  tags: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
});