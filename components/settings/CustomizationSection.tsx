import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppSettings } from '../../types';
import { lightTheme } from '../../utils/theme';

interface CustomizationSectionProps {
  userFlags: UserFlags;
  settings: AppSettings;
  setShowColorPicker: (type: 'primary' | 'secondary' | null) => void;
  setShowCreditPurchaseModal: (show: boolean) => void;
}

export function CustomizationSection({ 
  userFlags, 
  settings, 
  setShowColorPicker, 
  setShowCreditPurchaseModal 
}: CustomizationSectionProps) {
  const canUseColorPicker = userFlags.isProUser || false;

  return (
    <Animated.View entering={FadeInUp.delay(300)} style={styles.section}>
      <Text style={styles.sectionTitle}>Customization</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Primary Color</Text>
          <Text style={styles.settingDescription}>
            {canUseColorPicker ? 'Customize your app\'s primary color' : 'Premium feature - upgrade to customize'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.colorPreview, { backgroundColor: settings.customColors?.primary || lightTheme.colors.primary }]}
          onPress={() => canUseColorPicker ? setShowColorPicker('primary') : setShowCreditPurchaseModal(true)}
        >
          <Ionicons name="color-palette" size={16} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Secondary Color</Text>
          <Text style={styles.settingDescription}>
            {canUseColorPicker ? 'Customize your app\'s secondary color' : 'Premium feature - upgrade to customize'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.colorPreview, { backgroundColor: settings.customColors?.secondary || lightTheme.colors.secondary }]}
          onPress={() => canUseColorPicker ? setShowColorPicker('secondary') : setShowCreditPurchaseModal(true)}
        >
          <Ionicons name="color-palette" size={16} color="white" />
        </TouchableOpacity>
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
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
});