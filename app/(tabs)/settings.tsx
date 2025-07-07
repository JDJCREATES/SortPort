import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { SubscriptionModal } from '../../components/SubscriptionModal';
import { ColorPicker } from '../../components/ColorPicker';
import { AuthModal } from '../../components/AuthModal';
import { SourceFolderPicker } from '../../components/SourceFolderPicker';
import { AccountSection } from '../../components/settings/AccountSection';
import { SourceManagementSection } from '../../components/settings/SourceManagementSection';
import { PremiumFeaturesSection } from '../../components/settings/PremiumFeaturesSection';
import { CustomizationSection } from '../../components/settings/CustomizationSection';
import { AppSettingsSection } from '../../components/settings/AppSettingsSection';
import { DataManagementSection } from '../../components/settings/DataManagementSection';
import { RevenueCatManager } from '../../utils/revenuecat';
import { MediaStorage } from '../../utils/mediaStorage';
import { lightTheme, updateThemeColors } from '../../utils/theme';

export default function SettingsScreen() {
  const { 
    userFlags, 
    settings, 
    userProfile, 
    isLoadingAuth,
    updateSetting,
    refreshUserFlags,
    refreshUserProfile,
    signOut,
    ensureAllPhotosAlbum
  } = useApp();
  
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<'primary' | 'secondary' | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<string[]>(['all_photos']);

  React.useEffect(() => {
    setSelectedFolders(settings.selectedFolders || ['all_photos']);
    
    // Apply custom colors if they exist
    if (settings.customColors) {
      updateThemeColors(settings.customColors, settings.darkMode);
    }
  }, [settings]);

  const handleColorChange = async (colorType: 'primary' | 'secondary', color: string) => {
    if (!userFlags.isSubscribed && !userFlags.hasUnlockPack) {
      setShowSubscriptionModal(true);
      return;
    }

    const newCustomColors = {
      ...settings.customColors,
      [colorType]: color,
    };

    await updateSetting('customColors', newCustomColors);
    updateThemeColors(newCustomColors, settings.darkMode);
  };

  const handleSubscriptionSuccess = async () => {
    await refreshUserFlags();
    setShowSubscriptionModal(false);
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    await refreshUserProfile();
  };

  const handleSourceFolderSelect = async (folders: any[]) => {
    const folderIds = folders.map(f => f.id);
    setSelectedFolders(folderIds);
    
    // Update settings and ensure All Photos album is updated
    await updateSetting('selectedFolders', folderIds);
    await ensureAllPhotosAlbum();
    
    Alert.alert('Sources Updated', `Now managing ${folders.length} photo sources.`);
  };

  const handleRestorePurchases = async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      await revenueCat.restorePurchases();
      await refreshUserFlags();
      Alert.alert('Restore Complete', 'Your purchases have been restored.');
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Restore Failed', 'No purchases found to restore.');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your albums and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await MediaStorage.clearAllData();
              Alert.alert('Data Cleared', 'All local data has been removed.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="settings" size={24} color={lightTheme.colors.primary} />
          <Text style={styles.title}>Settings</Text>
        </View>
      </Animated.View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <AccountSection
          userProfile={userProfile}
          isLoadingProfile={isLoadingAuth}
          signOut={signOut}
          setShowAuthModal={setShowAuthModal}
        />

        <SourceManagementSection
          selectedFolders={selectedFolders}
          setShowSourcePicker={setShowSourcePicker}
        />

        <PremiumFeaturesSection
          userFlags={userFlags}
          setShowSubscriptionModal={setShowSubscriptionModal}
          handleRestorePurchases={handleRestorePurchases}
        />

        <CustomizationSection
          userFlags={userFlags}
          settings={settings}
          setShowColorPicker={setShowColorPicker}
          setShowSubscriptionModal={setShowSubscriptionModal}
        />

        <AppSettingsSection
          userFlags={userFlags}
          settings={settings}
          updateSetting={updateSetting}
          setShowSubscriptionModal={setShowSubscriptionModal}
        />

        <DataManagementSection
          handleClearData={handleClearData}
        />

        <Animated.View entering={FadeInUp.delay(450)} style={styles.footer}>
          <Text style={styles.footerText}>SnapSort v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Your photos stay on your device. Only AI analysis metadata is stored securely.
          </Text>
        </Animated.View>
      </ScrollView>

      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSuccess={handleSubscriptionSuccess}
      />

      {showColorPicker && (
        <ColorPicker
          visible={!!showColorPicker}
          onClose={() => setShowColorPicker(null)}
          onColorSelect={(color) => handleColorChange(showColorPicker, color)}
          currentColor={
            showColorPicker === 'primary' 
              ? settings.customColors?.primary || lightTheme.colors.primary
              : settings.customColors?.secondary || lightTheme.colors.secondary
          }
          title={`Choose ${showColorPicker === 'primary' ? 'Primary' : 'Secondary'} Color`}
        />
      )}

      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        initialMode="signin"
      />

      <SourceFolderPicker
        visible={showSourcePicker}
        onClose={() => setShowSourcePicker(false)}
        onSelect={handleSourceFolderSelect}
        selectedFolders={selectedFolders}
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
    paddingHorizontal: lightTheme.spacing.lg,
    paddingTop: lightTheme.spacing.lg,
    paddingBottom: lightTheme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: lightTheme.spacing.lg,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: lightTheme.spacing.xl,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  footerSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    marginTop: lightTheme.spacing.xs,
    paddingHorizontal: lightTheme.spacing.lg,
    lineHeight: 16,
  },
});