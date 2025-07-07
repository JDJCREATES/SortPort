import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppSettings } from '../../types';
import { lightTheme } from '../../utils/theme';

interface AppSettingsSectionProps {
  userFlags: UserFlags;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => Promise<void>;
  setShowSubscriptionModal: (show: boolean) => void;
}

export function AppSettingsSection({ 
  userFlags, 
  settings, 
  updateSetting, 
  setShowSubscriptionModal 
}: AppSettingsSectionProps) {
  return (
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
          }}
          disabled={!userFlags.isSubscribed}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.settingItem}
        onPress={() => !userFlags.isSubscribed && setShowSubscriptionModal(true)}
      >
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Content Filter</Text>
          <Text style={styles.settingDescription}>
            {userFlags.isSubscribed ? 'Filter inappropriate content' : 'Premium feature - upgrade to enable'}
          </Text>
        </View>
        <Switch
          value={settings.nsfwFilter}
          onValueChange={(value) => {
            if (userFlags.isSubscribed) {
              updateSetting('nsfwFilter', value);
            }
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
          <Text style={styles.settingLabel}>Show Moderated Content</Text>
          <Text style={styles.settingDescription}>
            {userFlags.hasUnlockPack ? 'Access to filtered content albums' : 'Unlock Pack required'}
          </Text>
        </View>
        <Switch
          value={settings.showModeratedContent && userFlags.hasUnlockPack}
          onValueChange={(value) => {
            if (userFlags.hasUnlockPack) {
              updateSetting('showModeratedContent', value);
            }
          }}
          disabled={!userFlags.hasUnlockPack}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: lightTheme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
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
});