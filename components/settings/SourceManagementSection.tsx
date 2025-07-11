import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';
import { AppTheme } from '../../types';

interface SourceManagementSectionProps {
  selectedFolders: string[];
  setShowSourcePicker: (show: boolean) => void;
}

export function SourceManagementSection({ 
  selectedFolders, 
  setShowSourcePicker 
}: SourceManagementSectionProps) {
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());

  // Subscribe to theme changes for instant updates
  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    return unsubscribe;
  }, []);

  const styles = React.useMemo(() => createStyles(currentTheme), [currentTheme]);

  return (
    <Animated.View entering={FadeInUp.delay(200)} style={styles.section}>
      <Text style={styles.sectionTitle}>Photo Sources</Text>
      
      <TouchableOpacity 
        style={styles.settingItem}
        onPress={() => setShowSourcePicker(true)}
      >
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Manage Photo Sources</Text>
          <Text style={styles.settingDescription}>
            Choose which folders to include in AI sorting ({selectedFolders.length} selected)
          </Text>
        </View>
        <Ionicons name="folder" size={20} color={currentTheme.colors.primary} />
      </TouchableOpacity>
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