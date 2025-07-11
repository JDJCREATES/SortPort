import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppSettings, AppTheme } from '../../types';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';

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
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());

  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    return unsubscribe;
  }, []);

  const styles = React.useMemo(() => createStyles(currentTheme), [currentTheme]);

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
            false: currentTheme.colors.border,
            true: currentTheme.colors.primary,
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
            false: currentTheme.colors.border,
            true: currentTheme.colors.primary,
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
            false: currentTheme.colors.border,
            true: currentTheme.colors.primary,
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
              false: currentTheme.colors.border,
              true: currentTheme.colors.primary + '40',
            }}
            thumbColor={
              settings.showModeratedInMainAlbums
                ? currentTheme.colors.primary
                : currentTheme.colors.surface
            }
          />
        </Animated.View>
      )}
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Notifications</Text>
          <Text style={styles.settingDescription}>
            Enable or disable notifications
          </Text>
        </View>
        <Switch
          value={settings.notifications}
          onValueChange={(value) => updateSetting('notifications', value)}
          trackColor={{
            false: currentTheme.colors.border,
            true: currentTheme.colors.primary,
          }}
        />
      </View>
    </Animated.View>
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
    borderWidth: 1,
    borderColor: theme.colors.border,
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
});
