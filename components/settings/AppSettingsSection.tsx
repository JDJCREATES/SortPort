import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppSettings } from '../../types';
import { lightTheme } from '../../utils/theme';

interface AppSettingsSectionProps {
  userFlags: UserFlags;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => Promise<void>;
  setShowCreditPurchaseModal: (show: boolean) => void;
}

export function AppSettingsSection({ 
  userFlags, 
  settings, 
  updateSetting, 
  setShowCreditPurchaseModal 
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
        onPress={() => !userFlags.isProUser && setShowCreditPurchaseModal(true)}
      >
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Auto Sort</Text>
          <Text style={styles.settingDescription}>
            {userFlags.isProUser ? 'Automatically sort new photos' : 'Pro feature - upgrade to enable'}
          </Text>
        </View>
        <Switch
          value={settings.autoSort && userFlags.isProUser}
          onValueChange={(value) => {
            if (userFlags.isProUser) {
              updateSetting('autoSort', value);
            }
          }}
          disabled={!userFlags.isProUser}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.settingItem}
        onPress={() => !userFlags.isProUser && setShowCreditPurchaseModal(true)}
      >
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Content Filter</Text>
          <Text style={styles.settingDescription}>
            {userFlags.isProUser ? 'Filter inappropriate content' : 'Pro feature - upgrade to enable'}
          </Text>
        </View>
        <Switch
          value={settings.nsfwFilter}
          onValueChange={(value) => {
            if (userFlags.isProUser) {
              updateSetting('nsfwFilter', value);
            }
          }}
          disabled={!userFlags.isProUser}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.settingItem}
        onPress={() => !userFlags.isProUser && setShowCreditPurchaseModal(true)}
      >
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Show Moderated Content</Text>
          <Text style={styles.settingDescription}>
            {userFlags.isProUser ? 'Access to filtered content albums' : 'Pro feature required'}
          </Text>
        </View>
        <Switch
          value={settings.showModeratedContent && userFlags.isProUser}
          onValueChange={(value) => {
            if (userFlags.isProUser) {
              updateSetting('showModeratedContent', value);
            }
          }}
          disabled={!userFlags.isProUser}
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