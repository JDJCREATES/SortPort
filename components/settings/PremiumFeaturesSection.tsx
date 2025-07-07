import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags } from '../../types';
import { lightTheme } from '../../utils/theme';

interface PremiumFeaturesSectionProps {
  userFlags: UserFlags;
  setShowSubscriptionModal: (show: boolean) => void;
  handleRestorePurchases: () => void;
}

export function PremiumFeaturesSection({ 
  userFlags, 
  setShowSubscriptionModal, 
  handleRestorePurchases 
}: PremiumFeaturesSectionProps) {
  return (
    <Animated.View entering={FadeInUp.delay(250)} style={styles.section}>
      <Text style={styles.sectionTitle}>Premium Features</Text>
      
      <TouchableOpacity 
        style={styles.premiumCard}
        onPress={() => setShowSubscriptionModal(true)}
      >
        <View style={styles.premiumHeader}>
          <Ionicons name="diamond" size={24} color={lightTheme.colors.warning} />
          <View style={styles.premiumInfo}>
            <Text style={styles.premiumTitle}>SnapSort Pro</Text>
            <Text style={styles.premiumStatus}>
              {userFlags.isSubscribed ? 'Active' : 'Not Active'}
            </Text>
          </View>
          {!userFlags.isSubscribed && (
            <View style={styles.upgradeButton}>
              <Text style={styles.upgradeButtonText}>$2.99/mo</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.premiumCard}
        onPress={() => setShowSubscriptionModal(true)}
      >
        <View style={styles.premiumHeader}>
          <Ionicons name="lock-open" size={24} color={lightTheme.colors.primary} />
          <View style={styles.premiumInfo}>
            <Text style={styles.premiumTitle}>Unlock Pack</Text>
            <Text style={styles.premiumStatus}>
              {userFlags.hasUnlockPack ? 'Owned' : 'Not Owned'}
            </Text>
          </View>
          {!userFlags.hasUnlockPack && (
            <View style={styles.upgradeButton}>
              <Text style={styles.upgradeButtonText}>$9.99</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.restoreButton} onPress={handleRestorePurchases}>
        <Ionicons name="refresh" size={16} color={lightTheme.colors.primary} />
        <Text style={styles.restoreButtonText}>Restore Purchases</Text>
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
  premiumCard: {
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
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.sm,
  },
  premiumTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  premiumStatus: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  upgradeButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.md,
    paddingVertical: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: lightTheme.spacing.sm,
    gap: lightTheme.spacing.xs,
  },
  restoreButtonText: {
    color: lightTheme.colors.primary,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});