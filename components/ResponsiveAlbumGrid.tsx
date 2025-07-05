import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { AlbumViewMode, VIEW_MODE_CONFIGS } from '../types/display';
import { AnimatedAlbumCard } from './AnimatedAlbumCard';
import { Album } from '../types';
import { lightTheme } from '../utils/theme';

interface ResponsiveAlbumGridProps {
  albums: Album[];
  viewMode: AlbumViewMode;
  onAlbumPress: (album: Album) => void;
  showLocked?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ResponsiveAlbumGrid({
  albums,
  viewMode,
  onAlbumPress,
  showLocked = true,
}: ResponsiveAlbumGridProps) {
  const config = VIEW_MODE_CONFIGS[viewMode];
  
  const { cardWidth, cardHeight } = useMemo(() => {
    const horizontalPadding = lightTheme.spacing.lg * 2;
    const totalSpacing = (config.columns - 1) * config.spacing;
    const availableWidth = SCREEN_WIDTH - horizontalPadding - totalSpacing;
    
    const width = availableWidth / config.columns;
    const height = width / config.aspectRatio;
    
    return {
      cardWidth: width,
      cardHeight: height,
    };
  }, [config.columns, config.spacing, config.aspectRatio]);

  const gridStyle = useMemo(() => ({
    gap: config.spacing,
  }), [config.spacing]);

  const cardContainerStyle = useMemo(() => ({
    width: cardWidth,
    height: cardHeight,
  }), [cardWidth, cardHeight]);

  return (
    <View style={[styles.container, gridStyle]}>
      {albums.map((album, index) => (
        <View key={album.id} style={cardContainerStyle}>
          <AnimatedAlbumCard
            album={album}
            onPress={() => onAlbumPress(album)}
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: lightTheme.spacing.md,
  },
});