import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Album } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { getCurrentTheme, ThemeManager } from '../utils/theme';
import { AppTheme } from '../types';

interface AlbumCardProps {
  album: Album;
  onPress: () => void;
  showLocked?: boolean;
}

export function AlbumCard({ album, onPress, showLocked = true }: AlbumCardProps) {
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());

  // Subscribe to theme changes for instant updates
  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    return unsubscribe;
  }, []);

  const styles = React.useMemo(() => createStyles(currentTheme), [currentTheme]);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.imageContainer}>
        {album.thumbnail ? (
          <OptimizedImage
            uri={album.thumbnail}
            thumbnailUri={album.thumbnail} // For album cards, thumbnail is already optimized
            style={styles.thumbnail}
            priority="normal"
            showLoadingIndicator={true}
          />
        ) : (
          <View style={styles.placeholderThumbnail}>
            <Text style={styles.placeholderText}>📷</Text>
          </View>
        )}
        {album.isLocked && showLocked && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={20} color="white" />
          </View>
        )}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{album.count}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.albumName} numberOfLines={1}>
          {album.name}
        </Text>
        {album.tags.length > 0 && (
          <Text style={styles.tags} numberOfLines={1}>
            {album.tags.slice(0, 3).join(' • ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    width: '48%',
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    aspectRatio: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.border,
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
    opacity: 0.5,
  },
  lockOverlay: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.xs,
  },
  countBadge: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  info: {
    padding: theme.spacing.sm,
  },
  albumName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  tags: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});