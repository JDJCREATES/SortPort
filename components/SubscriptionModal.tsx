import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert } from 'react-native';
import { X, Crown, Unlock, Check, Sparkles, Zap, Shield, Cloud } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, SlideInRight } from 'react-native-reanimated';
import { RevenueCatManager } from '../utils/revenuecat';
import { lightTheme } from '../utils/theme';

interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function SubscriptionModal({ visible, onClose, onSuccess }: SubscriptionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<'subscription' | 'unlock'>('subscription');
  const [loading, setLoading] = useState(false);

  const subscriptionFeatures = [
    { icon: <Zap size={20} color={lightTheme.colors.warning} />, text: 'Unlimited AI photo sorting' },
    { icon: <Cloud size={20} color={lightTheme.colors.primary} />, text: 'Cloud backup & sync' },
    { icon: <Sparkles size={20} color={lightTheme.colors.secondary} />, text: 'Advanced AI categorization' },
    { icon: <Shield size={20} color={lightTheme.colors.success} />, text: 'Priority customer support' },
  ];

  const unlockFeatures = [
    { icon: <Unlock size={20} color={lightTheme.colors.primary} />, text: 'Access private/NSFW folders' },
    { icon: <Cloud size={20} color={lightTheme.colors.secondary} />, text: 'Album export features' },
    { icon: <Shield size={20} color={lightTheme.colors.success} />, text: 'Advanced privacy controls' },
    { icon: <Sparkles size={20} color={lightTheme.colors.warning} />, text: 'Custom color themes' },
  ];

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const productId = selectedPlan === 'subscription' ? 'snapsort_pro_monthly' : 'unlock_pack';
      
      // Mock purchase for demo
      revenueCat.mockPurchase(selectedPlan);
      
      onSuccess();
      onClose();
      
      Alert.alert(
        'Purchase Successful!',
        selectedPlan === 'subscription' 
          ? 'Welcome to SnapSort Pro! Your subscription is now active.' 
          : 'Unlock Pack activated! You now have access to all premium features.'
      );
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Purchase Failed', 'Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    try {
      const revenueCat = RevenueCatManager.getInstance();
      await revenueCat.restorePurchases();
      Alert.alert('Restore Complete', 'Your purchases have been restored.');
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Restore Failed', 'No purchases found to restore.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View entering={FadeInUp.delay(100)} style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Crown size={24} color={lightTheme.colors.warning} />
              <Text style={styles.title}>Upgrade SnapSort</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={lightTheme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Animated.Text entering={FadeInDown.delay(200)} style={styles.subtitle}>
              Choose the perfect plan for your photo organization needs
            </Animated.Text>

            {/* Plan Selection */}
            <Animated.View entering={FadeInDown.delay(300)} style={styles.planSelector}>
              <AnimatedTouchableOpacity
                entering={SlideInRight.delay(400)}
                style={[
                  styles.planOption,
                  selectedPlan === 'subscription' && styles.planOptionSelected
                ]}
                onPress={() => setSelectedPlan('subscription')}
              >
                <View style={styles.planHeader}>
                  <Crown size={24} color={lightTheme.colors.warning} />
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>SnapSort Pro</Text>
                    <Text style={styles.planPrice}>$2.99/month</Text>
                  </View>
                  {selectedPlan === 'subscription' && (
                    <View style={styles.selectedIndicator}>
                      <Check size={16} color="white" />
                    </View>
                  )}
                </View>
                <Text style={styles.planDescription}>
                  Perfect for power users who want unlimited AI sorting and cloud features
                </Text>
                <View style={styles.featuresContainer}>
                  {subscriptionFeatures.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      {feature.icon}
                      <Text style={styles.featureText}>{feature.text}</Text>
                    </View>
                  ))}
                </View>
              </AnimatedTouchableOpacity>

              <AnimatedTouchableOpacity
                entering={SlideInRight.delay(500)}
                style={[
                  styles.planOption,
                  selectedPlan === 'unlock' && styles.planOptionSelected
                ]}
                onPress={() => setSelectedPlan('unlock')}
              >
                <View style={styles.planHeader}>
                  <Unlock size={24} color={lightTheme.colors.primary} />
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>Unlock Pack</Text>
                    <Text style={styles.planPrice}>$9.99 one-time</Text>
                  </View>
                  {selectedPlan === 'unlock' && (
                    <View style={styles.selectedIndicator}>
                      <Check size={16} color="white" />
                    </View>
                  )}
                </View>
                <Text style={styles.planDescription}>
                  One-time purchase for privacy features and advanced customization
                </Text>
                <View style={styles.featuresContainer}>
                  {unlockFeatures.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      {feature.icon}
                      <Text style={styles.featureText}>{feature.text}</Text>
                    </View>
                  ))}
                </View>
              </AnimatedTouchableOpacity>
            </Animated.View>

            {/* Benefits Section */}
            <Animated.View entering={FadeInDown.delay(600)} style={styles.benefitsSection}>
              <Text style={styles.benefitsTitle}>Why upgrade?</Text>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Sparkles size={16} color={lightTheme.colors.primary} />
                  <Text style={styles.benefitText}>AI gets smarter with more photos</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Shield size={16} color={lightTheme.colors.success} />
                  <Text style={styles.benefitText}>Your photos stay private on your device</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Zap size={16} color={lightTheme.colors.warning} />
                  <Text style={styles.benefitText}>Save hours of manual organization</Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          <Animated.View entering={FadeInDown.delay(700)} style={styles.footer}>
            <TouchableOpacity 
              style={[styles.purchaseButton, loading && styles.purchaseButtonDisabled]}
              onPress={handlePurchase}
              disabled={loading}
            >
              <Text style={styles.purchaseButtonText}>
                {loading ? 'Processing...' : `Get ${selectedPlan === 'subscription' ? 'SnapSort Pro' : 'Unlock Pack'}`}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.restoreButton} onPress={handleRestorePurchases}>
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            </TouchableOpacity>
            
            <Text style={styles.disclaimer}>
              {selectedPlan === 'subscription' 
                ? 'Subscription automatically renews. Cancel anytime in your account settings.'
                : 'One-time purchase. No recurring charges.'
              }
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
    maxHeight: '90%',
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
  content: {
    flex: 1,
    padding: lightTheme.spacing.lg,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.xl,
    lineHeight: 22,
  },
  planSelector: {
    gap: lightTheme.spacing.lg,
    marginBottom: lightTheme.spacing.xl,
  },
  planOption: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planOptionSelected: {
    borderColor: lightTheme.colors.primary,
    backgroundColor: `${lightTheme.colors.primary}08`,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
  },
  planInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.sm,
  },
  planName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  planPrice: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.primary,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: lightTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    marginBottom: lightTheme.spacing.md,
    lineHeight: 20,
  },
  featuresContainer: {
    gap: lightTheme.spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  featureText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.text,
    flex: 1,
  },
  benefitsSection: {
    backgroundColor: `${lightTheme.colors.primary}10`,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
  },
  benefitsTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
  },
  benefitsList: {
    gap: lightTheme.spacing.sm,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.spacing.sm,
  },
  benefitText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    flex: 1,
  },
  footer: {
    padding: lightTheme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: lightTheme.colors.border,
  },
  purchaseButton: {
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.lg,
    paddingVertical: lightTheme.spacing.md,
    alignItems: 'center',
    marginBottom: lightTheme.spacing.md,
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
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});