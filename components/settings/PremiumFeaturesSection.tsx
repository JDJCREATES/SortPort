import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags } from '../../types';
import { lightTheme } from '../../utils/theme';

interface PremiumFeaturesSectionProps {
  userFlags: UserFlags;
  setShowCreditPurchaseModal: (show: boolean) => void;
  handleRestorePurchases: () => void;
}

export function PremiumFeaturesSection({ 
  userFlags, 
  setShowCreditPurchaseModal, 
  handleRestorePurchases 
}: PremiumFeaturesSectionProps) {
  return (
    <Animated.View entering={FadeInUp.delay(250)} style={styles.section}>
      <Text style={styles.sectionTitle}>Credits & Features</Text>
      
      {/* Credit Balance Display */}
      <View style={styles.creditBalanceCard}>
        <View style={styles.creditBalanceHeader}>
          <Ionicons name="diamond" size={24} color={lightTheme.colors.primary} />
          <View style={styles.creditBalanceInfo}>
            <Text style={styles.creditBalanceTitle}>Credit Balance</Text>
            <Text style={styles.creditBalanceAmount}>{userFlags.creditBalance} credits</Text>
          </View>
          <TouchableOpacity
            style={styles.buyCreditsButton}
            onPress={() => setShowCreditPurchaseModal(true)}
          >
            <Text style={styles.buyCreditsButtonText}>Buy More</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.creditBalanceDescription}>
          Use credits for AI sorting, NSFW processing, and natural language queries
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.premiumCard}
        onPress={() => setShowCreditPurchaseModal(true)}
      >
        <View style={styles.premiumHeader}>
          <Ionicons name="flash" size={24} color={lightTheme.colors.warning} />
          <View style={styles.premiumInfo}>
            <Text style={styles.premiumTitle}>AI Sorting Credits</Text>
            <Text style={styles.premiumStatus}>
              Available for purchase
            </Text>
          </View>
          <View style={styles.upgradeButton}>
            <Text style={styles.upgradeButtonText}>From $2.99</Text>
          </View>
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
  creditBalanceCard: {
    backgroundColor: `${lightTheme.colors.primary}10`,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.md,
    borderWidth: 1,
    borderColor: `${lightTheme.colors.primary}20`,
  },
  creditBalanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
  },
  creditBalanceInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.sm,
  },
  creditBalanceTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  creditBalanceAmount: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.primary,
  },
  creditBalanceDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    lineHeight: 18,
  },
  buyCreditsButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.md,
    paddingVertical: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
  },
  buyCreditsButtonText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
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