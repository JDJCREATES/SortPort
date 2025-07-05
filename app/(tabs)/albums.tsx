import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl,
  Alert,
  Dimensions,
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Search, Filter, Grid2x2 as Grid, Plus, CircleAlert as AlertCircle, LayoutGrid } from 'lucide-react-native';
import Animated, { FadeInUp, FadeInDown, SlideInRight } from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { ResponsiveAlbumGrid } from '../../components/ResponsiveAlbumGrid';
import { AlbumViewModeSelector } from '../../components/AlbumViewModeSelector';
import { lightTheme } from '../../utils/theme';
import { Album } from '../../types';
import { AlbumViewMode } from '../../types/display';

const { width: screenWidth } = Dimensions.get('window');

// Constants for better maintainability
const REFRESH_COOLDOWN = 30 * 1000; // 30 seconds
const STALE_DATA_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

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
}

export default function AlbumsScreen() {
  const { albums, isLoadingAlbums, refreshAlbums } = useApp();
  
  // State management
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
  });

  // Refs for performance optimization
  const lastRefreshTime = useRef<number>(0);
  const lastDataFetchTime = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Memoized filtered and sorted albums
  const processedAlbums = useMemo(() => {
    if (!albums || albums.length === 0) return [];
    
    let filtered = albums;
    
    // Apply locked filter
    if (!state.showLocked) {
      filtered = filtered.filter(album => !album.isLocked);
    }
    
    // Apply search filter
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(album => 
        album.name.toLowerCase().includes(query) ||
        album.tags?.some(tag => tag.toLowerCase().includes(query))
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
    
    return sorted;
  }, [albums, state.showLocked, state.searchQuery, state.sortBy, state.sortOrder]);

  // Stable refresh function with retry logic
  const handleRefresh = useCallback(async (isRetry: boolean = false) => {
    if (state.isRefreshing && !isRetry) return;
    
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;
    
    // Prevent too frequent refreshes (unless it's a retry)
    if (!isRetry && timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.log('🚫 Refresh blocked - too soon since last refresh');
      return;
    }
    
    try {
      if (isMountedRef.current) {
        setState(prev => ({ 
          ...prev, 
          isRefreshing: true, 
          hasError: false, 
          errorMessage: '' 
        }));
      }
      
      console.log('🔄 Refreshing albums...');
      await refreshAlbums();
      
      if (isMountedRef.current) {
        lastRefreshTime.current = now;
        lastDataFetchTime.current = now;
        setState(prev => ({ 
          ...prev, 
          isRefreshing: false, 
          retryCount: 0,
          hasError: false,
          errorMessage: ''
        }));
      }
      
      console.log('✅ Albums refreshed successfully');
    } catch (error) {
      console.error('❌ Error refreshing albums:', error);
      
      if (isMountedRef.current) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to refresh albums';
        const newRetryCount = state.retryCount + 1;
        
        setState(prev => ({
          ...prev,
          isRefreshing: false,
          hasError: true,
          errorMessage,
          retryCount: newRetryCount,
        }));
        
        // Auto-retry logic
        if (newRetryCount < MAX_RETRY_ATTEMPTS) {
          console.log(`🔄 Auto-retrying in ${RETRY_DELAY}ms (attempt ${newRetryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
          retryTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              handleRefresh(true);
            }
          }, RETRY_DELAY * newRetryCount); // Exponential backoff
        }
      }
    }
  }, [refreshAlbums, state.isRefreshing, state.retryCount]);

  // Smart focus effect with data staleness check
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime.current;
      const timeSinceLastFetch = now - lastDataFetchTime.current;
      
      const shouldRefresh = (
        (!albums || albums.length === 0) && !isLoadingAlbums
      ) || (
        // Increase this threshold to prevent frequent refreshes
        timeSinceLastFetch > 10 * 60 * 1000 && // 10 minutes instead of 5
        timeSinceLastRefresh > REFRESH_COOLDOWN
      ) || (
        state.hasError && state.retryCount < MAX_RETRY_ATTEMPTS
      );
      
      if (shouldRefresh && !state.isRefreshing) {
        console.log('🔄 Refreshing albums on focus');
        handleRefresh();
      }
    }, [albums, handleRefresh, isLoadingAlbums, state.isRefreshing, state.hasError, state.retryCount])
  );

  // Event handlers
  const handleAlbumPress = useCallback((album: Album) => {
    try {
      if (album.isLocked) {
        Alert.alert(
          'Premium Feature',
          'This album is locked. Upgrade to SnapSort Pro to access all albums.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/settings') }
          ]
        );
        return;
      }
      
      router.push(`/album/${album.id}`);
    } catch (error) {
      console.error('Error navigating to album:', error);
      Alert.alert('Error', 'Failed to open album. Please try again.');
    }
  }, []);

  const handleToggleShowLocked = useCallback(() => {
    setState(prev => ({ ...prev, showLocked: !prev.showLocked }));
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const handleSortChange = useCallback((sortBy: 'name' | 'date' | 'count') => {
    setState(prev => ({
      ...prev,
      sortBy,
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'desc' ? 'asc' : 'desc'
    }));
  }, []);

  const handleRetry = useCallback(() => {
    setState(prev => ({ ...prev, retryCount: 0 }));
    handleRefresh(true);
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
    setState(prev => ({ ...prev, viewMode }));
  }, []);

  const toggleViewModeSelector = useCallback(() => {
    setState(prev => ({ ...prev, showViewModeSelector: !prev.showViewModeSelector }));
  }, []);

  // Render functions
  const renderErrorState = useCallback(() => (
    <Animated.View entering={FadeInUp.delay(200)} style={styles.errorContainer}>
      <AlertCircle size={48} color={lightTheme.colors.error} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{state.errorMessage}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </Animated.View>
  ), [state.errorMessage, handleRetry]);

  const renderEmptyState = useCallback(() => (
    <Animated.View entering={FadeInUp.delay(200)} style={styles.emptyContainer}>
      <Grid size={64} color={lightTheme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>
        {state.searchQuery ? 'No matching albums' : 'No Albums Yet'}
      </Text>
      <Text style={styles.emptyText}>
        {state.searchQuery 
          ? `No albums match "${state.searchQuery}". Try a different search term.`
          : 'Use the Picture Hack feature to create your first smart album!'
        }
      </Text>
      {!state.searchQuery && (
        <TouchableOpacity style={styles.createButton} onPress={handleCreateAlbum}>
          <Plus size={20} color="white" />
          <Text style={styles.createButtonText}>Create Album</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  ), [state.searchQuery, handleCreateAlbum]);

  const renderLoadingState = useCallback(() => (
    <Animated.View entering={FadeInUp.delay(200)} style={styles.loadingContainer}>
      <Text style={styles.loadingText}>
        {state.retryCount > 0 ? `Retrying... (${state.retryCount}/${MAX_RETRY_ATTEMPTS})` : 'Loading albums...'}
      </Text>
    </Animated.View>
  ), [state.retryCount]);

  const renderAlbumGrid = useCallback(() => (
    <Animated.View entering={FadeInUp.delay(200)}>
      <ResponsiveAlbumGrid
        albums={processedAlbums}
        viewMode={state.viewMode}
        onAlbumPress={handleAlbumPress}
        showLocked={state.showLocked}
      />
    </Animated.View>
  ), [processedAlbums, state.viewMode, handleAlbumPress, state.showLocked]);

  const renderContent = () => {
    if (state.hasError && state.retryCount >= MAX_RETRY_ATTEMPTS) {
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
    <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
      <View style={styles.headerLeft}>
        <Grid size={24} color={lightTheme.colors.primary} />
        <Text style={styles.title}>All Albums</Text>
      </View>
      <View style={styles.headerActions}>
        <TouchableOpacity 
          style={[
            styles.filterButton,
            state.showViewModeSelector && styles.filterButtonActive
          ]} 
          onPress={toggleViewModeSelector}
          disabled={state.isRefreshing}
          accessibilityLabel="Change view mode"
          accessibilityRole="button"
        >
          <LayoutGrid 
            size={20} 
            color={state.showViewModeSelector ? lightTheme.colors.primary : lightTheme.colors.textSecondary} 
          />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.filterButton,
            state.showLocked && styles.filterButtonActive
          ]} 
          onPress={handleToggleShowLocked}
          disabled={state.isRefreshing}
          accessibilityLabel={state.showLocked ? "Hide locked albums" : "Show locked albums"}
          accessibilityRole="button"
        >
          <Filter 
            size={20} 
            color={state.showLocked ? lightTheme.colors.primary : lightTheme.colors.textSecondary} 
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderViewModeSelector = () => {
    if (!state.showViewModeSelector) return null;
    
    return (
      <Animated.View 
        entering={FadeInDown.delay(100)} 
        style={styles.viewModeSelectorContainer}
      >
        <AlbumViewModeSelector
          currentMode={state.viewMode}
          onModeChange={handleViewModeChange}
        />
      </Animated.View>
    );
  };

  const renderFooter = () => (
    <Animated.View entering={FadeInDown.delay(300)} style={styles.footer}>
      <Text style={styles.footerText}>
        {state.showLocked 
          ? `Showing ${processedAlbums.length} albums (including locked)`
          : `Showing ${processedAlbums.length} unlocked albums`
        }
      </Text>
      {state.searchQuery && (
        <Text style={styles.footerSearchText}>
          Search: "{state.searchQuery}"
        </Text>
      )}
      {albums && albums.length > 0 && (
        <Text style={styles.footerStatsText}>
          Total: {albums.length} albums • {albums.reduce((sum, album) => sum + (album.count || 0), 0)} photos
        </Text>
      )}
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderViewModeSelector()}

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.isRefreshing}
            onRefresh={() => handleRefresh(false)}
            tintColor={lightTheme.colors.primary}
            title="Pull to refresh"
            titleColor={lightTheme.colors.textSecondary}
          />
        }
        keyboardShouldPersistTaps="handled"
        accessible={true}
        accessibilityLabel="Albums list"
      >
        {renderContent()}
        {renderFooter()}
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
    borderBottomWidth: 1,
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
    borderTopWidth: 1,
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
