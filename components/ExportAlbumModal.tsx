import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { X, Download, TriangleAlert as AlertTriangle, FolderPlus } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ImageMeta } from '../types';
import { MediaStorage } from '../utils/mediaStorage';
import { lightTheme } from '../utils/theme';

interface ExportAlbumModalProps {
  visible: boolean;
  onClose: () => void;
  albumName: string;
  photos: ImageMeta[];
}

export function ExportAlbumModal({
  visible,
  onClose,
  albumName,
  photos,
}: ExportAlbumModalProps) {
  const [exportFolderName, setExportFolderName] = useState(albumName);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!exportFolderName.trim()) {
      Alert.alert('Invalid Name', 'Please enter a valid folder name for the export.');
      return;
    }

    if (photos.length === 0) {
      Alert.alert('No Photos', 'This album contains no photos to export.');
      return;
    }

    setIsExporting(true);

    try {
      await MediaStorage.saveAlbumToDevice(photos, exportFolderName.trim());
      
      Alert.alert(
        'Export Successful! 📱',
        `Successfully exported ${photos.length} photos to "${exportFolderName}" album on your device.`,
        [
          {
            text: 'Great!',
            onPress: onClose,
          },
        ]
      );
    } catch (error: any) {
      console.error('Export failed:', error);
      
      let errorMessage = 'An unexpected error occurred while exporting the album.';
      
      if (error.message.includes('permission')) {
        errorMessage = 'Permission denied. Please grant photo library access in your device settings and try again.';
      } else if (error.message.includes('web')) {
        errorMessage = 'Album export is only available on mobile devices. Please use the mobile app.';
      } else if (error.message.includes('accessible')) {
        errorMessage = 'Some photos could not be accessed. They may have been moved or deleted.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(
        'Export Failed',
        errorMessage,
        [
          { text: 'OK' },
          {
            text: 'Try Again',
            onPress: () => handleExport(),
          },
        ]
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View entering={FadeInUp.delay(100)} style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <FolderPlus size={24} color={lightTheme.colors.primary} />
              <Text style={styles.title}>Export Album</Text>
            </View>
            <TouchableOpacity 
              onPress={handleClose} 
              style={styles.closeButton}
              disabled={isExporting}
            >
              <X size={24} color={lightTheme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Album Info */}
            <Animated.View entering={FadeInDown.delay(200)} style={styles.albumInfo}>
              <Text style={styles.albumInfoTitle}>Album: {albumName}</Text>
              <Text style={styles.albumInfoSubtitle}>{photos.length} photos</Text>
            </Animated.View>

            {/* Warning */}
            <Animated.View entering={FadeInDown.delay(300)} style={styles.warningContainer}>
              <AlertTriangle size={20} color={lightTheme.colors.warning} />
              <Text style={styles.warningText}>
                Warning: Exporting this album will create new copies of these photos in a new album on your device. This will increase storage usage.
              </Text>
            </Animated.View>

            {/* Folder Name Input */}
            <Animated.View entering={FadeInDown.delay(400)} style={styles.inputSection}>
              <Text style={styles.inputLabel}>Export to Album:</Text>
              <TextInput
                style={[styles.textInput, isExporting && styles.textInputDisabled]}
                value={exportFolderName}
                onChangeText={setExportFolderName}
                placeholder="Enter album name..."
                placeholderTextColor={lightTheme.colors.textSecondary}
                editable={!isExporting}
                maxLength={50}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <Text style={styles.inputHint}>
                If an album with this name exists, photos will be added to it.
              </Text>
            </Animated.View>

            {/* Export Details */}
            <Animated.View entering={FadeInDown.delay(500)} style={styles.detailsSection}>
              <Text style={styles.detailsTitle}>Export Details:</Text>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>• Photos to export:</Text>
                <Text style={styles.detailValue}>{photos.length}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>• Destination:</Text>
                <Text style={styles.detailValue}>Device Photo Library</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>• Album name:</Text>
                <Text style={styles.detailValue}>"{exportFolderName || 'Enter name'}"</Text>
              </View>
            </Animated.View>
          </ScrollView>

          {/* Action Buttons */}
          <Animated.View entering={FadeInDown.delay(600)} style={styles.footer}>
            <TouchableOpacity 
              style={[styles.cancelButton, isExporting && styles.buttonDisabled]}
              onPress={handleClose}
              disabled={isExporting}
            >
              <Text style={[styles.cancelButtonText, isExporting && styles.buttonTextDisabled]}>
                Cancel
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.exportButton, 
                isExporting && styles.exportButtonLoading,
                (!exportFolderName.trim() || photos.length === 0) && styles.exportButtonDisabled
              ]}
              onPress={handleExport}
              disabled={isExporting || !exportFolderName.trim() || photos.length === 0}
            >
              {isExporting ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.exportButtonText}>Exporting...</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Download size={20} color="white" />
                  <Text style={styles.exportButtonText}>Export Album</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
  },
  container: {
    backgroundColor: lightTheme.colors.background,
    borderRadius: lightTheme.borderRadius.xl,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  closeButton: {
    padding: lightTheme.spacing.xs,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.surface,
  },
  content: {
    flex: 1,
    padding: lightTheme.spacing.lg,
  },
  albumInfo: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: lightTheme.colors.primary,
  },
  albumInfoTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  albumInfoSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${lightTheme.colors.warning}15`,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.lg,
    borderWidth: 1,
    borderColor: `${lightTheme.colors.warning}30`,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.warning,
    lineHeight: 20,
    marginLeft: lightTheme.spacing.sm,
  },
  inputSection: {
    marginBottom: lightTheme.spacing.lg,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  textInput: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    paddingHorizontal: lightTheme.spacing.lg,
    paddingVertical: lightTheme.spacing.md,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.text,
    borderWidth: 2,
    borderColor: lightTheme.colors.border,
    marginBottom: lightTheme.spacing.sm,
  },
  textInputDisabled: {
    opacity: 0.6,
    backgroundColor: lightTheme.colors.border,
  },
  inputHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    lineHeight: 16,
  },
  detailsSection: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
  },
  detailsTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    textAlign: 'right',
    flex: 1,
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
    borderRadius: lightTheme.borderRadius.lg,
    backgroundColor: lightTheme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: lightTheme.colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.textSecondary,
  },
  exportButton: {
    flex: 2,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.lg,
    backgroundColor: lightTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  exportButtonLoading: {
    backgroundColor: lightTheme.colors.primary,
    opacity: 0.8,
  },
  exportButtonDisabled: {
    backgroundColor: lightTheme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  exportButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: 'white',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonTextDisabled: {
    opacity: 0.6,
  },
});