import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppSettings } from '../../types';
import { getCurrentTheme } from '../../utils/theme';

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
  const theme = getCurrentTheme();
  const styles = createStyles(theme);

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
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
        />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Auto Sort</Text>
          <Text style={styles.settingDescription}>
            {userFlags.hasPurchasedCredits
              ? 'Automatically sort new photos'
              : 'Premium feature - purchase credits to enable'}
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
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
        />
      </View>

      {/* Show Moderated Content Toggle */}
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
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
        />
      </View>

      {/* Show in Main Albums Toggle - Conditional */}
      {settings.showModeratedContent && (
        <Animated.View 
          entering={FadeInUp.delay(100)} 
          style={[styles.settingItem, styles.nestedSettingItem]}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show in Main Albums</Text>
            <Text style={styles.settingDescription}>
              Display moderated content alongside regular albums
            </Text>
          </View>
          <Switch
            value={settings.showModeratedInMainAlbums}
            onValueChange={(value) =>
              updateSetting('showModeratedInMainAlbums', value)
            }
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary + '40',
            }}
            thumbColor={
              settings.showModeratedInMainAlbums
                ? theme.colors.primary
                : theme.colors.surface
            }
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  nestedSettingItem: {
    marginLeft: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary + '40',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  settingDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  disabledLabel: {
    opacity: 0.6,
  },
  disabledDescription: {
    opacity: 0.6,
  },
});
