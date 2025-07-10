import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppSettings } from '../../types';
import { lightTheme } from '../../utils/theme';

interface AppSettingsSectionProps {
  userFlags: UserFlags;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => Promise<void>;
}

export function AppSettingsSection({ 
  userFlags, 
  settings, 
  updateSetting, 
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

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Auto Sort</Text>
          <Text style={styles.settingDescription}>
            {userFlags.hasPurchasedCredits ? 'Automatically sort new photos' : 'Premium feature - purchase credits to enable'}
          </Text>
        </View>
        <Switch
          value={settings.autoSort && userFlags.hasPurchasedCredits}
          onValueChange={(value) => {
            if (userFlags.hasPurchasedCredits) {
              updateSetting('autoSort', value);
            }
          }}
          disabled={!userFlags.hasPurchasedCredits}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Content Filter</Text>
          <Text style={styles.settingDescription}>
            Filter inappropriate content automatically
          </Text>
        </View>
        <Switch
          value={settings.nsfwFilter}
          onValueChange={(value) => {
            updateSetting('nsfwFilter', value);
          }}
          disabled={false}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Show Moderated Content</Text>
          <Text style={styles.settingDescription}>
            Access to filtered content albums
          </Text>
        </View>
        <Switch
          value={settings.showModeratedContent}
          onValueChange={(value) => {
            updateSetting('showModeratedContent', value);
          }}
          disabled={false}
          trackColor={{ false: lightTheme.colors.border, true: lightTheme.colors.primary }}
        />
      </View>
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