import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  Image,
  ActivityIndicator,
  FlatList
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Share, Download, CreditCard as Edit, Trash2, Grid2x2 as Grid, List } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Album, ImageMeta } from '../../types';
import { ImageViewerData } from '../../types/display';
import { AlbumUtils } from '../../utils/albumUtils';
import { PhotoLoader } from '../../utils/photoLoader';
import { RevenueCatManager } from '../../utils/revenuecat';
import { SubscriptionModal } from '../../components/SubscriptionModal';
import { ImageFullscreenViewer } from '../../components/ImageFullscreenViewer';
import { lightTheme } from '../../utils/theme';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';

const PHOTOS_PER_BATCH = 20;

export default function AlbumScreen() {
  const { id: albumId } = useLocalSearchParams();
  
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<ImageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextPhotoCursor, setNextPhotoCursor] = useState<string | null>(null);
  const [hasMorePhotos, setHasMorePhotos] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [userFlags, setUserFlags] = useState({
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  });
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Add a ref to prevent loading when already loaded
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Only load if we haven't loaded this album yet
    if (!hasLoadedRef.current) {
      loadAlbum();
    }
  }, []); // Remove albumId from dependencies to prevent re-runs

  useEffect(() => {
    loadUserFlags();
  }, []);

  // Reset when albumId changes (navigating to different album)
  useEffect(() => {
    hasLoadedRef.current = false;
    setLoading(true);
    setPhotos([]);
    setAlbum(null);
  }, [albumId]);

  const loadUserFlags = async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const flags = await revenueCat.getUserFlags();
      setUserFlags(flags);
    } catch (error) {
      console.error('Error loading user flags:', error);
    }
  };

  const loadAlbum = async () => {
    if (hasLoadedRef.current) {
      console.log('🚫 Album already loaded, skipping...');
      return;
    }

    hasLoadedRef.current = true;

    try {
      console.log('🔍 Loading album with ID:', albumId);
      
      const albums = await AlbumUtils.loadAlbums();
      console.log('📱 Total albums loaded:', albums.length);
      
      const foundAlbum = albums.find(a => a.id === albumId);
      
      if (!foundAlbum) {
        console.log('❌ Album not found with ID:', albumId);
        Alert.alert('Album Not Found', 'This album no longer exists.');
        router.back();
        return;
      }

      console.log('✅ Found album:', foundAlbum.name, 'with', foundAlbum.imageIds?.length, 'photos');
      setAlbum(foundAlbum);

      // Load actual photos if available
      if (foundAlbum.imageIds && foundAlbum.imageIds.length > 0) {
        try {
          console.log('📸 Starting to load photos for album:', foundAlbum.name);
          
          const result = await PhotoLoader.loadPhotosByIds(
            foundAlbum.imageIds,
            PHOTOS_PER_BATCH
          );
          
          console.log('📸 Photo loading result - setting', result.photos.length, 'photos in state');
          
          setPhotos(result.photos);
          setNextPhotoCursor(result.nextAfterId);
          setHasMorePhotos(result.hasMore);
        } catch (error) {
          console.error('❌ Error loading photos:', error);
          setPhotos([]);
          setNextPhotoCursor(null);
          setHasMorePhotos(false);
        }
      } else {
        console.log('📱 Album has no imageIds');
        setPhotos([]);
        setNextPhotoCursor(null);
        setHasMorePhotos(false);
      }
    } catch (error) {
      console.error('❌ Error loading album:', error);
      Alert.alert('Error', 'Failed to load album.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadMorePhotos = async () => {
    if (!album || isFetchingMore || !hasMorePhotos || !nextPhotoCursor) {
      return;
    }

    setIsFetchingMore(true);
    try {
      const result = await PhotoLoader.loadPhotosByIds(
        album.imageIds,
        PHOTOS_PER_BATCH,
        nextPhotoCursor
      );

      setPhotos(prevPhotos => [...prevPhotos, ...result.photos]);
      setNextPhotoCursor(result.nextAfterId);
      setHasMorePhotos(result.hasMore);
    } catch (error) {
      console.error('Error loading more photos:', error);
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleImagePress = (index: number) => {
    setSelectedImageIndex(index);
    setShowImageViewer(true);
  };

  const handleImageViewerClose = () => {
    setShowImageViewer(false);
  };

  const handleImageChange = (index: number) => {
    setSelectedImageIndex(index);
  };

  // Convert photos to ImageViewerData format
  const imageViewerData: ImageViewerData[] = photos.map(photo => ({
    id: photo.id,
    uri: photo.uri,
    filename: photo.filename,
    width: photo.width,
    height: photo.height,
    creationTime: photo.creationTime,
    modificationTime: photo.modificationTime,
    fileSize: undefined, // Would need to be fetched separately
    location: undefined, // Would need to be fetched separately
  }));

  const handleShare = () => {
    if (!userFlags.hasUnlockPack) {
      setShowSubscriptionModal(true);
      return;
    }

    Alert.alert('Share Album', 'Sharing functionality would be implemented here.');
  };

  const handleExport = () => {
    if (!userFlags.isSubscribed) {
      setShowSubscriptionModal(true);
      return;
    }

    Alert.alert('Export Album', 'Export functionality would be implemented here.');
  };

  const handleEdit = () => {
    Alert.alert(
      'Edit Album',
      'What would you like to do?',
      [
        { text: 'Cancel' },
        { text: 'Rename', onPress: handleRename },
        { text: 'Edit Tags', onPress: handleEditTags },
      ]
    );
  };

  const handleRename = () => {
    Alert.prompt(
      'Rename Album',
      'Enter a new name for this album:',
      [
        { text: 'Cancel' },
        {
          text: 'Save',
          onPress: async (newName) => {
            if (newName && album) {
              try {
                await AlbumUtils.updateAlbum(album.id, { name: newName });
                setAlbum({ ...album, name: newName });
                Alert.alert('Success', 'Album renamed successfully.');
              } catch (error) {
                Alert.alert('Error', 'Failed to rename album.');
              }
            }
          },
        },
      ],
      'plain-text',
      album?.name
    );
  };

  const handleEditTags = () => {
    Alert.prompt(
      'Edit Tags',
      'Enter tags separated by commas:',
      [
        { text: 'Cancel' },
        {
          text: 'Save',
          onPress: async (tagsString) => {
            if (tagsString !== undefined && album) {
              const newTags = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag);
              try {
                await AlbumUtils.updateAlbum(album.id, { tags: newTags });
                setAlbum({ ...album, tags: newTags });
                Alert.alert('Success', 'Tags updated successfully.');
              } catch (error) {
                Alert.alert('Error', 'Failed to update tags.');
              }
            }
          },
        },
      ],
      'plain-text',
      album?.tags.join(', ')
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Album',
      'Are you sure you want to delete this album? This action cannot be undone.',
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (album) {
              try {
                await AlbumUtils.removeAlbum(album.id);
                Alert.alert('Deleted', 'Album has been deleted.');
                router.back();
              } catch (error) {
                Alert.alert('Error', 'Failed to delete album.');
              }
            }
          },
        },
      ]
    );
  };

  const handleSubscriptionSuccess = async () => {
    await loadUserFlags();
    setShowSubscriptionModal(false);
  };

  const toggleViewMode = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  };

  const renderPhotoItem = ({ item, index }: { item: ImageMeta; index: number }) => {
    return (
      <TouchableOpacity 
        style={styles.gridPhoto}
        onPress={() => handleImagePress(index)}
      >
        <Image 
          source={{ uri: item.uri }} 
          style={styles.gridImage}
          resizeMode="cover"
          onLoad={() => console.log('✅ Image loaded:', item.id)}
          onError={(error) => console.log('❌ Image error:', item.id, error)}
        />
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!isFetchingMore) return null;
    
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={lightTheme.colors.primary} />
        <Text style={styles.loadingText}>Loading more photos...</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading album...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!album) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Album not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={lightTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{album.name}</Text>
        <TouchableOpacity style={styles.viewModeButton} onPress={toggleViewMode}>
          {viewMode === 'grid' ? (
            <List size={20} color={lightTheme.colors.textSecondary} />
          ) : (
            <Grid size={20} color={lightTheme.colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.albumInfo}>
          <Text style={styles.photoCount}>{album.count} photos</Text>
          {album.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {album.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Share size={16} color={userFlags.hasUnlockPack ? lightTheme.colors.primary : lightTheme.colors.textSecondary} />
            <Text style={[styles.actionButtonText, !userFlags.hasUnlockPack && styles.actionButtonTextDisabled]}>Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleExport}>
            <Download size={16} color={userFlags.isSubscribed ? lightTheme.colors.primary : lightTheme.colors.textSecondary} />
            <Text style={[styles.actionButtonText, !userFlags.isSubscribed && styles.actionButtonTextDisabled]}>Export</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
            <Edit size={16} color={lightTheme.colors.primary} />
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
            <Trash2 size={16} color={lightTheme.colors.error} />
            <Text style={[styles.actionButtonText, { color: lightTheme.colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        {photos.length > 0 ? (
          <FlatList
            data={photos}
            renderItem={renderPhotoItem}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.photoContainer}
            onEndReached={loadMorePhotos}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Photos Available</Text>
            <Text style={styles.emptyText}>
              The photos from this album may have been moved or deleted from your device.
            </Text>
          </View>
        )}
      </ScrollView>

      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSuccess={handleSubscriptionSuccess}
      />

      <ImageFullscreenViewer
        visible={showImageViewer}
        images={imageViewerData}
        initialIndex={selectedImageIndex}
        onClose={handleImageViewerClose}
        onImageChange={handleImageChange}
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
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  backButton: {
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
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: lightTheme.colors.error,
    fontFamily: 'Inter-Regular',
  },
  albumInfo: {
    padding: lightTheme.spacing.lg,
    borderBottomWidth: 1,
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
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  actionButton: {
    alignItems: 'center',
    gap: lightTheme.spacing.xs,
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
    padding: lightTheme.spacing.md,
  },
  gridPhoto: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: lightTheme.borderRadius.sm,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  listPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    padding: lightTheme.spacing.sm,
    marginBottom: lightTheme.spacing.sm,
    marginHorizontal: lightTheme.spacing.md,
  },
  listImage: {
    width: 60,
    height: 60,
    borderRadius: lightTheme.borderRadius.sm,
  },
  listPhotoInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.md,
  },
  listPhotoName: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  listPhotoDate: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  emptyContainer: {
    padding: lightTheme.spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
    gap: lightTheme.spacing.sm,
  },
  
});