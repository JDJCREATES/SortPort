import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Platform } from 'react-native';
import { PhotoLoader } from '../utils/photoLoader';
import { useApp } from '../contexts/AppContext';
import { lightTheme } from '../utils/theme';
import { supabase } from '../utils/supabase';

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
}

export function SourceFolderPicker({ visible, onClose, onSelect, selectedFolders }: SourceFolderPickerProps) {
  const { userProfile } = useApp();
  const [folders, setFolders] = useState<SourceFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedFolders);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, message: '' });

  useEffect(() => {
    if (visible) {
      loadFolders();
    }
  }, [visible]);

  useEffect(() => {
    setTempSelected(selectedFolders);
  }, [selectedFolders]);

  const loadFolders = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        // Web cannot access device folders
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
        let icon = <Ionicons name="folder" size={20} color={lightTheme.colors.primary} />;
        let description = `${folder.count} photos`;

        // Assign specific icons based on folder name
        if (folder.name.toLowerCase().includes('camera')) {
          icon = <Ionicons name="camera" size={20} color={lightTheme.colors.secondary} />;
          description = 'Photos taken with camera';
        } else if (folder.name.toLowerCase().includes('download')) {
          icon = <Ionicons name="download" size={20} color={lightTheme.colors.warning} />;
          description = 'Downloaded images';
        } else if (folder.name.toLowerCase().includes('screenshot')) {
          icon = <Ionicons name="phone-portrait" size={20} color={lightTheme.colors.success} />;
          description = 'Screen captures';
        }

        return {
          id: folder.id,
          name: folder.name,
          count: folder.count,
          icon,
          description,
        };
      });

      setFolders(folderData);
    } catch (error: any) {
      console.error('Error loading folders:', error);
      setError(error.message || 'Failed to load photo folders. Please check your permissions and try again.');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    setTempSelected(prev => 
      prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const handleConfirm = () => {
    if (isScanning) return; // Prevent multiple scans
    
    const selectedFolderObjects = folders.filter(folder => 
      tempSelected.includes(folder.id)
    );
    
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
  };

  const handleNsfwScanning = async (
    newlySelectedFolderIds: string[], 
    allSelectedFolders: SourceFolder[]
  ) => {
    if (!userProfile || Platform.OS === 'web') {
      onSelect(allSelectedFolders);
      onClose();
      return;
    }
    
    setIsScanning(true);
    setScanProgress({ current: 0, total: 0, message: 'Preparing content scan...' });
    
    try {
      const allPhotos = await PhotoLoader.loadAllPhotoIds(newlySelectedFolderIds);
      
      if (allPhotos.length === 0) {
        onSelect(allSelectedFolders);
        onClose();
        return;
      }

      const photosToModerate = allPhotos.slice(0, 50);
      setScanProgress({ 
        current: 0, 
        total: photosToModerate.length, 
        message: `Scanning ${photosToModerate.length} photos...` 
      });

      let processedCount = 0;
      let flaggedCount = 0;
      const nsfwImages: any[] = []; // Store NSFW image metadata

      // Process in batches of 5
      const BATCH_SIZE = 5;
      for (let i = 0; i < photosToModerate.length; i += BATCH_SIZE) {
        const batch = photosToModerate.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (photo) => {
          try {
            const base64 = await PhotoLoader.getPhotoBase64(photo.uri);
            
            // ✅ Call Supabase Edge Function instead of NsfwModerationManager
            const { data, error } = await supabase.functions.invoke('rekognition-moderation', {
              body: {
                image_base64: base64,
                image_id: photo.id,
              }
            });

            if (error) {
              console.warn(`Moderation failed for photo ${photo.id}:`, error);
              return { photo_id: photo.id, is_nsfw: false };
            }

            if (data?.is_nsfw) {
              flaggedCount++;
              // Add to NSFW images collection with full metadata
              nsfwImages.push({
                id: photo.id,
                uri: photo.uri,
                filename: `nsfw_${photo.id}`,
                width: 0, // We don't have dimensions from loadAllPhotoIds
                height: 0,
                creationTime: Date.now(),
                modificationTime: Date.now(),
              });
            }

            return {
              photo_id: photo.id,
              is_nsfw: data?.is_nsfw || false,
              confidence: data?.confidence_score || 0
            };
          } catch (error) {
            console.warn(`Error processing photo ${photo.id}:`, error);
            return { photo_id: photo.id, is_nsfw: false };
          }
        });

        await Promise.all(batchPromises);
        processedCount += batch.length;

        setScanProgress({
          current: processedCount,
          total: photosToModerate.length,
          message: `Processed ${processedCount}/${photosToModerate.length} photos...`
        });

        if (i + BATCH_SIZE < photosToModerate.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Create or update moderated content album if NSFW images were found
      if (nsfwImages.length > 0) {
        console.log(`🔒 Found ${nsfwImages.length} NSFW images, creating/updating moderated album...`);
        await AlbumUtils.ensureModeratedContentAlbumExists(nsfwImages);
      }
      
      onSelect(allSelectedFolders);
      onClose();
      
    } catch (error) {
      console.error('Content moderation failed:', error);
      onSelect(allSelectedFolders);
      onClose();
    } finally {
      setIsScanning(false);
      setScanProgress({ current: 0, total: 0, message: '' });
    }
  };

  const handleSelectAll = () => {
    if (tempSelected.length === folders.length) {
      setTempSelected([]);
    } else {
      setTempSelected(folders.map(f => f.id));
    }
  };

  const handleRetry = () => {
    loadFolders();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <Animated.View entering={FadeInUp.delay(100)} style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Photo Sources</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
             <Ionicons name="close" size={24} color={lightTheme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!error && folders.length > 0 && (
            <View style={styles.controls}>
              <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllButton}>
                <Text style={styles.selectAllText}>
                  {tempSelected.length === folders.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.selectedCount}>
                {tempSelected.length} of {folders.length} selected
              </Text>
            </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {loading ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading photo folders...</Text>
              </Animated.View>
            ) : error ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                {Platform.OS !== 'web' && (
                  <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            ) : folders.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContainer}>
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
                      tempSelected.includes(folder.id) && styles.folderItemSelected
                    ]}
                    onPress={() => toggleFolder(folder.id)}
                  >
                    <View style={styles.folderIcon}>
                      {folder.icon}
                    </View>
                    <View style={styles.folderInfo}>
                      <Text style={styles.folderName}>{folder.name}</Text>
                      <Text style={styles.folderDescription}>{folder.description}</Text>
                      <Text style={styles.folderCount}>{folder.count} photos</Text>
                    </View>
                    <View style={styles.folderCountBadge}>
                      <Text style={styles.countText}>{folder.count}</Text>
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
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.confirmButton,
                (tempSelected.length === 0 || error || isScanning) && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={tempSelected.length === 0 || !!error || isScanning}
            >
              <Text style={styles.confirmButtonText}>
                {isScanning 
                  ? `Scanning... ${scanProgress.current}/${scanProgress.total}`
                  : `Apply (${tempSelected.length})`
                }
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* NSFW Scanning Progress */}
          {isScanning && (
            <View style={styles.scanningOverlay}>
              <View style={styles.scanningContent}>
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: lightTheme.colors.background,
    borderTopLeftRadius: lightTheme.borderRadius.xl,
    borderTopRightRadius: lightTheme.borderRadius.xl,
    minHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  closeButton: {
    padding: lightTheme.spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
    paddingVertical: lightTheme.spacing.md,
    backgroundColor: lightTheme.colors.surface,
  },
  selectAllButton: {
    paddingVertical: lightTheme.spacing.xs,
  },
  selectAllText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.primary,
  },
  selectedCount: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  content: {
    flex: 1,
    padding: lightTheme.spacing.lg,
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
  errorContainer: {
    paddingVertical: lightTheme.spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: lightTheme.colors.error,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: lightTheme.spacing.md,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.lg,
    paddingVertical: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  emptyContainer: {
    paddingVertical: lightTheme.spacing.xl,
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
    lineHeight: 20,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  folderItemSelected: {
    borderColor: lightTheme.colors.primary,
    backgroundColor: `${lightTheme.colors.primary}10`,
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightTheme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: lightTheme.spacing.md,
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: 2,
  },
  folderDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    marginBottom: 2,
  },
  folderCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    opacity: 0.7,
  },
  folderCountBadge: {
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.sm,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    marginRight: lightTheme.spacing.sm,
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
    backgroundColor: lightTheme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: lightTheme.spacing.lg,
    gap: lightTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: lightTheme.colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.surface,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.textSecondary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.primary,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: lightTheme.colors.border,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
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
    padding: lightTheme.spacing.xl,
  },
  scanningContent: {
    backgroundColor: lightTheme.colors.background,
    borderRadius: lightTheme.borderRadius.xl,
    padding: lightTheme.spacing.xl,
    alignItems: 'center',
    minWidth: 280,
  },
  scanningTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
  },
  scanningMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.lg,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: lightTheme.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: lightTheme.spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: lightTheme.colors.primary,
  },
  scanningNote: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});