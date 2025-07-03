import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Crown, Clock as Unlock, RefreshCw, Trash2, Palette, Settings as SettingsIcon, LogOut, User, Folder, LogIn } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SubscriptionModal } from '../../components/SubscriptionModal';
import { ColorPicker } from '../../components/ColorPicker';
import { AuthModal } from '../../components/AuthModal';
import { SourceFolderPicker } from '../../components/SourceFolderPicker';
import { UserFlags, AppSettings } from '../../types';
import { RevenueCatManager } from '../../utils/revenuecat';
import { MediaStorage } from '../../utils/mediaStorage';
import { SupabaseAuth, UserProfile } from '../../utils/supabase';
import { lightTheme, updateThemeColors } from '../../utils/theme';

export default function SettingsScreen() {
  const [userFlags, setUserFlags] = useState<UserFlags>({
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  });
  const [settings, setSettings] = useState<AppSettings>({
    darkMode: false,
    autoSort: false,
    nsfwFilter: true,
    notifications: true,
    customColors: undefined,
    selectedFolders: ['all_photos'],
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<'primary' | 'secondary' | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<string[]>(['all_photos']);

  useEffect(() => {
    loadUserFlags();
    loadSettings();
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    setIsLoadingProfile(true);
    try {
      const profile = await SupabaseAuth.getProfile();
      setUserProfile(profile);
    } catch (error: any) {
      console.error('Error loading user profile:', error);
      // Don't show error to user - just treat as not logged in
      setUserProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const loadUserFlags = async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const flags = await revenueCat.getUserFlags();
      setUserFlags(flags);
    } catch (error) {
      console.error('Error loading user flags:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const savedSettings = await MediaStorage.loadSettings();
      setSettings(savedSettings);
      setSelectedFolders(savedSettings.selectedFolders || ['all_photos']);
      
      // Apply custom colors if they exist
      if (savedSettings.customColors) {
        updateThemeColors(savedSettings.customColors, savedSettings.darkMode);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const updateSetting = async (key: keyof AppSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await MediaStorage.saveSettings(newSettings);
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Always clear the local user profile state first
              setUserProfile(null);
              
              // Attempt to sign out from Supabase
              await SupabaseAuth.signOut();
              
              Alert.alert('Signed Out', 'You have been signed out successfully.');
            } catch (error: any) {
              console.error('Sign out error:', error);
              
              // Even if sign out fails, we've already cleared the local state
              // This ensures the UI reflects the signed-out state
              Alert.alert(
                'Session Cleared', 
                'Your local session has been cleared. If you continue to experience issues, please restart the app.'
              );
            }
          },
        },
      ]
    );
  };

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
    await loadUserFlags();
    setShowSubscriptionModal(false);
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    await loadUserProfile();
  };

  const handleSourceFolderSelect = async (folders: any[]) => {
    const folderIds = folders.map(f => f.id);
    setSelectedFolders(folderIds);
    
    // Save folder preferences to settings
    const newSettings = { ...settings, selectedFolders: folderIds };
    await MediaStorage.saveSettings(newSettings);
    
    Alert.alert('Sources Updated', `Now managing ${folders.length} photo sources.`);
  };

  const handleRestorePurchases = async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      await revenueCat.restorePurchases();
      await loadUserFlags();
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

  const canUseColorPicker = userFlags.isSubscribed || userFlags.hasUnlockPack;

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
        <View style={styles.headerLeft}>
          <SettingsIcon size={24} color={lightTheme.colors.primary} />
          <Text style={styles.title}>Settings</Text>
        </View>
      </Animated.View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* User Profile */}
        <Animated.View entering={FadeInUp.delay(150)} style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          {isLoadingProfile ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>Loading account...</Text>
            </View>
          ) : userProfile ? (
            <View style={styles.profileCard}>
              <View style={styles.profileHeader}>
                <User size={24} color={lightTheme.colors.primary} />
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>
                    {userProfile.full_name || 'User'}
                  </Text>
                  <Text style={styles.profileEmail}>{userProfile.email}</Text>
                </View>
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                  <LogOut size={16} color={lightTheme.colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.signInCard}
              onPress={() => setShowAuthModal(true)}
            >
              <LogIn size={24} color={lightTheme.colors.primary} />
              <View style={styles.signInInfo}>
                <Text style={styles.signInTitle}>Sign In to SnapSort</Text>
                <Text style={styles.signInDescription}>
                  Sync your albums across devices and access premium features
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Source Management */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.section}>
          <Text style={styles.sectionTitle}>Photo Sources</Text>
          
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => setShowSourcePicker(true)}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Manage Photo Sources</Text>
              <Text style={styles.settingDescription}>
                Choose which folders SnapSort should organize ({selectedFolders.length} selected)
              </Text>
            </View>
            <Folder size={20} color={lightTheme.colors.primary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Subscription Status */}
        <Animated.View entering={FadeInUp.delay(250)} style={styles.section}>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          
          <TouchableOpacity 
            style={styles.premiumCard}
            onPress={() => setShowSubscriptionModal(true)}
          >
            <View style={styles.premiumHeader}>
              <Crown size={24} color={lightTheme.colors.warning} />
              <View style={styles.premiumInfo}>
                <Text style={styles.premiumTitle}>SnapSort Pro</Text>
                <Text style={styles.premiumStatus}>
                  {userFlags.isSubscribed ? 'Active' : 'Not Active'}
                </Text>
              </View>
              {!userFlags.isSubscribed && (
                <View style={styles.upgradeButton}>
                  <Text style={styles.upgradeButtonText}>$2.99/mo</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.premiumCard}
            onPress={() => setShowSubscriptionModal(true)}
          >
            <View style={styles.premiumHeader}>
              <Unlock size={24} color={lightTheme.colors.primary} />
              <View style={styles.premiumInfo}>
                <Text style={styles.premiumTitle}>Unlock Pack</Text>
                <Text style={styles.premiumStatus}>
                  {userFlags.hasUnlockPack ? 'Owned' : 'Not Owned'}
                </Text>
              </View>
              {!userFlags.hasUnlockPack && (
                <View style={styles.upgradeButton}>
                  <Text style={styles.upgradeButtonText}>$9.99</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.restoreButton} onPress={handleRestorePurchases}>
            <RefreshCw size={16} color={lightTheme.colors.primary} />
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Customization */}
        <Animated.View entering={FadeInUp.delay(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>Customization</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Primary Color</Text>
              <Text style={styles.settingDescription}>
                {canUseColorPicker ? 'Customize your app\'s primary color' : 'Premium feature - upgrade to customize'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.colorPreview, { backgroundColor: settings.customColors?.primary || lightTheme.colors.primary }]}
              onPress={() => canUseColorPicker ? setShowColorPicker('primary') : setShowSubscriptionModal(true)}
            >
              <Palette size={16} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Secondary Color</Text>
              <Text style={styles.settingDescription}>
                {canUseColorPicker ? 'Customize your app\'s secondary color' : 'Premium feature - upgrade to customize'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.colorPreview, { backgroundColor: settings.customColors?.secondary || lightTheme.colors.secondary }]}
              onPress={() => canUseColorPicker ? setShowColorPicker('secondary') : setShowSubscriptionModal(true)}
            >
              <Palette size={16} color="white" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* App Settings */}
        <Animated.View entering={FadeInUp.delay(350)} style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Dark Mode</Text>
              <Text style={styles.settingDescription}>Toggle dark theme</Text>
            </View>
            <Switch
              value={settings.darkMode}
              onValueChange={(value) => updateSetting('darkMode', value)}
              trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
            />
          </View>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => !userFlags.isSubscribed && setShowSubscriptionModal(true)}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto Sort</Text>
              <Text style={styles.settingDescription}>
                {userFlags.isSubscribed ? 'Automatically sort new photos' : 'Premium feature - upgrade to enable'}
              </Text>
            </View>
            <Switch
              value={settings.autoSort && userFlags.isSubscribed}
              onValueChange={(value) => {
                if (userFlags.isSubscribed) {
                  updateSetting('autoSort', value);
                }
                // Don't return anything (void)
              }}
              disabled={!userFlags.isSubscribed}
              trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
            />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => !userFlags.hasUnlockPack && setShowSubscriptionModal(true)}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>NSFW Filter</Text>
              <Text style={styles.settingDescription}>
                {userFlags.hasUnlockPack ? 'Show/hide NSFW content' : 'Unlock Pack required'}
              </Text>
            </View>
            <Switch
              value={!settings.nsfwFilter && userFlags.hasUnlockPack}
              onValueChange={(value) => {
                if (userFlags.hasUnlockPack) {
                  updateSetting('nsfwFilter', !value);
                }
                // Don't return anything (void)
              }}
              disabled={!userFlags.hasUnlockPack}
              trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Data Management */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
            <Trash2 size={20} color={lightTheme.colors.error} />
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </Animated.View>

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
  section: {
    marginBottom: lightTheme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
  },
  loadingCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  loadingText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  profileCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.sm,
  },
  profileName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  signOutButton: {
    padding: lightTheme.spacing.sm,
  },
  signInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: `${lightTheme.colors.primary}20`,
  },
  signInInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.md,
  },
  signInTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  signInDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    lineHeight: 20,
  },
  premiumCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.sm,
  },
  premiumTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  premiumStatus: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  upgradeButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.md,
    paddingVertical: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: lightTheme.spacing.sm,
    gap: lightTheme.spacing.xs,
  },
  restoreButtonText: {
    color: lightTheme.colors.primary,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  settingDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    gap: lightTheme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  dangerButtonText: {
    color: lightTheme.colors.error,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
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