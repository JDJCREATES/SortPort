import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';
import { AppTheme } from '../../types';

interface DataManagementSectionProps {
  handleClearData: () => void;
}

export function DataManagementSection({ handleClearData }: DataManagementSectionProps) {
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
    <Animated.View entering={FadeInUp.delay(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Data Management</Text>
      
      <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
        <Ionicons name="trash" size={20} color={currentTheme.colors.error} />
        <Text style={styles.dangerButtonText}>Clear All Data</Text>
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
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  dangerButtonText: {
    color: theme.colors.error,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});