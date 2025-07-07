import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
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

// Performance constants
const REFRESH_COOLDOWN = 15 * 1000; // Reduced to 15 seconds
const STALE_DATA_THRESHOLD = 3 * 60 * 1000; // Reduced to 3 minutes
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;
const DEBOUNCE_DELAY = 300;

interface AlbumsScreenState {
  showLocked: boolean;
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
}

interface CacheEntry {
  data: Album[];
  timestamp: number;
  query: string;
}

const albumCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function AlbumsScreen() {
  const { albums, isLoadingAlbums, refreshAlbums } = useApp();

  const [state, setState] = useState<AlbumsScreenState>({
    showLocked: true,
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
  });

  // Performance refs
  const lastRefreshTime = useRef<number>(0);
  const lastDataFetchTime = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  // Animated values for smooth transitions
  const headerOpacity = useSharedValue(1);
  const contentTranslateY = useSharedValue(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Cache key generator
  const getCacheKey = useCallback(
    (query: string, sortBy: string, sortOrder: string, showLocked: boolean) => {
      return `${query}-${sortBy}-${sortOrder}-${showLocked}`;
    },
    []
  );

  // Debounced search
  const debouncedSearch = useCallback((query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, searchQuery: query }));
    }, DEBOUNCE_DELAY);
  }, []);

  // Memoized filtered and sorted albums with caching
  const processedAlbums = useMemo(() => {
    if (!albums || albums.length === 0) return [];

    const cacheKey = getCacheKey(
      state.searchQuery,
      state.sortBy,
      state.sortOrder,
      state.showLocked
    );
    const cached = albumCache.get(cacheKey);

    // Return cached result if valid
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    let filtered = albums;

    // Apply locked filter
    if (!state.showLocked) {
      filtered = filtered.filter((album) => !album.isLocked);
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

    // Cache the result
    albumCache.set(cacheKey, {
      data: sorted,
      timestamp: Date.now(),
      query: cacheKey,
    });

    return sorted;
  }, [
    albums,
    state.showLocked,
    state.searchQuery,
    state.sortBy,
    state.sortOrder,
    getCacheKey,
  ]);

  // Enhanced refresh function with promise deduplication
  const handleRefresh = useCallback(
    async (isRetry: boolean = false, force: boolean = false) => {
      // Prevent concurrent refreshes
      if (refreshPromiseRef.current && !force) {
        return refreshPromiseRef.current;
      }

      if (state.isRefreshing && !isRetry && !force) return;

      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime.current;

      // Prevent too frequent refreshes unless forced
      if (!isRetry && !force && timeSinceLastRefresh < REFRESH_COOLDOWN) {
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

            // Animate content during refresh
            contentTranslateY.value = withSpring(-10, { damping: 15 });
          }

          console.log('🔄 Refreshing albums...');

          // Use InteractionManager for better performance
          await new Promise((resolve) => {
            InteractionManager.runAfterInteractions(() => {
              resolve(refreshAlbums());
            });
          });

          if (isMountedRef.current) {
            lastRefreshTime.current = now;
            lastDataFetchTime.current = now;

            // Clear cache on successful refresh
            albumCache.clear();

            setState((prev) => ({
              ...prev,
              isRefreshing: false,
              retryCount: 0,
              hasError: false,
              errorMessage: '',
            }));

            // Reset animation
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
            const newRetryCount = state.retryCount + 1;

            setState((prev) => ({
              ...prev,
              isRefreshing: false,
              hasError: true,
              errorMessage,
              retryCount: newRetryCount,
            }));

            // Reset animation
            contentTranslateY.value = withSpring(0, { damping: 15 });

            // Auto-retry with exponential backoff
            if (newRetryCount < MAX_RETRY_ATTEMPTS) {
              console.log(
                `🔄 Auto-retrying in ${RETRY_DELAY * newRetryCount}ms`
              );
              retryTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                  handleRefresh(true);
                }
              }, RETRY_DELAY * newRetryCount);
            }
          }
        } finally {
          refreshPromiseRef.current = null;
        }
      })();

      refreshPromiseRef.current = refreshPromise;
      return refreshPromise;
    },
    [refreshAlbums, state.isRefreshing, state.retryCount, contentTranslateY]
  );

  // Smart focus effect with improved logic
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime.current;
      const timeSinceLastFetch = now - lastDataFetchTime.current;

      const shouldRefresh =
        // No albums and not currently loading
        ((!albums || albums.length === 0) && !isLoadingAlbums) ||
        // Data is stale and enough time has passed
        (timeSinceLastFetch > STALE_DATA_THRESHOLD &&
          timeSinceLastRefresh > REFRESH_COOLDOWN) ||
        // Has error and retries available
        (state.hasError && state.retryCount < MAX_RETRY_ATTEMPTS) ||
        // Initial load
        (state.isInitialLoad && !isLoadingAlbums);

      if (shouldRefresh && !state.isRefreshing) {
        console.log('🔄 Refreshing albums on focus');
        handleRefresh();
      }
    }, [
      albums,
      handleRefresh,
      isLoadingAlbums,
      state.isRefreshing,
      state.hasError,
      state.retryCount,
      state.isInitialLoad,
    ])
  );

  // Optimized event handlers
  const handleAlbumPress = useCallback(
    (album: Album) => {
      try {
        if (album.isLocked) {
          Alert.alert(
            'Premium Feature',
            'This album is locked. Upgrade to SnapSort Pro to access all albums.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Upgrade', onPress: () => router.push('/settings') },
            ]
          );
          return;
        }

        // Animate before navigation
        headerOpacity.value = withTiming(0.5, { duration: 200 });

        router.push(`/album/${album.id}`);
      } catch (error) {
        console.error('Error navigating to album:', error);
        Alert.alert('Error', 'Failed to open album. Please try again.');
      }
    },
    [headerOpacity]
  );

  const handleToggleShowLocked = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState((prev) => ({ ...prev, showLocked: !prev.showLocked }));
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      debouncedSearch(query);
    },
    [debouncedSearch]
  );

  const handleSortChange = useCallback((sortBy: 'name' | 'date' | 'count') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState((prev) => ({
      ...prev,
      sortBy,
      sortOrder:
        prev.sortBy === sortBy && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const handleRetry = useCallback(() => {
    setState((prev) => ({ ...prev, retryCount: 0 }));
    handleRefresh(true, true);
  }, [handleRefresh]);

  const handleCreateAlbum = useCallback(() => {
    try {
      router.push('/new-sort');
    } catch (error) {
      console.error('Error navigating to new sort:', error);
      Alert.alert('Error', 'Failed to open album creation. Please try again.');
    }
  }, []);

  const handleViewModeChange = useCallback((viewMode: AlbumViewMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState((prev) => ({ ...prev, viewMode }));
  }, []);

  const toggleViewModeSelector = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState((prev) => ({
      ...prev,
      showViewModeSelector: !prev.showViewModeSelector,
    }));
  }, []);

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // Render functions with performance optimizations
  const renderErrorState = useCallback(
    () => (
      <View style={styles.errorContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
        <Ionicons name="alert-circle" size={48} color={lightTheme.colors.error} />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{state.errorMessage}</Text>
        <View style={styles.errorActions}>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          {state.retryCount > 0 && (
            <Text style={styles.retryCountText}>
              Attempt {state.retryCount}/{MAX_RETRY_ATTEMPTS}
            </Text>
          )}
        </View>
        </Animated.View>
        </Animated.View>
      </View>
    ),
    [state.errorMessage, state.retryCount, handleRetry]
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
        <Ionicons name="grid" size={64} color={lightTheme.colors.textSecondary} />
        <Text style={styles.emptyTitle}>
          {state.searchQuery ? 'No matching albums' : 'No Albums Yet'}
        </Text>
        <Text style={styles.emptyText}>
          {state.searchQuery
            ? `No albums match "${state.searchQuery}". Try a different search term.`
            : 'Use the Picture Hack feature to create your first smart album!'}
        </Text>
        {!state.searchQuery && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateAlbum}
          >
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.createButtonText}>Create Album</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [state.searchQuery, handleCreateAlbum]
  );

  const renderLoadingState = useCallback(
    () => (
      <View style={styles.loadingContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
        <Text style={styles.loadingText}>
          {state.retryCount > 0
            ? `Retrying... (${state.retryCount}/${MAX_RETRY_ATTEMPTS})`
            : state.isInitialLoad
            ? 'Loading your albums...'
            : 'Refreshing albums...'}
        </Text>
        </Animated.View>
      </View>
    ),
    [state.retryCount, state.isInitialLoad]
  );

  const renderAlbumGrid = useCallback(
    () => (
      <View style={contentAnimatedStyle}>
        <Animated.View entering={FadeInUp.delay(200)}>
        <ResponsiveAlbumGrid
          albums={processedAlbums}
          viewMode={state.viewMode}
          onAlbumPress={handleAlbumPress}
          showLocked={state.showLocked}
        />
        </Animated.View>
      </View>
    ),
    [
      processedAlbums,
      state.viewMode,
      handleAlbumPress,
      state.showLocked,
      contentAnimatedStyle,
    ]
  );

  const renderContent = () => {
    if (state.hasError && state.retryCount >= MAX_RETRY_ATTEMPTS) {
      return renderErrorState();
    }

    if (isLoadingAlbums && !albums?.length) {
      return renderLoadingState();
    }

    if (
      processedAlbums.length === 0 &&
      !isLoadingAlbums &&
      !state.isRefreshing
    ) {
      return renderEmptyState();
    }

    return renderAlbumGrid();
  };

  const renderHeader = () => (
    <View style={[styles.header, headerAnimatedStyle]}>
      <Animated.View entering={FadeInUp.delay(100)}>
      <View style={styles.headerLeft}>
        <Ionicons name="grid" size={24} color={lightTheme.colors.primary} />
        <Text style={styles.title}>All Albums</Text>
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
          style={[
            styles.filterButton,
            state.showLocked && styles.filterButtonActive,
          ]}
          onPress={handleToggleShowLocked}
          disabled={state.isRefreshing}
          accessibilityLabel={
            state.showLocked ? 'Hide locked albums' : 'Show locked albums'
          }
          accessibilityRole="button"
        >
          <Ionicons
            name="filter"
            size={20}
            color={
              state.showLocked
                ? lightTheme.colors.primary
                : lightTheme.colors.textSecondary
            }
          />
        </TouchableOpacity>
      </View>
      </Animated.View>
    </View>
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
            onRefresh={() => handleRefresh(false, true)}
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
  errorActions: {
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  retryButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    minWidth: 120,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: lightTheme.colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  retryCountText: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
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
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
    minWidth: 160,
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: lightTheme.colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
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
  footerStatsText: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: lightTheme.spacing.xs,
    opacity: 0.7,
  },
});
