import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Folder } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { lightTheme } from '../../utils/theme';

interface SourceManagementSectionProps {
  selectedFolders: string[];
  setShowSourcePicker: (show: boolean) => void;
}

export function SourceManagementSection({ 
  selectedFolders, 
  setShowSourcePicker 
}: SourceManagementSectionProps) {
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
        <Folder size={20} color={lightTheme.colors.primary} />
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