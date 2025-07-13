import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';

import { ResponsiveAlbumGrid } from '../../components/ResponsiveAlbumGrid';
import { PictureHackBar } from '../../components/PictureHackBar';
import { InfoIcon } from '../../components/InfoIcon';
import { AlbumViewModeSelector } from '../../components/AlbumViewModeSelector';
import { AutoSortManager } from '../../utils/autoSortManager';
import { getCurrentTheme } from '../../utils/theme';
import { Album } from '../../types';
import { AlbumViewMode } from '../../types/display';

type AutoSortStatus = 'idle' | 'running' | 'completed' | 'error';

export default function HomeScreen() {
  const { 
    albums, 
    isLoadingAlbums, 
    userFlags, 
    settings, 
    refreshAlbums 
  } = useApp();

  const theme = getCurrentTheme();
  const [autoSortStatus, setAutoSortStatus] = useState<AutoSortStatus>('idle');
  const [viewMode, setViewMode] = useState<AlbumViewMode>('grid-2');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize styles to prevent recreation
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Filter albums based on settings
  const filteredAlbums = useMemo(() => {
    if (!albums) return [];
    
    return albums.slice(0, 6).filter(album => {
      // Hide moderated albums unless both toggles are enabled
      if (album.isModeratedAlbum) {
        return settings.showModeratedContent && settings.showModeratedInMainAlbums;
      }
      // Always show non-moderated albums
      return true;
    });
  }, [albums, settings.showModeratedContent, settings.showModeratedInMainAlbums]);

  const scheduleAutoSort = useCallback(async () => {
    if (autoSortStatus === 'running') return;

    // Debounce auto-sort to prevent too frequent runs
    const debounceDelay = 5000; // 5 seconds
    
    setTimeout(async () => {
      if (AutoSortManager.canRunAutoSort(userFlags)) {
        setAutoSortStatus('running');
        setError(null);
        
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
            setAutoSortStatus('error');
            setError('Auto-sort failed. Please try again later.');
            setTimeout(() => {
              setAutoSortStatus('idle');
              setError(null);
            }, 5000);
          }
        } catch (error: any) {
          console.error('Auto-sort error:', error);
          setAutoSortStatus('error');
          setError(error.message || 'Auto-sort encountered an error.');
          setTimeout(() => {
            setAutoSortStatus('idle');
            setError(null);
          }, 5000);
        }
      }
    }, debounceDelay);
  }, [autoSortStatus, userFlags, refreshAlbums]);

  const handlePictureHack = useCallback((prompt: string) => {
    try {
      if (!prompt.trim()) {
        Alert.alert('Invalid Input', 'Please enter a search prompt.');
        return;
      }

      router.push({
        pathname: '/new-sort',
        params: { prompt: prompt.trim() }
      });
    } catch (error: any) {
      console.error('Navigation error:', error);
      Alert.alert('Navigation Error', 'Failed to navigate to new sort. Please try again.');
    }
  }, []);

  const handleAlbumPress = useCallback((album: Album) => {
    try {
      if (!album?.id) {
        Alert.alert('Error', 'Invalid album selected.');
        return;
      }

      router.push(`/album/${album.id}`);
    } catch (error: any) {
      console.error('Album navigation error:', error);
      Alert.alert('Navigation Error', 'Failed to open album. Please try again.');
    }
  }, []);

  const handleNewSort = useCallback(() => {
    try {
      router.push('/new-sort');
    } catch (error: any) {
      console.error('New sort navigation error:', error);
      Alert.alert('Navigation Error', 'Failed to navigate to new sort. Please try again.');
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    
    try {
      await refreshAlbums();
    } catch (error: any) {
      console.error('Refresh error:', error);
      setError('Failed to refresh albums. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshAlbums]);

  const handleViewModeChange = useCallback((mode: AlbumViewMode) => {
    setViewMode(mode);
  }, []);

  const getAutoSortStatusText = useCallback(() => {
    switch (autoSortStatus) {
      case 'running':
        return 'Auto-sorting new photos...';
      case 'completed':
        return 'Auto-sort completed!';
      case 'error':
        return 'Auto-sort failed. Please try again.';
      default:
        return '';
    }
  }, [autoSortStatus]);

  const getAutoSortIcon = useCallback(() => {
    switch (autoSortStatus) {
      case 'running':
        return <Ionicons name="flash" size={16} color={theme.colors.primary} />;
      case 'completed':
        return <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />;
      case 'error':
        return <Ionicons name="alert-circle" size={16} color={theme.colors.error} />;
      default:
        return null;
    }
  }, [autoSortStatus, theme.colors]);

  const getAutoSortStatusColor = useCallback(() => {
    switch (autoSortStatus) {
      case 'running':
        return theme.colors.primary;
      case 'completed':
        return theme.colors.success;
      case 'error':
        return theme.colors.error;
      default:
        return theme.colors.primary;
    }
  }, [autoSortStatus, theme.colors]);

  // Auto-trigger auto-sort when component mounts if enabled
  useEffect(() => {
    if (userFlags.hasPurchasedCredits && settings.autoSort && autoSortStatus === 'idle') {
      scheduleAutoSort();
    }
  }, [userFlags.hasPurchasedCredits, settings.autoSort, scheduleAutoSort, autoSortStatus]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
          <Text style={styles.title}>SnapSort</Text>
          <Text style={styles.subtitle}>Your AI-powered photo organization companion</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200)}>
          <PictureHackBar 
            onSubmit={handlePictureHack}
            disabled={isLoadingAlbums || isRefreshing}
          />
        </Animated.View>

        {/* Auto-Sort Status */}
        {userFlags.hasPurchasedCredits && settings.autoSort && autoSortStatus !== 'idle' && (
          <Animated.View entering={FadeInUp.delay(250)} style={styles.autoSortStatus}>
            <View style={[
              styles.autoSortContainer,
              { backgroundColor: `${getAutoSortStatusColor()}15` }
            ]}>
              {getAutoSortIcon()}
              <Text style={[
                styles.autoSortText,
                { color: getAutoSortStatusColor() }
              ]}>
                {getAutoSortStatusText()}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Error Display */}
        {error && (
          <Animated.View entering={FadeInUp.delay(300)} style={styles.errorContainer}>
            <View style={styles.errorContent}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity 
                onPress={() => setError(null)}
                style={styles.errorDismiss}
              >
                <Ionicons name="close" size={16} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <View style={styles.section}>
          <Animated.View entering={FadeInUp.delay(300)} style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="trending-up" size={20} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>Smart Albums</Text>
              {userFlags.hasPurchasedCredits && settings.autoSort && (
                <InfoIcon 
                  message="Auto-sort is enabled! New photos will be automatically organized into these albums based on AI analysis."
                  title="Auto-Sort Active"
                  color={theme.colors.success}
                />
              )}
            </View>
            <TouchableOpacity 
              style={styles.newSortButton} 
              onPress={handleNewSort}
              disabled={isLoadingAlbums || isRefreshing}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.newSortButtonText}>New Sort</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* View Mode Selector */}
          <Animated.View entering={FadeInUp.delay(350)}>
            <AlbumViewModeSelector
              currentMode={viewMode}
              onModeChange={handleViewModeChange}
              disabled={isLoadingAlbums || isRefreshing}
            />
          </Animated.View>

          {/* Albums Grid */}
          <Animated.View entering={FadeInDown.delay(400)}>
            <ResponsiveAlbumGrid
              albums={filteredAlbums}
              viewMode={viewMode}
              onAlbumPress={handleAlbumPress}
              showLocked={false}
              loading={isLoadingAlbums}
              error={error}
              emptyMessage="No albums found. Create your first album by using the Picture Hack feature above!"
              onRetry={handleRefresh}
            />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(500)} style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <MaterialIcons name="timeline" size={20} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <InfoIcon 
              message="This shows your recent AI sorting sessions and auto-sort activity. Premium users get automatic background organization."
              title="Activity Feed"
            />
          </View>
          <View style={styles.activityCard}>
            <MaterialIcons name="auto-fix-high" size={20} color={theme.colors.primary} />
            <Text style={styles.activityText}>
              {userFlags.hasPurchasedCredits 
                ? 'Auto-sort is keeping your photos organized in the background!'
                : 'Try the Picture Hack feature above to sort your photos with AI!'
              }
            </Text>
          </View>
        </Animated.View>

        {/* Bottom spacing for better scroll experience */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    lineHeight: 22,
  },
  autoSortStatus: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  autoSortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  autoSortText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
  errorContainer: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${theme.colors.error}15`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.error,
    flex: 1,
  },
  errorDismiss: {
    padding: theme.spacing.xs,
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  newSortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.xs,
    elevation: 2,
    shadowColor: theme.colors.primary,
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
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activityText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  bottomSpacing: {
    height: theme.spacing.xl,
  },
});
