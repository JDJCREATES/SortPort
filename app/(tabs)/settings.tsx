import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Crown, Clock as Unlock, RefreshCw, Trash2, Palette, Settings as SettingsIcon } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { PremiumPrompt } from '../../components/PremiumPrompt';
import { ColorPicker } from '../../components/ColorPicker';
import { UserFlags, AppSettings } from '../../types';
import { RevenueCatManager } from '../../utils/revenuecat';
import { MediaStorage } from '../../utils/mediaStorage';
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
  });
  const [showPremiumPrompt, setShowPremiumPrompt] = useState<'subscription' | 'unlock' | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<'primary' | 'secondary' | null>(null);

  useEffect(() => {
    loadUserFlags();
    loadSettings();
  }, []);

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

  const handleColorChange = async (colorType: 'primary' | 'secondary', color: string) => {
    if (!userFlags.isSubscribed && !userFlags.hasUnlockPack) {
      Alert.alert(
        'Premium Feature',
        'Custom colors require SnapSort Pro or the Unlock Pack.',
        [
          { text: 'Cancel' },
          { text: 'Upgrade', onPress: () => setShowPremiumPrompt('subscription') },
        ]
      );
      return;
    }

    const newCustomColors = {
      ...settings.customColors,
      [colorType]: color,
    };

    await updateSetting('customColors', newCustomColors);
    updateThemeColors(newCustomColors, settings.darkMode);
  };

  const handleSubscribe = () => {
    if (userFlags.isSubscribed) {
      Alert.alert('Already Subscribed', 'You already have SnapSort Pro!');
      return;
    }
    setShowPremiumPrompt('subscription');
  };

  const handleUnlock = () => {
    if (userFlags.hasUnlockPack) {
      Alert.alert('Already Unlocked', 'You already have the Unlock Pack!');
      return;
    }
    setShowPremiumPrompt('unlock');
  };

  const handlePurchase = async (type: 'subscription' | 'unlock') => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const productId = type === 'subscription' ? 'snapsort_pro_monthly' : 'unlock_pack';
      
      // Mock purchase for demo
      revenueCat.mockPurchase(type);
      
      await loadUserFlags();
      setShowPremiumPrompt(null);
      
      Alert.alert(
        'Purchase Successful!',
        type === 'subscription' 
          ? 'Welcome to SnapSort Pro!' 
          : 'Unlock Pack activated!'
      );
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Purchase Failed', 'Please try again later.');
    }
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
            await MediaStorage.clearAllData();
            Alert.alert('Data Cleared', 'All data has been removed.');
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
        {/* Subscription Status */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.section}>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          
          <View style={styles.premiumCard}>
            <View style={styles.premiumHeader}>
              <Crown size={24} color={lightTheme.colors.warning} />
              <View style={styles.premiumInfo}>
                <Text style={styles.premiumTitle}>SnapSort Pro</Text>
                <Text style={styles.premiumStatus}>
                  {userFlags.isSubscribed ? 'Active' : 'Not Active'}
                </Text>
              </View>
              {!userFlags.isSubscribed && (
                <TouchableOpacity style={styles.upgradeButton} onPress={handleSubscribe}>
                  <Text style={styles.upgradeButtonText}>$2.99/mo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.premiumCard}>
            <View style={styles.premiumHeader}>
              <Unlock size={24} color={lightTheme.colors.primary} />
              <View style={styles.premiumInfo}>
                <Text style={styles.premiumTitle}>Unlock Pack</Text>
                <Text style={styles.premiumStatus}>
                  {userFlags.hasUnlockPack ? 'Owned' : 'Not Owned'}
                </Text>
              </View>
              {!userFlags.hasUnlockPack && (
                <TouchableOpacity style={styles.upgradeButton} onPress={handleUnlock}>
                  <Text style={styles.upgradeButtonText}>$9.99</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

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
                {canUseColorPicker ? 'Customize your app\'s primary color' : 'Pro feature - upgrade to customize'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.colorPreview, { backgroundColor: settings.customColors?.primary || lightTheme.colors.primary }]}
              onPress={() => canUseColorPicker && setShowColorPicker('primary')}
              disabled={!canUseColorPicker}
            >
              <Palette size={16} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Secondary Color</Text>
              <Text style={styles.settingDescription}>
                {canUseColorPicker ? 'Customize your app\'s secondary color' : 'Pro feature - upgrade to customize'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.colorPreview, { backgroundColor: settings.customColors?.secondary || lightTheme.colors.secondary }]}
              onPress={() => canUseColorPicker && setShowColorPicker('secondary')}
              disabled={!canUseColorPicker}
            >
              <Palette size={16} color="white" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* App Settings */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.section}>
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

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto Sort</Text>
              <Text style={styles.settingDescription}>
                {userFlags.isSubscribed ? 'Automatically sort new photos' : 'Pro feature - upgrade to enable'}
              </Text>
            </View>
            <Switch
              value={settings.autoSort && userFlags.isSubscribed}
              onValueChange={(value) => userFlags.isSubscribed && updateSetting('autoSort', value)}
              disabled={!userFlags.isSubscribed}
              trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>NSFW Filter</Text>
              <Text style={styles.settingDescription}>
                {userFlags.hasUnlockPack ? 'Show/hide NSFW content' : 'Unlock Pack required'}
              </Text>
            </View>
            <Switch
              value={!settings.nsfwFilter && userFlags.hasUnlockPack}
              onValueChange={(value) => userFlags.hasUnlockPack && updateSetting('nsfwFilter', !value)}
              disabled={!userFlags.hasUnlockPack}
              trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
            />
          </View>
        </Animated.View>

        {/* Data Management */}
        <Animated.View entering={FadeInUp.delay(500)} style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
            <Trash2 size={20} color={lightTheme.colors.error} />
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(600)} style={styles.footer}>
          <Text style={styles.footerText}>SnapSort v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Note: RevenueCat integration requires native code and won't work in the web preview.
          </Text>
        </Animated.View>
      </ScrollView>

      {showPremiumPrompt && (
        <View style={styles.premiumPromptOverlay}>
          <PremiumPrompt
            type={showPremiumPrompt}
            onUpgrade={() => handlePurchase(showPremiumPrompt!)}
            onDismiss={() => setShowPremiumPrompt(null)}
          />
        </View>
      )}

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
  premiumPromptOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});