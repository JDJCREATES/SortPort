import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Search, Filter, Grid } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AnimatedAlbumCard } from '../../components/AnimatedAlbumCard';
import { Album } from '../../types';
import { AlbumUtils } from '../../utils/albumUtils';
import { lightTheme } from '../../utils/theme';

export default function AlbumsScreen() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLocked, setShowLocked] = useState(true);

  useEffect(() => {
    loadAlbums();
  }, []);

  useEffect(() => {
    filterAlbums();
  }, [albums, showLocked]);

  const loadAlbums = async () => {
    try {
      const allAlbums = await AlbumUtils.loadAlbums();
      setAlbums(allAlbums);
    } catch (error) {
      console.error('Error loading albums:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAlbums = () => {
    let filtered = albums;
    
    if (!showLocked) {
      filtered = albums.filter(album => !album.isLocked);
    }
    
    setFilteredAlbums(filtered);
  };

  const handleAlbumPress = (album: Album) => {
    if (album.isLocked) {
      // Show premium prompt
      router.push('/settings');
      return;
    }
    
    router.push(`/album/${album.id}`);
  };

  const toggleShowLocked = () => {
    setShowLocked(!showLocked);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
        <View style={styles.headerLeft}>
          <Grid size={24} color={lightTheme.colors.primary} />
          <Text style={styles.title}>All Albums</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.filterButton} onPress={toggleShowLocked}>
            <Filter size={20} color={showLocked ? lightTheme.colors.primary : lightTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Animated.View entering={FadeInUp.delay(200)} style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading albums...</Text>
          </Animated.View>
        ) : filteredAlbums.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(200)} style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Albums Yet</Text>
            <Text style={styles.emptyText}>
              Use the Picture Hack feature to create your first smart album!
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/new-sort')}
            >
              <Text style={styles.createButtonText}>Create Album</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.delay(200)} style={styles.albumGrid}>
            {filteredAlbums.map((album, index) => (
              <AnimatedAlbumCard
                key={album.id}
                album={album}
                onPress={() => handleAlbumPress(album)}
                showLocked={showLocked}
                index={index}
              />
            ))}
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(300)} style={styles.filterInfo}>
          <Text style={styles.filterInfoText}>
            {showLocked 
              ? `Showing ${filteredAlbums.length} albums (including locked)`
              : `Showing ${filteredAlbums.length} unlocked albums`
            }
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
    paddingTop: lightTheme.spacing.lg,
    paddingBottom: lightTheme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: lightTheme.spacing.sm,
  },
  filterButton: {
    padding: lightTheme.spacing.sm,
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: lightTheme.spacing.lg,
  },
  loadingContainer: {
    paddingVertical: lightTheme.spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  emptyContainer: {
    paddingVertical: lightTheme.spacing.xl * 2,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  emptyText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: lightTheme.spacing.lg,
    paddingHorizontal: lightTheme.spacing.lg,
    lineHeight: 22,
  },
  createButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  filterInfo: {
    paddingVertical: lightTheme.spacing.lg,
    alignItems: 'center',
  },
  filterInfoText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
});