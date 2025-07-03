import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Plus, Wand as Wand2, TrendingUp, Zap, Clock } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AnimatedAlbumCard } from '../../components/AnimatedAlbumCard';
import { PictureHackBar } from '../../components/PictureHackBar';
import { InfoIcon } from '../../components/InfoIcon';
import { Album, UserFlags, AppSettings } from '../../types';
import { AlbumUtils } from '../../utils/albumUtils';
import { AutoSortManager } from '../../utils/autoSortManager';
import { RevenueCatManager } from '../../utils/revenuecat';
import { MediaStorage } from '../../utils/mediaStorage';
import { lightTheme } from '../../utils/theme';

export default function HomeScreen() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFlags, setUserFlags] = useState<UserFlags>({
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  });
  const [settings, setSettings] = useState<AppSettings>({
    darkMode: false,
    autoSort: false,
    nsfwFilter: true,
    notifications: true,
    selectedFolders: ['all_photos'],
    lastAutoSortTimestamp: 0,
  });
  const [autoSortStatus, setAutoSortStatus] = useState<'idle' | 'running' | 'completed'>('idle');

  useEffect(() => {
    loadAlbums();
    loadUserFlags();
    loadSettings();
  }, []);

  useEffect(() => {
    // Set up auto-sort trigger when settings or user flags change
    if (settings.autoSort && userFlags.isSubscribed) {
      scheduleAutoSort();
    }
  }, [settings.autoSort, userFlags.isSubscribed]);

  const loadAlbums = async () => {
    try {
      const smartAlbums = await AlbumUtils.getSmartAlbums();
      setAlbums(smartAlbums.slice(0, 6)); // Show only first 6 on home
    } catch (error) {
      console.error('Error loading albums:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserFlags = async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const flags = await revenueCat.getUserFlags();
      setUserFlags(flags);
    } catch (error) {
      console.error('Error loading user flags:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const savedSettings = await MediaStorage.loadSettings();
      setSettings(savedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const scheduleAutoSort = async () => {
    // Debounce auto-sort to prevent too frequent runs
    const debounceDelay = 5000; // 5 seconds
    
    setTimeout(async () => {
      if (AutoSortManager.canRunAutoSort(userFlags)) {
        setAutoSortStatus('running');
        
        try {
          const success = await AutoSortManager.triggerAutoSort(userFlags);
          if (success) {
            setAutoSortStatus('completed');
            // Reload albums to show updated data
            await loadAlbums();
            
            // Reset status after showing completion
            setTimeout(() => {
              setAutoSortStatus('idle');
            }, 3000);
          } else {
            setAutoSortStatus('idle');
          }
        } catch (error) {
          console.error('Auto-sort error:', error);
          setAutoSortStatus('idle');
        }
      }
    }, debounceDelay);
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

  const getAutoSortStatusText = () => {
    switch (autoSortStatus) {
      case 'running':
        return 'Auto-sorting new photos...';
      case 'completed':
        return 'Auto-sort completed!';
      default:
        return '';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
          <Text style={styles.title}>SnapSort</Text>
          <Text style={styles.subtitle}>AI-powered photo organization</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200)}>
          <PictureHackBar onSubmit={handlePictureHack} />
        </Animated.View>

        {/* Auto-Sort Status */}
        {userFlags.isSubscribed && settings.autoSort && autoSortStatus !== 'idle' && (
          <Animated.View entering={FadeInUp.delay(250)} style={styles.autoSortStatus}>
            <View style={styles.autoSortContainer}>
              {autoSortStatus === 'running' ? (
                <Zap size={16} color={lightTheme.colors.primary} />
              ) : (
                <Clock size={16} color={lightTheme.colors.success} />
              )}
              <Text style={styles.autoSortText}>{getAutoSortStatusText()}</Text>
            </View>
          </Animated.View>
        )}

        <View style={styles.section}>
          <Animated.View entering={FadeInUp.delay(300)} style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <TrendingUp size={20} color={lightTheme.colors.primary} />
              <Text style={styles.sectionTitle}>Smart Albums</Text>
              {userFlags.isSubscribed && settings.autoSort && (
                <InfoIcon 
                  message="Auto-sort is enabled! New photos will be automatically organized into these albums based on AI analysis."
                  title="Auto-Sort Active"
                  color={lightTheme.colors.success}
                />
              )}
            </View>
            <TouchableOpacity style={styles.newSortButton} onPress={handleNewSort}>
              <Plus size={16} color="white" />
              <Text style={styles.newSortButtonText}>New Sort</Text>
            </TouchableOpacity>
          </Animated.View>

          {loading ? (
            <Animated.View entering={FadeInDown.delay(400)} style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading albums...</Text>
            </Animated.View>
          ) : (
            <View style={styles.albumGrid}>
              {albums.map((album, index) => (
                <AnimatedAlbumCard
                  key={album.id}
                  album={album}
                  onPress={() => handleAlbumPress(album)}
                  index={index}
                />
              ))}
            </View>
          )}
        </View>

        <Animated.View entering={FadeInUp.delay(500)} style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <InfoIcon 
              message="This shows your recent AI sorting sessions and auto-sort activity. Premium users get automatic background organization."
              title="Activity Feed"
            />
          </View>
          <View style={styles.activityCard}>
            <Wand2 size={20} color={lightTheme.colors.primary} />
            <Text style={styles.activityText}>
              {userFlags.isSubscribed 
                ? 'Auto-sort is keeping your photos organized in the background!'
                : 'Try the Picture Hack feature above to sort your photos with AI!'
              }
            </Text>
          </View>
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
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: lightTheme.spacing.lg,
    paddingTop: lightTheme.spacing.lg,
    paddingBottom: lightTheme.spacing.md,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    marginTop: lightTheme.spacing.xs,
  },
  autoSortStatus: {
    paddingHorizontal: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.md,
  },
  autoSortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${lightTheme.colors.primary}15`,
    borderRadius: lightTheme.borderRadius.md,
    padding: lightTheme.spacing.md,
    gap: lightTheme.spacing.sm,
  },
  autoSortText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.primary,
  },
  section: {
    paddingHorizontal: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.lg,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  newSortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.md,
    paddingVertical: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.lg,
    gap: lightTheme.spacing.xs,
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
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
    padding: lightTheme.spacing.lg,
    borderRadius: lightTheme.borderRadius.lg,
    gap: lightTheme.spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  activityText: {
    flex: 1,
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});