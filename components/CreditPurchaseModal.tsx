import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';
import { CreditPurchaseManager } from '../utils/creditPurchaseManager';
import { CreditPack } from '../types';
import { lightTheme } from '../utils/theme';
import * as Haptics from 'expo-haptics';

interface CreditPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function CreditPurchaseModal({
  visible,
  onClose,
  onSuccess,
}: CreditPurchaseModalProps) {
  const [selectedPack, setSelectedPack] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);

  useEffect(() => {
    if (visible) {
      loadCreditPacks();
      loadCurrentBalance();
    }
  }, [visible]);

 

  const loadCreditPacks = async () => {
    try {
      const creditManager = CreditPurchaseManager.getInstance();
      const packs = await creditManager.getCreditPacks();
      setCreditPacks(packs);
      
      // Auto-select the middle pack
      if (packs.length > 0) {
        setSelectedPack(packs[1]?.identifier || packs[0].identifier);
      }
    } catch (error) {
      console.error('Error loading credit packs:', error);
    }
  };

  const loadCurrentBalance = async () => {
    try {
      const creditManager = CreditPurchaseManager.getInstance();
      const balance = await creditManager.getCreditBalance();
      setCurrentBalance(balance);
    } catch (error) {
      console.error('Error loading current balance:', error);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPack) {
      Alert.alert('No Pack Selected', 'Please select a credit pack to continue.');
      return;
    }

    setLoading(true);
    try {
      const creditManager = CreditPurchaseManager.getInstance();
      await creditManager.purchaseProduct(selectedPack);
      
      const selectedPackInfo = creditPacks.find(pack => pack.identifier === selectedPack);
      Alert.alert(
        'Purchase Successful! 🎉', 
        `${selectedPackInfo?.credits} credits have been added to your account.`,
        [{ text: 'Continue', onPress: onSuccess }] // Add callback to button
      );
      
    } catch (error: any) {
      console.error('Purchase error:', error);
      const errorMessage = error?.message?.includes('cancelled') 
        ? 'Purchase was cancelled.' 
        : 'Please try again or contact support if the problem persists.';
      Alert.alert('Purchase Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    try {
      const creditManager = CreditPurchaseManager.getInstance();
      await creditManager.restorePurchases();
      Alert.alert('Restore Complete', 'Your purchases have been restored.');
      await loadCurrentBalance();
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Restore Failed', 'No purchases found to restore.');
    }
  };

  const getPackValue = (pack: CreditPack): string => {
    const baseCredits = pack.bonus ? Math.floor(pack.credits * 100 / (100 + pack.bonus)) : pack.credits;
    const bonusCredits = pack.credits - baseCredits;
    
    if (bonusCredits > 0) {
      return `${baseCredits} + ${bonusCredits} bonus`;
    }
    return `${pack.credits} credits`;
  };

  const getBestValuePack = (): string => {
    if (creditPacks.length === 0) return '';
    
    // Calculate value as credits per dollar
    const values = creditPacks.map(pack => ({
      identifier: pack.identifier,
      value: pack.credits / parseFloat(pack.price)
    }));
    
    const bestValue = values.reduce((best, current) => 
      current.value > best.value ? current : best
    );
    
    return bestValue.identifier;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View entering={FadeInUp.delay(100)} style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Ionicons
                name="diamond"
                size={24}
                color={lightTheme.colors.warning}
              />
              <Text style={styles.title}>Buy Credits</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons
                name="close"
                size={24}
                color={lightTheme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Current Balance */}
          <Animated.View entering={FadeInDown.delay(150)} style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <View style={styles.balanceDisplay}>
              <Ionicons name="diamond" size={20} color={lightTheme.colors.primary} />
              <Text style={styles.balanceAmount}>{currentBalance} credits</Text>
            </View>
          </Animated.View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Animated.Text
              entering={FadeInDown.delay(200)}
              style={styles.subtitle}
            >
              Choose the perfect credit pack for your AI sorting needs
            </Animated.Text>

            {/* Credit Packs */}
            <View style={styles.packsContainer}>
              {creditPacks.map((pack, index) => {
                const isSelected = selectedPack === pack.identifier;
                const isBestValue = pack.identifier === getBestValuePack();
                
                return (
                  <AnimatedTouchableOpacity
                    key={pack.identifier}
                    entering={SlideInRight.delay(300 + index * 100)}
                    style={[
                      styles.packCard,
                      isSelected && styles.packCardSelected,
                    ]}
                    onPress={() => {
                      setSelectedPack(pack.identifier);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    {isBestValue && (
                      <View style={styles.bestValueBadge}>
                        <Text style={styles.bestValueText}>BEST VALUE</Text>
                      </View>
                    )}
                    
                    <View style={styles.packHeader}>
                      <Text style={styles.packTitle}>{pack.title}</Text>
                      <Text style={styles.packPrice}>{pack.priceString}</Text>
                    </View>
                    
                    <Text style={styles.packCredits}>{getPackValue(pack)}</Text>
                    
                    {pack.bonus && (
                      <View style={styles.bonusBadge}>
                        <Text style={styles.bonusText}>+{pack.bonus}% BONUS</Text>
                      </View>
                    )}
                    
                    <Text style={styles.packDescription}>{pack.description}</Text>
                    
                    {isSelected && (
                      <View style={styles.selectedIndicator}>
                        <Ionicons name="checkmark-circle" size={24} color={lightTheme.colors.primary} />
                      </View>
                    )}
                  </AnimatedTouchableOpacity>
                );
              })}
            </View>

            {/* Credit Usage Info */}
            <Animated.View
              entering={FadeInDown.delay(600)}
              style={styles.usageSection}
            >
              <Text style={styles.usageTitle}>How credits work</Text>
              <View style={styles.usageList}>
                <View style={styles.usageItem}>
                  <Ionicons
                    name="images"
                    size={16}
                    color={lightTheme.colors.primary}
                  />
                  <Text style={styles.usageText}>
                    1 credit per 9-image AI sorting atlas
                  </Text>
                </View>
                <View style={styles.usageItem}>
                  <Ionicons
                    name="shield-checkmark"
                    size={16}
                    color={lightTheme.colors.warning}
                  />
                  <Text style={styles.usageText}>
                    2-3 credits for NSFW content processing
                  </Text>
                </View>
                <View style={styles.usageItem}>
                  <Ionicons
                    name="chatbubble"
                    size={16}
                    color={lightTheme.colors.secondary}
                  />
                  <Text style={styles.usageText}>
                    0.25 credits per natural language query
                  </Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          <Animated.View entering={FadeInDown.delay(700)} style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.purchaseButton,
                (loading || !selectedPack) && styles.purchaseButtonDisabled,
              ]}
              onPress={handlePurchase}
              disabled={loading || !selectedPack}
            >
              {loading && (
                <ActivityIndicator 
                  size="small" 
                  color="white" 
                  style={{ marginRight: lightTheme.spacing.sm }} 
                />
              )}
              <Text style={styles.purchaseButtonText}>
                {loading
                  ? 'Processing...'
                  : selectedPack
                  ? `Buy ${creditPacks.find(p => p.identifier === selectedPack)?.title || 'Credits'}`
                  : 'Select a Pack'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
            >
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Credits never expire and can be used across all AI features
            </Text>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
  },
  container: {
    backgroundColor: lightTheme.colors.background,
    borderRadius: lightTheme.borderRadius.xl,
    width: '100%',
    maxWidth: 500,
    maxHeight: '98%',
    minHeight: 600,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  closeButton: {
    padding: lightTheme.spacing.xs,
  },
  balanceContainer: {
    backgroundColor: `${lightTheme.colors.primary}10`,
    padding: lightTheme.spacing.lg,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.textSecondary,
    marginBottom: lightTheme.spacing.xs,
  },
  balanceDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  balanceAmount: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.primary,
  },
  content: {
    flex: 1,
    padding: lightTheme.spacing.lg,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.lg,
    lineHeight: 20,
    paddingHorizontal: lightTheme.spacing.sm,
  },
  packsContainer: {
    marginVertical: lightTheme.spacing.lg,
    gap: lightTheme.spacing.md,
  },
  packCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    borderWidth: 2,
    borderColor: lightTheme.colors.border,
    position: 'relative',
  },
  packCardSelected: {
    borderColor: lightTheme.colors.primary,
    backgroundColor: lightTheme.colors.primary + '10',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -8,
    right: lightTheme.spacing.lg,
    backgroundColor: lightTheme.colors.warning,
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    borderRadius: lightTheme.borderRadius.sm,
  },
  bestValueText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: 'white',
    letterSpacing: 0.5,
  },
  packHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
  },
  packTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  packPrice: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.primary,
  },
  packCredits: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  bonusBadge: {
    backgroundColor: lightTheme.colors.success + '20',
    paddingHorizontal: lightTheme.spacing.sm,
    paddingVertical: lightTheme.spacing.xs,
    borderRadius: lightTheme.borderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: lightTheme.spacing.sm,
  },
  bonusText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.success,
  },
  packDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    lineHeight: 18,
  },
  selectedIndicator: {
    position: 'absolute',
    top: lightTheme.spacing.md,
    right: lightTheme.spacing.md,
  },
  usageSection: {
    backgroundColor: `${lightTheme.colors.primary}10`,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    marginTop: lightTheme.spacing.lg,
  },
  usageTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
  },
  usageList: {
    gap: lightTheme.spacing.sm,
  },
  usageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  usageText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    flex: 1,
  },
  footer: {
    padding: lightTheme.spacing.lg,
    paddingTop: lightTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: lightTheme.colors.border,
    backgroundColor: lightTheme.colors.background,
  },
  purchaseButton: {
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.lg,
    paddingVertical: lightTheme.spacing.md,
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
    minHeight: 48,
    elevation: 3,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  purchaseButtonDisabled: {
    backgroundColor: lightTheme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  purchaseButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: lightTheme.spacing.sm,
    marginBottom: lightTheme.spacing.sm,
  },
  restoreButtonText: {
    color: lightTheme.colors.primary,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: lightTheme.spacing.sm,
  },
});