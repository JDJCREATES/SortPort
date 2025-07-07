import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { Album } from '../types';
import { OptimizedImage } from './OptimizedImage';
import { lightTheme } from '../utils/theme';

interface AlbumCardProps {
  album: Album;
  onPress: () => void;
  showLocked?: boolean;
}

export function AlbumCard({ album, onPress, showLocked = true }: AlbumCardProps) {
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
            <Lock size={20} color="white" />
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

const styles = StyleSheet.create({
  container: {
    width: '48%',
    marginBottom: lightTheme.spacing.md,
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    overflow: 'hidden',
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
    backgroundColor: lightTheme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
    opacity: 0.5,
  },
  lockOverlay: {
    position: 'absolute',
    top: lightTheme.spacing.sm,
    right: lightTheme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: lightTheme.borderRadius.sm,
    padding: lightTheme.spacing.xs,
  },
  countBadge: {
    position: 'absolute',
    bottom: lightTheme.spacing.sm,
    right: lightTheme.spacing.sm,
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.sm,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  info: {
    padding: lightTheme.spacing.sm,
  },
  albumName: {
    fontSize: 14,
    fontWeight: '600',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  tags: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
  },
});