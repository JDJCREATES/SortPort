import React, { useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { AlbumViewMode, VIEW_MODE_CONFIGS } from '../types/display';
import { AnimatedAlbumCard } from './AnimatedAlbumCard';
import { Album } from '../types';
import { getCurrentTheme } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';

interface ResponsiveAlbumGridProps {
  albums: Album[];
  viewMode: AlbumViewMode;
  onAlbumPress: (album: Album) => void;
  showLocked?: boolean;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  testID?: string;
  onRetry?: () => void;
}

const theme = getCurrentTheme();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ResponsiveAlbumGrid({
  albums,
  viewMode,
  onAlbumPress,
  showLocked = true,
  loading = false,
  error = null,
  emptyMessage = 'No albums found',
  testID = 'responsive-album-grid',
  onRetry,
}: ResponsiveAlbumGridProps) {
  const theme = getCurrentTheme();
  const config = VIEW_MODE_CONFIGS[viewMode];

  const { cardWidth, cardHeight } = useMemo(() => {
    const horizontalPadding = theme.spacing.lg * 2;
    const totalSpacing = (config.columns - 1) * config.spacing;
    const availableWidth = SCREEN_WIDTH - horizontalPadding - totalSpacing;

    const width = availableWidth / config.columns;
    const height = width / config.aspectRatio;

    return {
      cardWidth: width,
      cardHeight: height,
    };
  }, [config.columns, config.spacing, config.aspectRatio, theme.spacing.lg]);

  const gridStyle = useMemo(
    () => ({
      gap: config.spacing,
    }),
    [config.spacing]
  );

  const cardContainerStyle = useMemo(
    () => ({
      width: cardWidth,
      height: cardHeight,
    }),
    [cardWidth, cardHeight]
  );

  const handleAlbumPress = useCallback(
    (album: Album) => {
      onAlbumPress(album);
    },
    [onAlbumPress]
  );

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // Create styles with current theme
  const styles = createStyles(theme);

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer} testID={`${testID}-loading`}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading albums...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer} testID={`${testID}-error`}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={theme.colors.error}
          style={styles.errorIcon}
        />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        {onRetry && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            testID={`${testID}-retry-button`}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Empty state
  if (!albums || albums.length === 0) {
    return (
      <View style={styles.centerContainer} testID={`${testID}-empty`}>
        <Ionicons
          name="images-outline"
          size={48}
          color={theme.colors.textSecondary}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle}>No Albums</Text>
        <Text style={styles.emptyMessage}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, gridStyle]}
      testID={testID}
      accessible={true}
      accessibilityLabel={`Album grid with ${albums.length} albums in ${viewMode} view`}
    >
      {albums.map((album, index) => (
        <View
          key={album.id}
          style={cardContainerStyle}
          testID={`${testID}-card-${index}`}
        >
          <AnimatedAlbumCard
            album={album}
            onPress={() => handleAlbumPress(album)}
            showLocked={showLocked}
            index={index}
            viewMode={viewMode}
            showDetails={config.showDetails}
          />
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingTop: theme.spacing.md,
      backgroundColor: theme.colors.background,
      minHeight: 200,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: theme.spacing.xl,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.background,
      minHeight: 300,
    },
    loadingText: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.md,
    },
    errorIcon: {
      marginBottom: theme.spacing.md,
    },
    errorTitle: {
      fontSize: 18,
      fontFamily: 'Inter-SemiBold',
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
      textAlign: 'center',
    },
    errorMessage: {
      fontSize: 14,
      fontFamily: 'Inter-Regular',
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: theme.spacing.lg,
      lineHeight: 20,
    },
    retryButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      elevation: 2,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    retryButtonText: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: 'white',
    },
    emptyIcon: {
      marginBottom: theme.spacing.md,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: 'Inter-SemiBold',
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    emptyMessage: {
      fontSize: 14,
      fontFamily: 'Inter-Regular',
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
