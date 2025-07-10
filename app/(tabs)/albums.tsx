import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
  Platform,
  InteractionManager,
  LayoutAnimation,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  FadeInDown,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { ResponsiveAlbumGrid } from '../../components/ResponsiveAlbumGrid';
import { AlbumViewModeSelector } from '../../components/AlbumViewModeSelector';
import { lightTheme } from '../../utils/theme';
import { Album } from '../../types';
import { AlbumViewMode } from '../../types/display';

const { width: screenWidth } = Dimensions.get('window');

interface AlbumsScreenState {
  isRefreshing: boolean;
  searchQuery: string;
  sortBy: 'name' | 'date' | 'count';
  sortOrder: 'asc' | 'desc';
  retryCount: number;
  hasError: boolean;
  errorMessage: string;
  viewMode: AlbumViewMode;
  showViewModeSelector: boolean;
  isInitialLoad: boolean;
  showLocked: boolean;
  showNsfwContent: boolean;
}

export default function AlbumsScreen() {
  const { 
    albums, 
    isLoadingAlbums, 
    refreshAlbums, 
    userFlags, 
    settings,
    albumsError 
  } = useApp();

  const [state, setState] = useState<AlbumsScreenState>({
    isRefreshing: false,
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',
    retryCount: 0,
    hasError: false,
    errorMessage: '',
    viewMode: 'grid-2',
    showViewModeSelector: false,
    isInitialLoad: true,
    showLocked: true,
    showNsfwContent: false,
  });

  // Performance refs
  const lastRefreshTime = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  // Animated values
  const headerOpacity = useSharedValue(1);
  const contentTranslateY = useSharedValue(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Filter and process albums
  const processedAlbums = useMemo(() => {
    if (!albums || albums.length === 0) return [];
    
    let filtered = [...albums];

    // Filter out moderated albums unless explicitly showing NSFW content
    if (!settings.showModeratedContent) {
      filtered = filtered.filter(album => !album.isModeratedAlbum);
    }

    // Apply search filter
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (album) =>
          album.name.toLowerCase().includes(query) ||
          album.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Filter locked albums if needed
    if (!state.showLocked) {
      filtered = filtered.filter(album => !album.isLocked);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (state.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = (a.createdAt || 0) - (b.createdAt || 0);
          break;
        case 'count':
          comparison = (a.count || 0) - (b.count || 0);
          break;
        default:
          comparison = 0;
      }

      return state.sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [albums, state.searchQuery, state.sortBy, state.sortOrder, state.showLocked, settings.showModeratedContent]);

  // Enhanced refresh function
  const handleRefresh = useCallback(async (force: boolean = false) => {
    if (refreshPromiseRef.current && !force) {
      return refreshPromiseRef.current;
    }

    if (state.isRefreshing && !force) return;

    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;

    if (!force && timeSinceLastRefresh < 15000) {
      console.log('🚫 Refresh blocked - too soon since last refresh');
      return;
    }

    const refreshPromise = (async () => {
      try {
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isRefreshing: true,
            hasError: false,
            errorMessage: '',
            isInitialLoad: false,
          }));

          contentTranslateY.value = withSpring(-10, { damping: 15 });
        }

        console.log('🔄 Refreshing albums...');

        await InteractionManager.runAfterInteractions(() => {
          return refreshAlbums();
        });

        if (isMountedRef.current) {
          lastRefreshTime.current = now;

          setState((prev) => ({
            ...prev,
            isRefreshing: false,
            retryCount: 0,
            hasError: false,
            errorMessage: '',
          }));

          contentTranslateY.value = withSpring(0, { damping: 15 });
        }

        console.log('✅ Albums refreshed successfully');
      } catch (error) {
        console.error('❌ Error refreshing albums:', error);

        if (isMountedRef.current) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Failed to refresh albums';

          setState((prev) => ({
            ...prev,
            isRefreshing: false,
            hasError: true,
            errorMessage,
            retryCount: prev.retryCount + 1,
          }));

          contentTranslateY.value = withSpring(0, { damping: 15 });
        }
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [refreshAlbums, state.isRefreshing, contentTranslateY]);

  // Focus effect for refreshing
  useFocusEffect(
    useCallback(() => {
      if (!state.isRefreshing && state.isInitialLoad) {
        handleRefresh();
      }
    }, [handleRefresh, state.isRefreshing, state.isInitialLoad])
  );

  const handleAlbumPress = useCallback(
    (album: Album) => {
      try {
        if (album.isLocked && !userFlags.hasPurchasedCredits) {
          Alert.alert(
            'Premium Feature',
            'This album is locked. Purchase credits to access premium features.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Buy Credits', onPress: () => router.push('/settings') },
            ]
          );
          return;
        }

        headerOpacity.value = withTiming(0.5, { duration: 200 });
        router.push(`/album/${album.id}`);
      } catch (error) {
        console.error('Error navigating to album:', error);
        Alert.alert('Error', 'Failed to open album. Please try again.');
      }
    },
    [headerOpacity, userFlags.hasPurchasedCredits]
  );

  const handleRetry = useCallback(() => {
    setState((prev) => ({ ...prev, retryCount: 0 }));
    handleRefresh(true);
  }, [handleRefresh]);

  const toggleViewModeSelector = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState((prev) => ({
      ...prev,
      showViewModeSelector: !prev.showViewModeSelector,
    }));
  }, []);

  const handleViewModeChange = useCallback((viewMode: AlbumViewMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState((prev) => ({ ...prev, viewMode }));
  }, []);

  const toggleShowLocked = useCallback(() => {
    setState((prev) => ({ ...prev, showLocked: !prev.showLocked }));
  }, []);

  const handleNewSort = useCallback(() => {
    router.push('/new-sort');
  }, []);

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // Render functions
  const renderErrorState = useCallback(
    () => (
      <View style={styles.errorContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <Ionicons name="alert-circle" size={48} color={lightTheme.colors.error} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{state.errorMessage || albumsError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    ),
    [state.errorMessage, albumsError, handleRetry]
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <Ionicons name="folder-open" size={64} color={lightTheme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>
            {state.searchQuery ? 'No matching albums' : 'No Albums Yet'}
          </Text>
          <Text style={styles.emptyText}>
            {state.searchQuery
              ? `No albums match "${state.searchQuery}".`
              : 'Create your first smart album by using the AI sorting feature.'}
          </Text>
          {!state.searchQuery && (
            <TouchableOpacity style={styles.createButton} onPress={handleNewSort}>
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.createButtonText}>Create Album</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    ),
    [state.searchQuery, handleNewSort]
  );

  const renderLoadingState = useCallback(
    () => (
      <View style={styles.loadingContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <Text style={styles.loadingText}>
            {state.isInitialLoad ? 'Loading your albums...' : 'Refreshing albums...'}
          </Text>
        </Animated.View>
      </View>
    ),
    [state.isInitialLoad]
  );

  const renderAlbumGrid = useCallback(
    () => (
      <Animated.View style={contentAnimatedStyle}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <ResponsiveAlbumGrid
            albums={processedAlbums}
            viewMode={state.viewMode}
            onAlbumPress={handleAlbumPress}
            showLocked={state.showLocked}
          />
        </Animated.View>
      </Animated.View>
    ),
    [processedAlbums, state.viewMode, handleAlbumPress, state.showLocked, contentAnimatedStyle]
  );

  const renderContent = () => {
    if (state.hasError || albumsError) {
      return renderErrorState();
    }

    if (isLoadingAlbums && !albums?.length) {
      return renderLoadingState();
    }

    if (processedAlbums.length === 0 && !isLoadingAlbums && !state.isRefreshing) {
      return renderEmptyState();
    }

    return renderAlbumGrid();
  };

  const renderHeader = () => (
    <Animated.View style={[styles.header, headerAnimatedStyle]}>
      <Animated.View entering={FadeInUp.delay(100)}>
        <View style={styles.headerLeft}>
          <Ionicons name="folder-open" size={24} color={lightTheme.colors.primary} />
          <Text style={styles.title}>Albums</Text>
          {state.isRefreshing && (
            <View style={styles.refreshIndicator}>
              <Text style={styles.refreshText}>Updating...</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              !state.showLocked && styles.filterButtonActive,
            ]}
            onPress={toggleShowLocked}
            disabled={state.isRefreshing}
            accessibilityLabel="Toggle locked albums visibility"
            accessibilityRole="button"
          >
            <Ionicons
              name={state.showLocked ? "lock-open" : "lock-closed"}
              size={18}
              color={
                state.showLocked
                  ? lightTheme.colors.textSecondary
                  : lightTheme.colors.primary
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              state.showViewModeSelector && styles.filterButtonActive,
            ]}
            onPress={toggleViewModeSelector}
            disabled={state.isRefreshing}
            accessibilityLabel="Change view mode"
            accessibilityRole="button"
          >
            <MaterialIcons
              name="view-module"
              size={20}
              color={
                state.showViewModeSelector
                  ? lightTheme.colors.primary
                  : lightTheme.colors.textSecondary
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newSortButton}
            onPress={handleNewSort}
            disabled={state.isRefreshing}
            accessibilityLabel="Create new album"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );

  const renderViewModeSelector = () => {
    if (!state.showViewModeSelector) return null;

    return (
      <View style={styles.viewModeSelectorContainer}>
        <Animated.View entering={FadeInDown.delay(100)}>
          <AlbumViewModeSelector
            currentMode={state.viewMode}
            onModeChange={handleViewModeChange}
          />
        </Animated.View>
      </View>
    );
  };

  const renderFooter = () => (
    <View style={styles.footer}>
      <Animated.View entering={FadeInDown.delay(300)}>
        <Text style={styles.footerText}>
          {state.showLocked
            ? `Showing ${processedAlbums.length} albums (including locked)`
            : `Showing ${processedAlbums.length} unlocked albums`}
        </Text>
        {state.searchQuery && (
          <Text style={styles.footerSearchText}>
            Search: "{state.searchQuery}"
          </Text>
        )}
        {albums && albums.length > 0 && (
          <Text style={styles.footerStatsText}>
            Total: {albums.length} albums •{' '}
            {albums.reduce((sum, album) => sum + (album.count || 0), 0)} photos
          </Text>
        )}
      </Animated.View>
    </View>
  );

  // Reset header opacity when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = withTiming(1, { duration: 300 });
    }, [headerOpacity])
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderViewModeSelector()}

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.isRefreshing}
            onRefresh={() => handleRefresh(true)}
            tintColor={lightTheme.colors.primary}
            title="Pull to refresh"
            titleColor={lightTheme.colors.textSecondary}
            progressBackgroundColor={lightTheme.colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
        accessible={true}
        accessibilityLabel="Albums list"
      >
        {renderContent()}
        {renderFooter()}
      </Animated.ScrollView>
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
    backgroundColor: lightTheme.colors.background,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    letterSpacing: -0.5,
  },
  refreshIndicator: {
    marginLeft: lightTheme.spacing.sm,
  },
  refreshText: {
    fontSize: 12,
    color: lightTheme.colors.primary,
    fontFamily: 'Inter-Medium',
  },
  headerActions: {
    flexDirection: 'row',
    gap: lightTheme.spacing.sm,
    alignItems: 'center',
  },
  filterButton: {
    padding: lightTheme.spacing.sm,
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  filterButtonActive: {
    backgroundColor: lightTheme.colors.primary + '20',
    borderWidth: 1,
    borderColor: lightTheme.colors.primary + '40',
  },
  newSortButton: {
    backgroundColor: lightTheme.colors.primary,
    padding: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  viewModeSelectorContainer: {
    backgroundColor: lightTheme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.colors.border,
    paddingVertical: lightTheme.spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: lightTheme.spacing.lg,
    paddingBottom: lightTheme.spacing.xl,
  },
  loadingContainer: {
    paddingVertical: lightTheme.spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  errorContainer: {
    paddingVertical: lightTheme.spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingHorizontal: lightTheme.spacing.lg,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginTop: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: lightTheme.spacing.lg,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    minWidth: 120,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  emptyContainer: {
    paddingVertical: lightTheme.spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
    paddingHorizontal: lightTheme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginTop: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: lightTheme.spacing.xl,
    lineHeight: 24,
    maxWidth: 280,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.lg,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    gap: lightTheme.spacing.sm,
    elevation: 3,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  footer: {
    paddingVertical: lightTheme.spacing.xl,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: lightTheme.colors.border,
    marginTop: lightTheme.spacing.lg,
  },
  footerText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  footerSearchText: {
    fontSize: 12,
    color: lightTheme.colors.primary,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginTop: lightTheme.spacing.xs,
  },
  footerNsfwText: {
    fontSize: 12,
    color: lightTheme.colors.warning,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginTop: lightTheme.spacing.xs,
    opacity: 0.8,
  },
  footerStatsText: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: lightTheme.spacing.xs,
    opacity: 0.7,
  },
});