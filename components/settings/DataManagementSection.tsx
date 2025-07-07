import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { lightTheme } from '../../utils/theme';

interface DataManagementSectionProps {
  handleClearData: () => void;
}

export function DataManagementSection({ handleClearData }: DataManagementSectionProps) {
  return (
    <Animated.View entering={FadeInUp.delay(400)} style={styles.section}>
      <Text style={styles.sectionTitle}>Data Management</Text>
      
      <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
        <Ionicons name="trash" size={20} color={lightTheme.colors.error} />
        <Text style={styles.dangerButtonText}>Clear All Data</Text>
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
});