import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Crown, Unlock, RefreshCw, Trash2, Moon, Sun } from 'lucide-react-native';
import { PremiumPrompt } from '../../components/PremiumPrompt';
import { UserFlags } from '../../types';
import { RevenueCatManager } from '../../utils/revenuecat';
import { MediaStorage } from '../../utils/mediaStorage';
import { lightTheme } from '../../utils/theme';

export default function SettingsScreen() {
  const [userFlags, setUserFlags] = useState<UserFlags>({
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  });
  const [settings, setSettings] = useState({
    darkMode: false,
    autoSort: false,
    nsfwFilter: true,
    notifications: true,
  });
  const [showPremiumPrompt, setShowPremiumPrompt] = useState<'subscription' | 'unlock' | null>(null);

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
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const updateSetting = async (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await MediaStorage.saveSettings(newSettings);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Subscription Status */}
        <View style={styles.section}>
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
        </View>

        {/* App Settings */}
        <View style={styles.section}>
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
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
            <Trash2 size={20} color={lightTheme.colors.error} />
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>SnapSort v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Note: RevenueCat integration requires native code and won't work in the web preview.
          </Text>
        </View>
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
    padding: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.sm,
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
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    borderRadius: lightTheme.borderRadius.sm,
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
    padding: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.sm,
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
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.md,
    gap: lightTheme.spacing.sm,
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