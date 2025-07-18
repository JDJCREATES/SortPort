import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Platform, Alert } from 'react-native';
import { PhotoLoader } from '../utils/photoLoader';
import { useApp } from '../contexts/AppContext';
import { getCurrentTheme } from '../utils/theme';
import { AlbumUtils } from '../utils/albumUtils';

/**
 * Handles the selection of photo sources.
 * 
 */

interface SourceFolder {
  id: string;
  name: string;
  count: number;
  icon: React.ReactNode;
  description: string;
}

interface SourceFolderPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (folders: SourceFolder[]) => void;
  selectedFolders: string[];
  testID?: string;
}

function SourceFolderPickerComponent({ 
  visible, 
  onClose, 
  onSelect, 
  selectedFolders,
  testID = 'source-folder-picker'
}: SourceFolderPickerProps) {
  const { userProfile } = useApp();
  const theme = getCurrentTheme();
  
  const [folders, setFolders] = useState<SourceFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedFolders);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, message: '' });

  // Memoize styles to prevent recreation on every render
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (visible) {
      loadFolders();
    }
  }, [visible]);

  useEffect(() => {
    setTempSelected(selectedFolders);
  }, [selectedFolders]);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (Platform.OS === 'web') {
        setError('Photo folder access is not available on web. This feature requires a native mobile app.');
        setFolders([]);
        return;
      }

      const availableFolders = await PhotoLoader.getAvailableFolders();
      
      if (availableFolders.length === 0) {
        setError('No photo folders found. Please ensure you have photos on your device and have granted photo library permissions.');
        setFolders([]);
        return;
      }
      
      const folderData: SourceFolder[] = availableFolders.map((folder) => {
        let icon = <Ionicons name="folder" size={20} color={theme.colors.primary} />;
        let description = `${folder.count} photos`;

        // Assign specific icons based on folder name
        if (folder.name.toLowerCase().includes('camera')) {
          icon = <Ionicons name="camera" size={20} color={theme.colors.secondary} />;
          description = 'Photos taken with camera';
        } else if (folder.name.toLowerCase().includes('download')) {
          icon = <Ionicons name="download" size={20} color={theme.colors.warning} />;
          description = 'Downloaded images';
        } else if (folder.name.toLowerCase().includes('screenshot')) {
          icon = <Ionicons name="phone-portrait" size={20} color={theme.colors.success} />;
          description = 'Screen captures';
        } else if (folder.name.toLowerCase().includes('whatsapp')) {
          icon = <MaterialIcons name="chat" size={20} color="#25D366" />;
          description = 'WhatsApp images';
        } else if (folder.name.toLowerCase().includes('instagram')) {
          icon = <MaterialIcons name="photo-camera" size={20} color="#E4405F" />;
          description = 'Instagram images';
        }

        return {
          id: folder.id,
          name: folder.name,
          count: folder.count,
          icon,
          description,
        };
      });

      // Sort folders by count (descending) for better UX
      folderData.sort((a, b) => b.count - a.count);
      setFolders(folderData);
      
    } catch (error: any) {
      console.error('Error loading folders:', error);
      setError(error.message || 'Failed to load photo folders. Please check your permissions and try again.');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [theme.colors]);

  const toggleFolder = useCallback((folderId: string) => {
    setTempSelected(prev => 
      prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (isScanning) return; // Prevent multiple scans
    
    const selectedFolderObjects = folders.filter(folder => 
      tempSelected.includes(folder.id)
    );
    
    // If no folders selected, just clear and close immediately
    if (tempSelected.length === 0) {
      onSelect([]);
      onClose();
      return;
    }
    
    // Only scan newly selected folders that haven't been scanned before
    const newlySelectedFolders = tempSelected.filter(id => !selectedFolders.includes(id));
    
    if (newlySelectedFolders.length > 0 && userProfile) {
      // Start NSFW scanning for new folders
      handleNsfwScanning(newlySelectedFolders, selectedFolderObjects);
    } else {
      // No new folders or no user, just update selection
      onSelect(selectedFolderObjects);
      onClose();
    }
  }, [isScanning, folders, tempSelected, selectedFolders, userProfile, onSelect, onClose]);

  const handleNsfwScanning = useCallback(async (
    newlySelectedFolderIds: string[], 
    allSelectedFolders: SourceFolder[]
  ) => {
    if (!userProfile || Platform.OS === 'web') {
      onSelect(allSelectedFolders);
      onClose();
      return;
    }
    
    setIsScanning(true);
    setScanProgress({ 
      current: 0, 
      total: 0, 
      message: 'Loading photos for bulk processing...' 
    });
    
    try {
      // Get all photos from newly selected folders
      const allPhotos = await PhotoLoader.loadAllPhotoIds(newlySelectedFolderIds);
      
      if (allPhotos.length === 0) {
        onSelect(allSelectedFolders);
        onClose();
        return;
      }

   

      // ✅ SKIP LOCAL DETECTION - Go straight to AWS bulk processing
      setScanProgress({ 
        current: 0, 
        total: allPhotos.length, 
        message: `Submitting ${allPhotos.length} images for AWS bulk processing...` 
      });


      // ✅ Use REAL bulk processing - send ALL images to AWS
      const { BulkNSFWProcessor } = await import('../utils/bulkNsfwProcessor');
      
      // Extract URIs for bulk processing
      const imageUris = allPhotos.map(photo => photo.uri);
      
      console.log(`☁️ Starting AWS bulk processing for ${imageUris.length} images`);

      // ✅ Use REAL bulk processing with progress tracking
      const bulkResults = await BulkNSFWProcessor.processBulkImages(
        imageUris,
        userProfile.id,
        (progress) => {
          const completed = progress.current || 0;
          const total = progress.total || 100;
          const status = progress.status || progress.message || 'Processing';
          
          setScanProgress({
            current: completed,
            total: total,
            message: `${status}: ${progress.message || 'Processing...'}`
          });
        }
      );

      console.log(`☁️ AWS bulk processing complete:`, {
        totalProcessed: bulkResults.totalImages,
        awsConfirmed: bulkResults.nsfwDetected,
        processingTime: bulkResults.processingTimeMs
      });

      // ✅ Process AWS results and create albums
      if (bulkResults.nsfwDetected > 0 && bulkResults.results) {
        const finalNsfwImages: any[] = [];
        const awsResults: { [imageId: string]: any } = {};

        // Map AWS results back to our image data
        bulkResults.results.forEach((result: any, index: number) => {
          if (result.is_nsfw && index < allPhotos.length) {
            const originalImage = allPhotos[index];
            
            awsResults[originalImage.id] = result;
            
            finalNsfwImages.push({
              id: originalImage.id,
              uri: originalImage.uri,
              filename: `nsfw_${originalImage.id}`,
              folderId: originalImage.folderId,
              width: 0,
              height: 0,
              creationTime: Date.now(),
              modificationTime: Date.now(),
              awsConfidence: result.confidence_score || 0,
            });
          }
        });

        // Create categorized albums with AWS results
        if (finalNsfwImages.length > 0) {
          console.log(`🔒 Creating albums for ${finalNsfwImages.length} confirmed NSFW images`);
          await AlbumUtils.createCategorizedModeratedAlbums(finalNsfwImages, awsResults);
        }

        // FIXED: Use the correct count from bulkResults instead of finalNsfwImages.length
        console.log(`🏁 AWS bulk processing complete:`, {
          totalPhotos: allPhotos.length,
          awsConfirmed: bulkResults.nsfwDetected, // Use this instead of finalNsfwImages.length
          processingTime: bulkResults.processingTimeMs
        });
      } else {
        console.log(`✅ No NSFW content confirmed by AWS bulk processing`);
      }

      // Update moderated folders
      const folderIds = newlySelectedFolderIds;
      
      // Create folderNames mapping from selected folders
      const folderNames: { [folderId: string]: string } = {};
      allSelectedFolders.forEach(folder => {
        if (newlySelectedFolderIds.includes(folder.id)) {
          folderNames[folder.id] = folder.name;
        }
      });
      
      await AlbumUtils.updateModeratedFolders(folderIds, folderNames);

      onSelect(allSelectedFolders);
      onClose();
      
    } catch (error) {
      console.error('❌ AWS bulk processing failed:', error);
      
      // Show error to user
      Alert.alert(
        'Processing Error',
        `Failed to process images: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [
          { text: 'Continue Anyway', onPress: () => { onSelect(allSelectedFolders); onClose(); } },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } finally {
      setIsScanning(false);
      setScanProgress({ current: 0, total: 0, message: '' });
    }
  }, [userProfile, onSelect, onClose]);

  const handleSelectAll = useCallback(() => {
    if (tempSelected.length === folders.length) {
      setTempSelected([]);
    } else {
      setTempSelected(folders.map(f => f.id));
    }
  }, [tempSelected.length, folders]);

  const handleRetry = useCallback(() => {
    loadFolders();
  }, [loadFolders]);

  const handleClose = useCallback(() => {
    if (!isScanning) {
      onClose();
    }
  }, [isScanning, onClose]);

  // Memoized computed values
  const isSelectAllActive = useMemo(() => tempSelected.length === folders.length, [tempSelected.length, folders.length]);
  const hasSelection = useMemo(() => tempSelected.length > 0, [tempSelected.length]);
  const canConfirm = useMemo(() => !error && !isScanning, [error, isScanning]);

  if (!visible) return null;

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="slide"
      onRequestClose={handleClose}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Animated.View entering={FadeInUp.delay(100)} style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Photo Sources</Text>
            <TouchableOpacity 
              onPress={handleClose} 
              style={styles.closeButton}
              disabled={isScanning}
              testID={`${testID}-close-button`}
            >
              <Ionicons 
                name="close" 
                size={24} 
                color={isScanning ? theme.colors.border : theme.colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>

          {!error && folders.length > 0 && (
            <View style={styles.controls}>
              <TouchableOpacity 
                onPress={handleSelectAll} 
                style={styles.selectAllButton}
                disabled={isScanning}
                testID={`${testID}-select-all-button`}
              >
                <Text style={[
                  styles.selectAllText,
                  isScanning && styles.disabledText
                ]}>
                  {isSelectAllActive ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.selectedCount}>
                {tempSelected.length} of {folders.length} selected
              </Text>
            </View>
          )}

          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            testID={`${testID}-scroll-view`}
          >
            {loading ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading photo folders...</Text>
              </Animated.View>
            ) : error ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.centerContainer}>
                <Ionicons 
                  name="alert-circle-outline" 
                  size={48} 
                  color={theme.colors.error} 
                  style={styles.errorIcon}
                />
                <Text style={styles.errorTitle}>Unable to Load Folders</Text>
                <Text style={styles.errorText}>{error}</Text>
                {Platform.OS !== 'web' && (
                  <TouchableOpacity 
                    style={styles.retryButton} 
                    onPress={handleRetry}
                    testID={`${testID}-retry-button`}
                  >
                    <Text style={styles.retryButtonText}>Try Again</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            ) : folders.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.centerContainer}>
                <Ionicons 
                  name="folder-outline" 
                  size={48} 
                  color={theme.colors.textSecondary} 
                  style={styles.emptyIcon}
                />
                <Text style={styles.emptyTitle}>No Photo Folders Found</Text>
                <Text style={styles.emptyText}>
                  Make sure you have photos on your device and have granted photo library permissions.
                </Text>
              </Animated.View>
            ) : (
              folders.map((folder, index) => (
                <Animated.View 
                  key={folder.id} 
                  entering={FadeInDown.delay(index * 50)}
                >
                  <TouchableOpacity
                    style={[
                      styles.folderItem,
                      tempSelected.includes(folder.id) && styles.folderItemSelected,
                      isScanning && styles.folderItemDisabled
                    ]}
                    onPress={() => toggleFolder(folder.id)}
                    disabled={isScanning}
                    testID={`${testID}-folder-${index}`}
                    accessible={true}
                    accessibilityLabel={`${folder.name}, ${folder.count} photos`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: tempSelected.includes(folder.id) }}
                  >
                    <View style={styles.folderIcon}>
                      {folder.icon}
                    </View>
                    <View style={styles.folderInfo}>
                      <Text style={styles.folderName} numberOfLines={1}>
                        {folder.name}
                      </Text>
                      <Text style={styles.folderDescription} numberOfLines={1}>
                        {folder.description}
                      </Text>
                      <Text style={styles.folderCount}>
                        {folder.count.toLocaleString()} photos
                      </Text>
                    </View>
                    <View style={styles.folderCountBadge}>
                      <Text style={styles.countText}>
                        {folder.count > 999 ? '999+' : folder.count}
                      </Text>
                    </View>
                    {tempSelected.includes(folder.id) && (
                      <View style={styles.checkmark}>
                        <Ionicons name="checkmark" size={20} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ))
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.cancelButton, isScanning && styles.cancelButtonDisabled]} 
              onPress={handleClose}
              disabled={isScanning}
              testID={`${testID}-cancel-button`}
            >
              <Text style={[styles.cancelButtonText, isScanning && styles.disabledText]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.confirmButton,
                !canConfirm && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              testID={`${testID}-confirm-button`}
            >
              <Text style={styles.confirmButtonText}>
                {isScanning 
                  ? `Scanning... ${scanProgress.current}/${scanProgress.total}`
                  : tempSelected.length === 0 
                    ? 'Clear Selection'
                    : `Apply (${tempSelected.length})`
                }
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* NSFW Scanning Progress Overlay */}
          {isScanning && (
            <View style={styles.scanningOverlay}>
              <View style={styles.scanningContent}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.scanningTitle}>Content Moderation</Text>
                <Text style={styles.scanningMessage}>{scanProgress.message}</Text>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${(scanProgress.current / Math.max(scanProgress.total, 1)) * 100}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.scanningNote}>
                  Scanning new folders for appropriate content. This may take a few minutes.
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// Export the memoized component
export const SourceFolderPicker = React.memo(SourceFolderPickerComponent);

const createStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    minHeight: '85%',
    maxHeight: '95%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  selectAllButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  selectAllText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.primary,
  },
  selectedCount: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  centerContainer: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    marginTop: theme.spacing.md,
  },
  errorIcon: {
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.error,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
    paddingHorizontal: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    elevation: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  emptyIcon: {
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: theme.spacing.md,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  folderItemSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}10`,
    elevation: 2,
    shadowOpacity: 0.1,
  },
  folderItemDisabled: {
    opacity: 0.6,
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  folderInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  folderName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 2,
  },
  folderDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  folderCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  folderCountBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginRight: theme.spacing.sm,
    minWidth: 40,
    alignItems: 'center',
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: theme.colors.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    elevation: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  confirmButtonDisabled: {
    backgroundColor: theme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  disabledText: {
    opacity: 0.5,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  scanningContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: '90%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scanningTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  scanningMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 3,
  },
  scanningNote: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.8,
  },
});