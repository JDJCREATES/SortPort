import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeInDown, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';
import { AppTheme } from '../../types';
import { useApp } from '../../contexts/AppContext';

interface DataManagementSectionProps {
  handleClearData: () => void;
}

// Custom Modal Component
interface CustomModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  icon: string;
  iconColor: string;
  confirmText: string;
  onConfirm: () => void;
  isDestructive?: boolean;
  theme: AppTheme;
}

function CustomModal({ 
  visible, 
  onClose, 
  title, 
  message, 
  icon, 
  iconColor, 
  confirmText, 
  onConfirm, 
  isDestructive = false,
  theme 
}: CustomModalProps) {
  const styles = createModalStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View entering={FadeInUp.delay(100)} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
              <Ionicons name={icon as any} size={32} color={iconColor} />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
          </View>

          <Animated.View entering={FadeInDown.delay(200)} style={styles.modalContent}>
            <Text style={styles.modalMessage}>{message}</Text>
          </Animated.View>

          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.confirmButton, 
                isDestructive && styles.destructiveButton
              ]} 
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.confirmButtonText,
                isDestructive && styles.destructiveButtonText
              ]}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DataManagementSection({ handleClearData }: DataManagementSectionProps) {
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [isClearing, setIsClearing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const { userProfile, clearAllAppData, deleteUserAccount } = useApp();

  // Animation values
  const clearButtonScale = useSharedValue(1);
  const deleteButtonScale = useSharedValue(1);
  const clearButtonOpacity = useSharedValue(1);
  const deleteButtonOpacity = useSharedValue(1);

  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    return unsubscribe;
  }, []);

  const styles = React.useMemo(() => createStyles(currentTheme), [currentTheme]);

  // Animated styles
  const clearButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: clearButtonScale.value }],
    opacity: clearButtonOpacity.value,
  }));

  const deleteButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: deleteButtonScale.value }],
    opacity: deleteButtonOpacity.value,
  }));

  const handleClearDataPress = () => {
    clearButtonScale.value = withSpring(0.95, { duration: 100 }, () => {
      clearButtonScale.value = withSpring(1);
    });
    setShowClearModal(true);
  };

  const handleDeleteAccountPress = () => {
    deleteButtonScale.value = withSpring(0.95, { duration: 100 }, () => {
      deleteButtonScale.value = withSpring(1);
    });
    setShowDeleteModal(true);
  };

  const confirmClearData = async () => {
    setShowClearModal(false);
    setIsClearing(true);
    clearButtonOpacity.value = withTiming(0.6);

    try {
      await clearAllAppData();
      handleClearData();

      // Success modal
      Alert.alert(
        '✅ Data Cleared',
        'All your data has been successfully cleared.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error clearing data:', error);
      Alert.alert(
        '❌ Error',
        'Failed to clear some data. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsClearing(false);
      clearButtonOpacity.value = withTiming(1);
    }
  };

  const handleDeleteConfirm = () => {
    setShowDeleteModal(false);
    setShowDeleteConfirmModal(true);
  };

  const executeDeleteAccount = async () => {
    if (!userProfile) {
      Alert.alert('Error', 'No user found to delete.');
      return;
    }

    console.log('🗑️ Starting account deletion for user:', userProfile.id, userProfile.email);
    
    setShowDeleteConfirmModal(false);
    setIsDeleting(true);
    deleteButtonOpacity.value = withTiming(0.6);

    try {
      await deleteUserAccount();

      // Show success with detailed info
      Alert.alert(
        '✅ Account Permanently Deleted',
        'Your account has been completely removed from our servers. This action cannot be undone.\n\nYou can create a new account with the same email address if desired.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ Error deleting account:', error);
      
      // Show detailed error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      Alert.alert(
        '❌ Deletion Failed',
        `Failed to delete your account:\n\n${errorMessage}\n\nPlease try again or contact support if the problem persists.`,
        [
          { text: 'OK' },
          { 
            text: 'Retry', 
            onPress: () => {
              // Reset state and allow retry
              setIsDeleting(false);
              deleteButtonOpacity.value = withTiming(1);
            }
          }
        ]
      );
    } finally {
      setIsDeleting(false);
      deleteButtonOpacity.value = withTiming(1);
    }
  };

  return (
    <>
      <Animated.View entering={FadeInUp.delay(400)} style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>
        
        <View style={styles.buttonContainer}>
          {/* Clear Data Button */}
          <Animated.View style={[clearButtonAnimatedStyle]}>
            <TouchableOpacity 
              style={[styles.dangerButton, isClearing && styles.buttonDisabled]} 
              onPress={handleClearDataPress}
              disabled={isClearing || isDeleting}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isClearing ? "hourglass" : "trash"} 
                size={20} 
                color={currentTheme.colors.error} 
              />
              <Text style={styles.dangerButtonText}>
                {isClearing ? 'Clearing Data...' : 'Clear All Data'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Delete Account Button */}
          <Animated.View style={[deleteButtonAnimatedStyle]}>
            <TouchableOpacity 
              style={[styles.deleteAccountButton, isDeleting && styles.buttonDisabled]} 
              onPress={handleDeleteAccountPress}
              disabled={isClearing || isDeleting || !userProfile}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isDeleting ? "hourglass" : "person-remove"} 
                size={20} 
                color="#fff" 
              />
              <Text style={styles.deleteAccountButtonText}>
                {isDeleting ? 'Deleting Account...' : 'Delete Account'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Info Text */}
        <Animated.View entering={FadeInUp.delay(600)} style={styles.infoContainer}>
          <Ionicons name="information-circle" size={16} color={currentTheme.colors.textSecondary} />
          <Text style={styles.infoText}>
            Your photos remain safe in your device gallery regardless of these actions.
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Clear Data Modal */}
      <CustomModal
        visible={showClearModal}
        onClose={() => setShowClearModal(false)}
        title="Clear All Data"
        message="This will permanently delete:

• All your sorted albums
• NSFW filter results  
• App settings and preferences
• Cached image data

Your photos will remain in your device gallery.

This action cannot be undone."
        icon="trash"
        iconColor={currentTheme.colors.error}
        confirmText="Clear Data"
        onConfirm={confirmClearData}
        isDestructive={true}
        theme={currentTheme}
      />

      {/* Delete Account Modal */}
      <CustomModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Account"
        message="This will permanently delete your account and:

• Remove your profile from our servers
• Delete all your sorted albums
• Clear all NSFW filter results
• Remove all app settings
• Sign you out immediately

Your photos will remain in your device gallery.

⚠️ THIS ACTION CANNOT BE UNDONE"
        icon="person-remove"
        iconColor={currentTheme.colors.error}
        confirmText="I understand, delete my account"
        onConfirm={handleDeleteConfirm}
        isDestructive={true}
        theme={currentTheme}
      />

      {/* Final Confirmation Modal */}
      <CustomModal
        visible={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        title="Final Confirmation"
        message="Are you absolutely sure you want to delete your account?

This is your last chance to cancel."
        icon="warning"
        iconColor={currentTheme.colors.error}
        confirmText="Yes, delete forever"
        onConfirm={executeDeleteAccount}
        isDestructive={true}
        theme={currentTheme}
      />
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  buttonContainer: {
    gap: theme.spacing.md,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: theme.colors.error + '20',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    elevation: 2,
    shadowColor: theme.colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dangerButtonText: {
    color: theme.colors.error,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  deleteAccountButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});

const createModalStyles = (theme: AppTheme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.xl,
    width: '100%',
    maxWidth: 400,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  modalHeader: {
    alignItems: 'center',
    padding: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  modalContent: {
    padding: theme.spacing.xl,
  },
  modalMessage: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 24,
    textAlign: 'left',
  },
  modalActions: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    elevation: 2,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  destructiveButton: {
    backgroundColor: theme.colors.error,
    shadowColor: theme.colors.error,
  },
  destructiveButtonText: {
    color: '#fff',
  },
});