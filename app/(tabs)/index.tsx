import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { AnimatedAlbumCard } from '../../components/AnimatedAlbumCard';
import { ResponsiveAlbumGrid } from '../../components/ResponsiveAlbumGrid';
import { PictureHackBar } from '../../components/PictureHackBar';
import { InfoIcon } from '../../components/InfoIcon';
import { AutoSortManager } from '../../utils/autoSortManager';
import { lightTheme } from '../../utils/theme';
import { Album } from '../../types';

type AutoSortStatus = 'idle' | 'running' | 'completed';

export default function HomeScreen() {
  const { 
    albums, 
    isLoadingAlbums, 
    userFlags, 
    settings, 
    refreshAlbums 
  } = useApp();

  const [autoSortStatus, setAutoSortStatus] = useState<AutoSortStatus>('idle');

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
            await refreshAlbums();
            
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
                <Ionicons name="flash" size={16} color={lightTheme.colors.primary} />
              ) : (
                <Ionicons name="time" size={16} color={lightTheme.colors.success} />
              )}
              <Text style={styles.autoSortText}>{getAutoSortStatusText()}</Text>
            </View>
          </Animated.View>
        )}

        <View style={styles.section}>
          <Animated.View entering={FadeInUp.delay(300)} style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="trending-up" size={20} color={lightTheme.colors.primary} />
              <Text style={styles.sectionTitle}>Smart Albums</Text>
              {userFlags.hasPurchasedCredits && settings.autoSort && (
                <InfoIcon 
                  message="Auto-sort is enabled! New photos will be automatically organized into these albums based on AI analysis."
                  title="Auto-Sort Active"
                  color={lightTheme.colors.success}
                />
              )}
            </View>
            <TouchableOpacity style={styles.newSortButton} onPress={handleNewSort}>
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.newSortButtonText}>New Sort</Text>
            </TouchableOpacity>
          </Animated.View>

          {isLoadingAlbums ? (
            <Animated.View entering={FadeInDown.delay(400)} style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading albums...</Text>
            </Animated.View>
          ) : (
            <ResponsiveAlbumGrid
              albums={albums.slice(0, 6)}
              viewMode="grid-2"
              onAlbumPress={handleAlbumPress}
              showLocked={true}
            />
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
            <MaterialIcons name="auto-fix-high" size={20} color={lightTheme.colors.primary} />
            <Text style={styles.activityText}>
              {userFlags.hasPurchasedCredits 
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
