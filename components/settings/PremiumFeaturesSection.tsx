import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { UserFlags, AppTheme } from '../../types';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';

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
  // Same pattern as tabs - just track current theme
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());
  
  // Subscribe to theme changes - same as tabs
  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    
    return unsubscribe;
  }, []);

  const styles = React.useMemo(() => createStyles(currentTheme), [currentTheme]);

  return (
    <Animated.View entering={FadeInUp.delay(250)} style={styles.section}>
      <Text style={styles.sectionTitle}>Credits & Features</Text>
      
      {/* Credit Balance Display */}
      <View style={styles.creditBalanceCard}>
        <View style={styles.creditBalanceHeader}>
          <Ionicons name="diamond" size={24} color={currentTheme.colors.primary} />
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
          <Ionicons name="flash" size={24} color={currentTheme.colors.warning} />
          <View style={styles.premiumInfo}>
            <Text style={styles.premiumTitle}>AI Sorting Credits</Text>
            <Text style={styles.premiumStatus}>
              {userFlags.hasPurchasedCredits ? 'Premium features unlocked' : 'Available for purchase'}
            </Text>
          </View>
          <View style={styles.upgradeButton}>
            <Text style={styles.upgradeButtonText}>
              {userFlags.hasPurchasedCredits ? 'Buy More' : 'From $2.99'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>


      <TouchableOpacity style={styles.restoreButton} onPress={handleRestorePurchases}>
        <Ionicons name="refresh" size={16} color={currentTheme.colors.primary} />
        <Text style={styles.restoreButtonText}>Restore Purchases</Text>
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
  creditBalanceCard: {
    backgroundColor: `${theme.colors.primary}10`,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}20`,
  },
  creditBalanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  creditBalanceInfo: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  creditBalanceTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  creditBalanceAmount: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: theme.colors.primary,
  },
  creditBalanceDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  buyCreditsButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  buyCreditsButtonText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  premiumCard: {
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
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumInfo: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  premiumTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  premiumStatus: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
  upgradeButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
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
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  restoreButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});