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
  LayoutAnimation
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { ResponsiveAlbumGrid } from '../../components/ResponsiveAlbumGrid';
import { AlbumViewModeSelector } from '../../components/AlbumViewModeSelector';
import { lightTheme } from '../../utils/theme';
import { Album } from '../../types';
import { AlbumViewMode } from '../../types/display';
import { NsfwAlbumNaming } from '../../utils/moderation/nsfwAlbumNaming';
import { getCurrentTheme } from '../../utils/theme';

const { width: screenWidth } = Dimensions.get('window');

interface NsfwAlbumsScreenState {
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
  hasAcceptedWarning: boolean;
}

export default function NsfwAlbumsScreen() {
  
  const { albums, isLoadingAlbums, refreshAlbums, userFlags, settings } = useApp();
  const theme = getCurrentTheme();

  const [state, setState] = useState<NsfwAlbumsScreenState>({
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
    hasAcceptedWarning: false,
  });

  // Performance refs
  const lastRefreshTime = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  // Animated values
  const headerOpacity = useSharedValue(1);
  const contentTranslateY = useSharedValue(0);

  // Create styles with current theme - MOVE THIS HERE
  const styles = createStyles(theme);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Filter to only show moderated albums
  const moderatedAlbums = useMemo(() => {
    if (!albums || albums.length === 0) return [];
    
    let filtered = albums.filter(album => album.isModeratedAlbum);

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

    // Enhance with category information
    return sorted.map(album => {
      const categoryTag = album.tags?.find(tag => 
        NsfwAlbumNaming.getAllCategories().some(cat => cat.id === tag)
      );
      
      const categoryInfo = categoryTag ? 
        NsfwAlbumNaming.getCategoryById(categoryTag) : null;

      return {
        ...album,
        categoryInfo,
        displayIcon: categoryInfo?.icon || '🚫',
      };
    });
  }, [albums, state.searchQuery, state.sortBy, state.sortOrder]);

  // Enhanced refresh function
  const handleRefresh = useCallback(async (force: boolean = false) => {
    if (refreshPromiseRef.current && !force) {
      console.log('🚫 Refresh blocked - another refresh in progress');
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

        console.log('🔄 Refreshing NSFW albums...');

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

        console.log('✅ NSFW albums refreshed successfully');
      } catch (error) {
        console.error('❌ Error refreshing NSFW albums:', error);

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

  const handleAlbumPress = useCallback(
    (album: Album) => {
      try {
        headerOpacity.value = withTiming(0.5, { duration: 200 });
        router.push(`/album/${album.id}`);
      } catch (error) {
        console.error('Error navigating to album:', error);
        Alert.alert('Error', 'Failed to open album. Please try again.');
      }
    },
    [headerOpacity]
  );

  const handleAcceptWarning = useCallback(() => {
    setState(prev => ({ ...prev, hasAcceptedWarning: true }));
  }, []);

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

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // Focus effect for refreshing
  useFocusEffect(
    useCallback(() => {
      if (!state.isRefreshing && state.isInitialLoad) {
        handleRefresh();
      }
    }, [handleRefresh, state.isRefreshing, state.isInitialLoad])
  );

  // Reset header opacity when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = withTiming(1, { duration: 300 });
    }, [headerOpacity])
  );

  // ✅ RENDER FUNCTIONS - DEFINED AFTER ALL HOOKS
  const renderErrorState = useCallback(
    () => (
      <View style={styles.errorContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{state.errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    ),
    [state.errorMessage, handleRetry]
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <Ionicons name="eye-off" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>
            {state.searchQuery ? 'No matching albums' : 'No Moderated Content'}
          </Text>
          <Text style={styles.emptyText}>
            {state.searchQuery
              ? `No moderated albums match "${state.searchQuery}".`
              : 'No content has been flagged for moderation yet. When content is scanned, it will be automatically categorized into intelligent albums based on the type of content detected.'}
          </Text>
          
          {/* Show available categories */}
          {!state.searchQuery && (
            <View style={styles.categoriesPreview}>
              <Text style={styles.categoriesTitle}>Content will be organized into categories like:</Text>
              <View style={styles.categoriesGrid}>
                {NsfwAlbumNaming.getAllCategories().slice(0, 6).map(category => (
                  <View key={category.id} style={styles.categoryPreview}>
                    <Text style={styles.categoryIcon}>{category.icon || '🚫'}</Text>
                    <Text style={styles.categoryName}>{category.displayName || 'Unknown'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    ),
    [state.searchQuery]
  );

  const renderLoadingState = useCallback(
    () => (
      <View style={styles.loadingContainer}>
        <Animated.View entering={FadeInUp.delay(200)}>
          <Text style={styles.loadingText}>
            {state.isInitialLoad ? 'Loading moderated albums...' : 'Refreshing albums...'}
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
            albums={moderatedAlbums}
            viewMode={state.viewMode}
            onAlbumPress={handleAlbumPress}
            showLocked={true}
          />
        </Animated.View>
      </Animated.View>
    ),
    [moderatedAlbums, state.viewMode, handleAlbumPress, contentAnimatedStyle]
  );

  const renderContent = () => {
    if (state.hasError) {
      return renderErrorState();
    }

    if (isLoadingAlbums && !albums?.length) {
      return renderLoadingState();
    }

    if (moderatedAlbums.length === 0 && !isLoadingAlbums && !state.isRefreshing) {
      return renderEmptyState();
    }

    return renderAlbumGrid();
  };

  const renderHeader = () => (
    <Animated.View style={[styles.header, headerAnimatedStyle]}>
      <Animated.View entering={FadeInUp.delay(100)}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="emoticon-devil" size={24} color={theme.colors.warning} />
          <Text style={styles.title}>NSFW</Text>
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
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
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
          Showing {moderatedAlbums.length} moderated albums
        </Text>
        {state.searchQuery && (
          <Text style={styles.footerSearchText}>
            Search: "{state.searchQuery}"
          </Text>
        )}
        
        {/* Show category breakdown */}
        {moderatedAlbums.length > 0 && (
          <View style={styles.categoryBreakdown}>
            <Text style={styles.categoryBreakdownTitle}>Categories:</Text>
            <View style={styles.categoryTags}>
              {moderatedAlbums
                .map(album => album.categoryInfo)
                .filter((category): category is NonNullable<typeof category> => Boolean(category))
                .map((category, index) => (
                  <View key={index} style={styles.categoryTag}>
                    <Text style={styles.categoryTagIcon}>{category.icon || '🚫'}</Text>
                    <Text style={styles.categoryTagText}>{category.displayName || 'Unknown'}</Text>
                  </View>
                ))
              }
            </View>
          </View>
        )}
        
        <Text style={styles.footerWarningText}>
          ⚠️ Content automatically categorized by AI moderation
        </Text>
      </Animated.View>
    </View>
  );

  // ✅ CONDITIONAL RENDERING - NO EARLY RETURNS, USE CONDITIONAL JSX
  return (
    <SafeAreaView style={styles.container}>
      {/* Content Warning Screen */}
      {!state.hasAcceptedWarning ? (
        <Animated.View entering={FadeInUp.delay(200)} style={styles.warningContainer}>
          <View style={styles.warningIcon}>
            <Ionicons name="warning" size={48} color={theme.colors.warning} />
          </View>
          <Text style={styles.warningTitle}>Content Warning</Text>
          <Text style={styles.warningText}>
            This section contains albums with content that has been flagged as potentially sensitive or inappropriate. 
            This may include adult content, violence, or other material that some users may find disturbing.
          </Text>
          <Text style={styles.warningSubtext}>
            By proceeding, you acknowledge that you are of appropriate age and wish to view this content.
          </Text>
          <View style={styles.warningActions}>
            <TouchableOpacity
              style={styles.warningBackButton}
              onPress={() => router.back()}
            >
              <Text style={styles.warningBackButtonText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.warningProceedButton}
              onPress={handleAcceptWarning}
            >
              <Text style={styles.warningProceedButtonText}>I Understand, Proceed</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : (
        /* Main Content */
        <>
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
                tintColor={lightTheme.colors.warning}
                title="Pull to refresh"
                titleColor={lightTheme.colors.textSecondary}
                progressBackgroundColor={lightTheme.colors.surface}
              />
            }
            keyboardShouldPersistTaps="handled"
            accessible={true}
            accessibilityLabel="NSFW albums list"
          >
            {renderContent()}
            {renderFooter()}
          </Animated.ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

// Keep all your existing styles...
const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
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
    gap: theme.spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  refreshIndicator: {
    marginLeft: theme.spacing.sm,
  },
  refreshText: {
    fontSize: 12,
    color: theme.colors.warning,
    fontFamily: 'Inter-Medium',
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  filterButton: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
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
    backgroundColor: theme.colors.primary + '20',
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  viewModeSelectorContainer: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  noAccessTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  noAccessText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  upgradeButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing.md,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  warningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  warningIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${theme.colors.warning}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  warningTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  warningSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.warning,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  warningActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  warningBackButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  warningBackButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
  },
  warningProceedButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.warning,
    alignItems: 'center',
  },
  warningProceedButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  loadingContainer: {
    paddingVertical: theme.spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  errorContainer: {
    paddingVertical: theme.spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingHorizontal: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    minWidth: 120,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  emptyContainer: {
    paddingVertical: theme.spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
    maxWidth: 280,
  },
  footer: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.lg,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  footerSearchText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  footerWarningText: {
    fontSize: 12,
    color: theme.colors.warning,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    opacity: 0.8,
  },
  categoriesPreview: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
  },
  categoriesTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  categoryPreview: {
    alignItems: 'center',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    minWidth: 80,
  },
  categoryIcon: {
    fontSize: 20,
    marginBottom: theme.spacing.xs,
  },
  categoryName: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  categoryBreakdown: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  categoryBreakdownTitle: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  categoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    gap: theme.spacing.xs,
  },
  categoryTagIcon: {
    fontSize: 12,
  },
  categoryTagText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
});
