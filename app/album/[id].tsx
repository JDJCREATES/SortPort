import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  FlatList,
  InteractionManager,
  LayoutAnimation,
  Platform
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS
} from 'react-native-reanimated';
import { Album, ImageMeta } from '../../types';
import { ImageViewerData } from '../../types/display';
import { AlbumUtils } from '../../utils/albumUtils';
import { PhotoLoader } from '../../utils/photoLoader';
import { RevenueCatManager } from '../../utils/revenuecat';
import { SubscriptionModal } from '../../components/SubscriptionModal';
import { ImageFullscreenViewer } from '../../components/ImageFullscreenViewer';
import { ExportAlbumModal } from '../../components/ExportAlbumModal';
import { OptimizedImage } from '../../components/OptimizedImage';
import { ImageCacheManager } from '../../utils/imageCache';
import { useImagePreloader } from '../../hooks/useImagePreloader';
import { lightTheme } from '../../utils/theme';

const PHOTOS_PER_BATCH = 50; // Increased batch size for better initial loading
const PRELOAD_THRESHOLD = 0.8; // Start loading when 80% scrolled
const PRELOAD_LOOKAHEAD = 15; // Number of images to preload ahead

interface AlbumScreenState {
  album: Album | null;
  photos: ImageMeta[];
  loading: boolean;
  nextPhotoCursor: string | null;
  hasMorePhotos: boolean;
  isFetchingMore: boolean;
  viewMode: 'grid' | 'list';
  showSubscriptionModal: boolean;
  showImageViewer: boolean;
  selectedImageIndex: number;
  showExportModal: boolean;
  error: string | null;
  retryCount: number;
}

interface UserFlags {
  isSubscribed: boolean;
  hasUnlockPack: boolean;
  isProUser: boolean;
}


export default function AlbumScreen() {
  const { id: albumId } = useLocalSearchParams();
  
  const [state, setState] = useState<AlbumScreenState>({
    album: null,
    photos: [],
    loading: true,
    nextPhotoCursor: null,
    hasMorePhotos: false,
    isFetchingMore: false,
    viewMode: 'grid',
    showSubscriptionModal: false,
    showImageViewer: false,
    selectedImageIndex: 0,
    showExportModal: false,
    error: null,
    retryCount: 0,
  });
  
  const [userFlags, setUserFlags] = useState<UserFlags>({
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  });

  // Performance refs
  const hasLoadedRef = useRef(false);
const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true);

  // Auto-preload images based on scroll position
  useImagePreloader({
    images: state.photos,
    currentIndex: Math.floor(state.photos.length * 0.7), // Estimate current visible index
    lookahead: PRELOAD_LOOKAHEAD,
    enabled: !state.loading && state.photos.length > 0,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // Memoized image viewer data
  const imageViewerData = useMemo<ImageViewerData[]>(() => 
    state.photos.map(photo => ({
      id: photo.id,
      uri: photo.uri,
      filename: photo.filename,
      width: photo.width,
      height: photo.height,
      creationTime: photo.creationTime,
      modificationTime: photo.modificationTime,
      fileSize: undefined,
      location: undefined,
    }))
  , [state.photos]);

  // Load user flags on mount
  useEffect(() => {
    loadUserFlags();
  }, []);

  // Reset state when album changes
  useEffect(() => {
    if (hasLoadedRef.current) {
      hasLoadedRef.current = false;
      setState(prev => ({
        ...prev,
        loading: true,
        photos: [],
        album: null,
        error: null,
        retryCount: 0,
      }));
    }
  }, [albumId]);

  // Load album data
  useEffect(() => {
    if (!hasLoadedRef.current && albumId) {
      loadAlbum();
    }
  }, [albumId]);

  const loadUserFlags = useCallback(async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const flags = await revenueCat.getUserFlags();
      if (isMountedRef.current) {
        setUserFlags(flags);
      }
    } catch (error) {
      console.error('Error loading user flags:', error);
    }
  }, []);

  const loadAlbum = useCallback(async () => {
    if (hasLoadedRef.current || !isMountedRef.current) return;
    
    hasLoadedRef.current = true;
    
    // Set loading timeout for better UX
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && state.loading) {
        setState(prev => ({ 
          ...prev, 
          error: 'Loading is taking longer than expected...' 
        }));
      }
    }, 10000); // 10 second timeout

    try {
      console.log('🔍 Loading album with ID:', albumId);
      
      const albums = await AlbumUtils.loadAlbums();
      const foundAlbum = albums.find(a => a.id === albumId);
      
      if (!foundAlbum) {
        throw new Error('Album not found');
      }

      if (!isMountedRef.current) return;

      // Use InteractionManager to defer heavy operations
      InteractionManager.runAfterInteractions(async () => {
        try {
          setState(prev => ({ ...prev, album: foundAlbum }));

          if (foundAlbum.imageIds && foundAlbum.imageIds.length > 0) {
            const result = await PhotoLoader.loadPhotosByIds(
              foundAlbum.imageIds,
              PHOTOS_PER_BATCH
            );
            
            if (isMountedRef.current) {
              // Preload first batch of images
              if (result.photos.length > 0) {
                ImageCacheManager.preloadUpcomingImages(result.photos, 0, PRELOAD_LOOKAHEAD);
              }

              setState(prev => ({
                ...prev,
                photos: result.photos,
                nextPhotoCursor: result.nextAfterId,
                hasMorePhotos: result.hasMore,
                loading: false,
                error: null,
              }));
            }
          } else {
            if (isMountedRef.current) {
              setState(prev => ({
                ...prev,
                photos: [],
                nextPhotoCursor: null,
                hasMorePhotos: false,
                loading: false,
                error: null,
              }));
            }
          }
        } catch (photoError) {
          console.error('Error loading photos:', photoError);
          if (isMountedRef.current) {
            setState(prev => ({
              ...prev,
              loading: false,
              error: 'Failed to load photos',
            }));
          }
        }
      });
    } catch (error) {
      console.error('Error loading album:', error);
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load album',
        }));
      }
    } finally {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    }
  }, [albumId, state.loading]);

  const loadMorePhotos = useCallback(async () => {
    if (!state.album || state.isFetchingMore || !state.hasMorePhotos || !state.nextPhotoCursor || state.loading) {
      return;
    }

    if (state.loading && state.photos.length === 0) {
    
    try {
      const result = await PhotoLoader.loadPhotosByIds(
        state.album.imageIds,
        PHOTOS_PER_BATCH,
        state.nextPhotoCursor
      );

      if (isMountedRef.current) {
        // Preload upcoming images for smoother scrolling
        const allPhotos = [...state.photos, ...result.photos];
        ImageCacheManager.preloadUpcomingImages(
          allPhotos, 
          allPhotos.length - PRELOAD_LOOKAHEAD, 
          PRELOAD_LOOKAHEAD
        );

        setState(prev => ({
          ...prev,
          photos: [...prev.photos, ...result.photos],
          nextPhotoCursor: result.nextAfterId,
          hasMorePhotos: result.hasMore,
          isFetchingMore: false,
        }));
      }
    } catch (error) {
      !state.loading &&
      if (isMountedRef.current) {
        setState(prev => ({ ...prev, isFetchingMore: false }));
      }
    }
  }, [state.album, state.isFetchingMore, state.hasMorePhotos, state.nextPhotoCursor]);

  const handleImagePress = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedImageIndex: index,
      showImageViewer: true,
    }));
  }, []);

  const handleImageViewerClose = useCallback(() => {
    setState(prev => ({ ...prev, showImageViewer: false }));
  }, []);

  const handleImageChange = useCallback((index: number) => {
    setState(prev => ({ ...prev, selectedImageIndex: index }));
  }, []);

  const handleRetry = useCallback(() => {
    hasLoadedRef.current = false;
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
    loadAlbum();
  }, [loadAlbum]);

  const toggleViewMode = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setState(prev => ({
      ...prev,
      viewMode: prev.viewMode === 'grid' ? 'list' : 'grid'
    }));
  }, []);

  const renderPhotoItem = useCallback(({ item, index }: { item: ImageMeta; index: number }) => {
    return (
      <OptimizedImage
        uri={item.uri}
        thumbnailUri={item.thumbnailUri}
        style={styles.gridPhoto}
        onPress={() => handleImagePress(index)}
        onLoad={() => {}}
      />
    );
  }, [handleImagePress]);

  const renderFooter = useCallback(() => {
    if (!state.isFetchingMore) return null;
    
    return (
      <Animated.View entering={FadeInUp} style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={lightTheme.colors.primary} />
        <Text style={styles.loadingText}>Loading more photos...</Text>
      </Animated.View>
    );
  }, [state.isFetchingMore]);

  const renderHeader = useCallback(() => {
    if (!state.album) return null;
    
    return (
      <Animated.View entering={FadeInDown.delay(200)}>
        <View style={styles.albumInfo}>
          <Text style={styles.photoCount}>{state.album.count} photos</Text>
          {state.album.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {state.album.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => userFlags.hasUnlockPack ? null : setState(prev => ({ ...prev, showSubscriptionModal: true }))}
          >
            <Feather name="share" size={16} color={userFlags.hasUnlockPack ? lightTheme.colors.primary : lightTheme.colors.textSecondary} />
            <Text style={[styles.actionButtonText, !userFlags.hasUnlockPack && styles.actionButtonTextDisabled]}>Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => {
              if (Platform.OS === 'web') {
                Alert.alert(
                  'Feature Not Available',
                  'Album export is only available on mobile devices. Please use the mobile app to export albums.',
                  [{ text: 'OK' }]
                );
                return;
              }
              
              if (userFlags.isSubscribed) {
                setState(prev => ({ ...prev, showExportModal: true }));
              } else {
                setState(prev => ({ ...prev, showSubscriptionModal: true }));
              }
            }}
          >
            <Feather name="download" size={16} color={userFlags.isSubscribed ? lightTheme.colors.primary : lightTheme.colors.textSecondary} />
            <Text style={[styles.actionButtonText, !userFlags.isSubscribed && styles.actionButtonTextDisabled]}>Export</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }, [state.album, userFlags]);

  const keyExtractor = useCallback((item: ImageMeta) => item.id, []);

  const getItemLayout = useCallback((data: any, index: number) => ({
    length: 120, // Approximate item height
    offset: 120 * index,
    index,
  }), []);

  if (state.loading && !state.album) {
    return (
      <SafeAreaView style={styles.container}>
        <Animated.View entering={FadeInUp} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={lightTheme.colors.primary} />
          <Text style={styles.loadingText}>Loading album...</Text>
          {state.retryCount > 0 && (
            <Text style={styles.retryText}>Attempt {state.retryCount}</Text>
          )}
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (state.error && !state.album) {
    return (
      <SafeAreaView style={styles.container}>
        <Animated.View entering={FadeInUp} style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Unable to load album</Text>
          <Text style={styles.errorText}>{state.error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (!state.album) {
    return (
      <SafeAreaView style={styles.container}>
        <Animated.View entering={FadeInUp} style={styles.errorContainer}>
          <Text style={styles.errorText}>Album not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={SlideInRight.delay(100)} style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={lightTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{state.album.name}</Text>
        <TouchableOpacity style={styles.viewModeButton} onPress={toggleViewMode}>
          {state.viewMode === 'grid' ? (
            <Feather name="list" size={20} color={lightTheme.colors.textSecondary} />
          ) : (
            <MaterialIcons name="grid-view" size={20} color={lightTheme.colors.textSecondary} />
          )}
        </TouchableOpacity>
      </Animated.View>

      {state.photos.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={state.photos}
          renderItem={renderPhotoItem}
          keyExtractor={keyExtractor}
          numColumns={3}
          contentContainerStyle={styles.photoContainer}
          onEndReached={loadMorePhotos}
          onEndReachedThreshold={PRELOAD_THRESHOLD}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          windowSize={8}
          initialNumToRender={12}
          getItemLayout={getItemLayout}
          updateCellsBatchingPeriod={100}
        />
      ) : !state.loading && !state.isFetchingMore ? (
        <Animated.View entering={FadeInUp.delay(300)} style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Photos Available</Text>
          <Text style={styles.emptyText}>
            {state.album?.count === 0 
              ? 'This album is empty.'
              : 'The photos from this album may have been moved or deleted from your device.'
            }
          </Text>
        </Animated.View>
      ) : null}

      <SubscriptionModal
        visible={state.showSubscriptionModal}
        onClose={() => setState(prev => ({ ...prev, showSubscriptionModal: false }))}
        onSuccess={async () => {
          await loadUserFlags();
          setState(prev => ({ ...prev, showSubscriptionModal: false }));
        }}
      />

      <ImageFullscreenViewer
        visible={state.showImageViewer}
        images={imageViewerData}
        initialIndex={state.selectedImageIndex}
        onClose={handleImageViewerClose}
        <ActivityIndicator size="large" color={lightTheme.colors.primary} />
        onImageChange={handleImageChange}
      />

      <ExportAlbumModal
        visible={state.showExportModal}
        onClose={() => setState(prev => ({ ...prev, showExportModal: false }))}
        albumName={state.album?.name || 'Album'}
        photos={state.photos}
      />
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
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
    paddingVertical: lightTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.colors.border,
    backgroundColor: lightTheme.colors.background,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerBackButton: {
    padding: lightTheme.spacing.sm,
    marginLeft: -lightTheme.spacing.sm,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: lightTheme.spacing.md,
  },
  viewModeButton: {
    padding: lightTheme.spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: lightTheme.spacing.md,
  },
  loadingText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  retryText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    opacity: 0.7,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.xl,
    gap: lightTheme.spacing.md,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    marginTop: lightTheme.spacing.md,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  backButton: {
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    borderWidth: 1,
    borderColor: lightTheme.colors.border,
  },
  backButtonText: {
    color: lightTheme.colors.text,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  albumInfo: {
    padding: lightTheme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.colors.border,
  },
  photoCount: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: lightTheme.spacing.xs,
  },
  tag: {
    backgroundColor: lightTheme.colors.surface,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    borderRadius: lightTheme.borderRadius.sm,
  },
  tagText: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: lightTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTheme.colors.border,
  },
  actionButton: {
    alignItems: 'center',
    gap: lightTheme.spacing.xs,
    padding: lightTheme.spacing.sm,
  },
  actionButtonText: {
    fontSize: 12,
    color: lightTheme.colors.primary,
    fontFamily: 'Inter-Medium',
  },
  actionButtonTextDisabled: {
    color: lightTheme.colors.textSecondary,
  },
  photoContainer: {
    padding: lightTheme.spacing.sm,
  },
  gridPhoto: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: lightTheme.borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.surface,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.xl,
    gap: lightTheme.spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
    gap: lightTheme.spacing.sm,
  },
});
