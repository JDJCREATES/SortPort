import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { CreditPurchaseModal } from '../../components/CreditPurchaseModal';
import { AuthModal } from '../../components/AuthModal';
import { SourceFolderPicker } from '../../components/SourceFolderPicker';
import { AccountSection } from '../../components/settings/AccountSection';
import { SourceManagementSection } from '../../components/settings/SourceManagementSection';
import { PremiumFeaturesSection } from '../../components/settings/PremiumFeaturesSection';
import { CustomizationSection } from '../../components/settings/CustomizationSection';
import { AppSettingsSection } from '../../components/settings/AppSettingsSection';
import { DataManagementSection } from '../../components/settings/DataManagementSection';
import { CreditPurchaseManager } from '../../utils/creditPurchaseManager';
import { MediaStorage } from '../../utils/mediaStorage';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';

// Types for better type safety
interface SettingsScreenState {
  showCreditPurchaseModal: boolean;
  showAuthModal: boolean;
  showSourcePicker: boolean;
  selectedFolders: string[];
  isLoading: boolean;
  error: string | null;
}

// Custom hook for settings management
const useSettingsManager = () => {
  const { 
    userFlags, 
    settings, 
    userProfile, 
    isLoadingAuth,
    updateSetting,
    refreshUserFlags,
    refreshUserProfile,
    refreshAlbums,
    signOut,
    ensureAllPhotosAlbum
  } = useApp();

  const [state, setState] = useState<SettingsScreenState>({
    showCreditPurchaseModal: false,
    showAuthModal: false,
    showSourcePicker: false,
    selectedFolders: ['all_photos'],
    isLoading: false,
    error: null,
  });

  // Memoized theme manager instance
  const themeManager = useMemo(() => ThemeManager.getInstance(), []);

  // Initialize selected folders from settings
  useEffect(() => {
    try {
      setState(prev => ({
        ...prev,
        selectedFolders: settings.selectedFolders || ['all_photos']
      }));

      // Apply custom colors if they exist
      if (settings.customColors) {
        themeManager.setTheme(settings.darkMode, settings.customColors);
      }
    } catch (error) {
      console.error('Error initializing settings:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to load settings'
      }));
    }
  }, [settings, themeManager]);

  // Error handling wrapper
  const withErrorHandling = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    errorMessage: string
  ) => {
    return async (...args: T): Promise<R | null> => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        const result = await fn(...args);
        setState(prev => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        console.error(errorMessage, error);
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: error instanceof Error ? error.message : errorMessage 
        }));
        
        Alert.alert(
          'Error',
          error instanceof Error ? error.message : errorMessage,
          [{ text: 'OK' }]
        );
        return null;
      }
    };
  }, []);

  // Credit purchase success handler
  const handleCreditPurchaseSuccess = useCallback(
    withErrorHandling(
      async () => {
        await refreshUserFlags();
        setState(prev => ({ ...prev, showCreditPurchaseModal: false }));
      },
      'Failed to refresh user credits'
    ),
    [refreshUserFlags]
  );

  // Auth success handler
  const handleAuthSuccess = useCallback(
    withErrorHandling(
      async () => {
        setState(prev => ({ ...prev, showAuthModal: false }));
        await refreshUserProfile();
      },
      'Failed to refresh user profile'
    ),
    [refreshUserProfile]
  );

  // Source folder selection handler
  const handleSourceFolderSelect = useCallback(
    withErrorHandling(
      async (folders: Array<{ id: string; name: string }>) => {
        const folderIds = folders.map(f => f.id);
        setState(prev => ({ ...prev, selectedFolders: folderIds }));
        
        // Update settings and ensure All Photos album is updated
        await updateSetting('selectedFolders', folderIds);
        await ensureAllPhotosAlbum();
        
        Alert.alert('Sources Updated', `Now managing ${folders.length} photo sources.`);
      },
      'Failed to update photo sources'
    ),
    [updateSetting, ensureAllPhotosAlbum]
  );

  // Restore purchases handler
  const handleRestorePurchases = useCallback(
    withErrorHandling(
      async () => {
        const creditManager = CreditPurchaseManager.getInstance();
        await creditManager.restorePurchases();
        await refreshUserFlags();
        Alert.alert('Restore Complete', 'Your purchases have been restored.');
      },
      'No purchases found to restore'
    ),
    [refreshUserFlags]
  );

  // Clear data handler
  const handleClearData = useCallback(() => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your albums and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: withErrorHandling(
            async () => {
              await MediaStorage.clearAllData();
              Alert.alert('Data Cleared', 'All local data has been removed.');
            },
            'Failed to clear data'
          ),
        },
      ]
    );
  }, [withErrorHandling]);

  // Modal handlers
  const modalHandlers = useMemo(() => ({
    setShowCreditPurchaseModal: (show: boolean) => 
      setState(prev => ({ ...prev, showCreditPurchaseModal: show })),
    setShowAuthModal: (show: boolean) => 
      setState(prev => ({ ...prev, showAuthModal: show })),
    setShowSourcePicker: (show: boolean) => 
      setState(prev => ({ ...prev, showSourcePicker: show })),
  }), []);

  // Clear error handler
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    state,
    userFlags,
    settings,
    userProfile,
    isLoadingAuth,
    
    // Handlers
    handleCreditPurchaseSuccess,
    handleAuthSuccess,
    handleSourceFolderSelect,
    handleRestorePurchases,
    handleClearData,
    clearError,
    
    // Modal handlers
    ...modalHandlers,
    
    // Other functions
    signOut,
    updateSetting,
  };
};

export default function SettingsScreen(): React.ReactElement {
  const theme = getCurrentTheme();
  const {
    state,
    userFlags,
    settings,
    userProfile,
    isLoadingAuth,
    handleCreditPurchaseSuccess,
    handleAuthSuccess,
    handleSourceFolderSelect,
    handleRestorePurchases,
    handleClearData,
    clearError,
    setShowCreditPurchaseModal,
    setShowAuthModal,
    setShowSourcePicker,
    signOut,
    updateSetting,
  } = useSettingsManager();

  // Error boundary
  if (state.error) {
    return (
      <SafeAreaView style={createStyles(theme).container}>
        <View style={createStyles(theme).errorContainer}>
          <Ionicons name="warning-outline" size={48} color={theme.colors.error} />
          <Text style={createStyles(theme).errorTitle}>Something went wrong</Text>
          <Text style={createStyles(theme).errorMessage}>{state.error}</Text>
          <TouchableOpacity style={createStyles(theme).retryButton} onPress={clearError}>
            <Text style={createStyles(theme).retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Memoized styles
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="settings" size={24} color={theme.colors.primary} />
          <Text style={styles.title}>Settings</Text>
        </View>
      </Animated.View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
      >
        <AccountSection
          userProfile={userProfile}
          isLoadingProfile={isLoadingAuth}
          signOut={signOut}
          setShowAuthModal={setShowAuthModal}
        />

        <SourceManagementSection
          selectedFolders={state.selectedFolders}
          setShowSourcePicker={setShowSourcePicker}
        />

        <PremiumFeaturesSection
          userFlags={userFlags}
          setShowCreditPurchaseModal={setShowCreditPurchaseModal}
          handleRestorePurchases={handleRestorePurchases}
        />

        <CustomizationSection
          userFlags={userFlags}
          settings={settings}
          setShowCreditPurchaseModal={setShowCreditPurchaseModal}
        />

        <AppSettingsSection
          userFlags={userFlags}
          settings={settings}
          updateSetting={updateSetting}
        />

        <DataManagementSection
          handleClearData={handleClearData}
        />

        <Animated.View entering={FadeInUp.delay(450)} style={styles.footer}>
          <Text style={styles.footerText}>SortPort v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Your photos stay on your device. Only AI analysis metadata is stored securely.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Modals */}
      <CreditPurchaseModal
        visible={state.showCreditPurchaseModal}
        onClose={() => setShowCreditPurchaseModal(false)}
        onSuccess={handleCreditPurchaseSuccess}
      />

      <AuthModal
        visible={state.showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        initialMode="signin"
      />

      <SourceFolderPicker
        visible={state.showSourcePicker}
        onClose={() => setShowSourcePicker(false)}
        onSelect={handleSourceFolderSelect}
        selectedFolders={state.selectedFolders}
      />

      {/* Loading overlay */}
      {state.isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Updating settings...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    marginTop: theme.spacing.lg,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
  footerSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    lineHeight: 16,
  },
  
  // Error handling styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  errorMessage: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing.md,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  
  // Loading overlay styles
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
    textAlign: 'center',
  },
});