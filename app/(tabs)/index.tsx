import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Plus, Wand2 } from 'lucide-react-native';
import { AlbumCard } from '../../components/AlbumCard';
import { PictureHackBar } from '../../components/PictureHackBar';
import { Album } from '../../types';
import { AlbumUtils } from '../../utils/albumUtils';
import { lightTheme } from '../../utils/theme';

export default function HomeScreen() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    try {
      const smartAlbums = await AlbumUtils.getSmartAlbums();
      setAlbums(smartAlbums);
    } catch (error) {
      console.error('Error loading albums:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePictureHack = (prompt: string) => {
    router.push({
      pathname: '/new-sort',
      params: { prompt }
    });
  };

  const handleAlbumPress = (album: Album) => {
    if (album.isLocked) {
      // Show premium prompt
      router.push('/settings');
      return;
    }
    
    router.push(`/album/${album.id}`);
  };

  const handleNewSort = () => {
    router.push('/new-sort');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>SnapSort</Text>
          <Text style={styles.subtitle}>AI-powered photo organization</Text>
        </View>

        <PictureHackBar onSubmit={handlePictureHack} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Smart Albums</Text>
            <TouchableOpacity style={styles.newSortButton} onPress={handleNewSort}>
              <Plus size={16} color="white" />
              <Text style={styles.newSortButtonText}>New Sort</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading albums...</Text>
            </View>
          ) : (
            <View style={styles.albumGrid}>
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onPress={() => handleAlbumPress(album)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.activityCard}>
            <Wand2 size={20} color={lightTheme.colors.primary} />
            <Text style={styles.activityText}>
              Try the Picture Hack feature above to sort your photos with AI!
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: lightTheme.spacing.lg,
    paddingTop: lightTheme.spacing.lg,
    paddingBottom: lightTheme.spacing.md,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    marginTop: lightTheme.spacing.xs,
  },
  section: {
    paddingHorizontal: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  newSortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    borderRadius: lightTheme.borderRadius.md,
    gap: lightTheme.spacing.xs,
  },
  newSortButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
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
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    padding: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    gap: lightTheme.spacing.sm,
  },
  activityText: {
    flex: 1,
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
});