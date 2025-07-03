import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert } from 'react-native';
import { Folder, Check, X, HardDrive, Smartphone, Camera, Download } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Platform } from 'react-native';
import { PhotoLoader } from '../utils/photoLoader';
import { lightTheme } from '../utils/theme';

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
  const [folders, setFolders] = useState<SourceFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedFolders);
  const [error, setError] = useState<string | null>(null);

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
        let icon = <Folder size={20} color={lightTheme.colors.primary} />;
        let description = `${folder.count} photos`;

        // Assign specific icons based on folder name
        if (folder.name.toLowerCase().includes('camera')) {
          icon = <Camera size={20} color={lightTheme.colors.secondary} />;
          description = 'Photos taken with camera';
        } else if (folder.name.toLowerCase().includes('download')) {
          icon = <Download size={20} color={lightTheme.colors.warning} />;
          description = 'Downloaded images';
        } else if (folder.name.toLowerCase().includes('screenshot')) {
          icon = <HardDrive size={20} color={lightTheme.colors.success} />;
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
    const selectedFolderObjects = folders.filter(folder => 
      tempSelected.includes(folder.id)
    );
    onSelect(selectedFolderObjects);
    onClose();
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
              <X size={24} color={lightTheme.colors.textSecondary} />
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
                        <Check size={20} color="white" />
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
                (tempSelected.length === 0 || error) && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={tempSelected.length === 0 || !!error}
            >
              <Text style={styles.confirmButtonText}>
                Apply ({tempSelected.length})
              </Text>
            </TouchableOpacity>
          </View>
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
});