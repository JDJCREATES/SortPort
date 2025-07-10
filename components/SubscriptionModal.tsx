import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInUp,
  SlideInRight,
} from 'react-native-reanimated';
import { RevenueCatManager } from '../utils/revenuecat';
import { lightTheme } from '../utils/theme';

interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

export function SubscriptionModal({
  visible,
  onClose,
  onSuccess,
}: SubscriptionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const subscriptionFeatures = [
    {
      icon: (
        <Ionicons name="flash" size={20} color={lightTheme.colors.warning} />
      ),
      text: 'Unlimited AI photo sorting',
    },
    {
      icon: (
        <Ionicons name="cloud" size={20} color={lightTheme.colors.primary} />
      ),
      text: 'Cloud backup & sync',
    },
    {
      icon: (
        <Ionicons
          name="sparkles"
          size={20}
          color={lightTheme.colors.secondary}
        />
      ),
      text: 'Advanced AI categorization',
    },
    {
      icon: (
        <Ionicons
          name="shield-checkmark"
          size={20}
          color={lightTheme.colors.success}
        />
      ),
      text: 'Priority customer support',
    },
  ];

  const unlockFeatures = [
    {
      icon: (
        <Ionicons
          name="lock-open"
          size={20}
          color={lightTheme.colors.primary}
        />
      ),
      text: 'Access private/NSFW folders',
    },
    {
      icon: (
        <Ionicons
          name="cloud-download"
          size={20}
          color={lightTheme.colors.secondary}
        />
      ),
      text: 'Album export features',
    },
    {
      icon: (
        <Ionicons
          name="shield-checkmark"
          size={20}
          color={lightTheme.colors.success}
        />
      ),
      text: 'Advanced privacy controls',
    },
    {
      icon: (
        <Ionicons
          name="color-palette"
          size={20}
          color={lightTheme.colors.warning}
        />
      ),
      text: 'Custom color themes',
    },
  ];

  const handlePurchase = async () => {
    if (!selectedPlan) {
      Alert.alert('No Plan Selected', 'Please select a plan to continue.');
      return;
    }

    setLoading(true);
    try {
      const revenueCat = RevenueCatManager.getInstance();
      // Map the selectedPlan to the actual product identifier
      const productId = selectedPlan === 'subscription' ? 'snapsort_pro_monthly' : 'unlock_pack';
      await revenueCat.purchaseProduct(productId);
      
      Alert.alert(
        'Purchase Successful!', 
        selectedPlan === 'unlock_pack' 
          ? 'Unlock Pack activated! You now have access to all premium features.'
          : 'Subscription activated! You now have access to all premium features.'
      );
      
      onSuccess();
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Purchase Failed', 'Please try again or contact support.');
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
              <Ionicons
                name="diamond"
                size={24}
                color={lightTheme.colors.warning}
              />
              <Text style={styles.title}>Upgrade SnapSort</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons
                name="close"
                size={24}
                color={lightTheme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Animated.Text
              entering={FadeInDown.delay(200)}
              style={styles.subtitle}
            >
              Choose the perfect plan for your photo organization needs
            </Animated.Text>

            {/* Plan Selection */}
            <View style={styles.plansContainer}>
              <Text style={styles.plansTitle}>Choose Your Plan</Text>
              
              {/* Subscription Plan */}
              <TouchableOpacity
                style={[
                  styles.planCard,
                  selectedPlan === 'subscription' && styles.planCardSelected,
                ]}
                onPress={() => setSelectedPlan('subscription')}
              >
                <View style={styles.planCardHeader}>
                  <Text style={styles.planCardTitle}>SnapSort Pro</Text>
                  <Text style={styles.planCardPrice}>$2.99/month</Text>
                </View>
                <Text style={styles.planCardSubtitle}>Monthly subscription</Text>
                <View style={styles.planFeatures}>
                  <Text style={styles.planFeature}>• Unlimited AI sorting</Text>
                  <Text style={styles.planFeature}>• Custom themes</Text>
                  <Text style={styles.planFeature}>• Cloud sync</Text>
                </View>
              </TouchableOpacity>

              {/* Unlock Pack Plan */}
              <TouchableOpacity
                style={[
                  styles.planCard,
                  selectedPlan === 'unlock_pack' && styles.planCardSelected,
                ]}
                onPress={() => setSelectedPlan('unlock_pack')}
              >
                <View style={styles.planCardHeader}>
                  <Text style={styles.planCardTitle}>Unlock Pack</Text>
                  <Text style={styles.planCardPrice}>$9.99 once</Text>
                </View>
                <Text style={styles.planCardSubtitle}>One-time purchase</Text>
                <View style={styles.planFeatures}>
                  <Text style={styles.planFeature}>• Unlimited AI sorting</Text>
                  <Text style={styles.planFeature}>• NSFW content access</Text>
                  <Text style={styles.planFeature}>• No recurring charges</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Benefits Section */}
            <Animated.View
              entering={FadeInDown.delay(600)}
              style={styles.benefitsSection}
            >
              <Text style={styles.benefitsTitle}>Why upgrade?</Text>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color={lightTheme.colors.primary}
                  />
                  <Text style={styles.benefitText}>
                    AI gets smarter with more photos
                  </Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons
                    name="shield-checkmark"
                    size={16}
                    color={lightTheme.colors.success}
                  />
                  <Text style={styles.benefitText}>
                    Your photos stay private on your device
                  </Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons
                    name="flash"
                    size={16}
                    color={lightTheme.colors.warning}
                  />
                  <Text style={styles.benefitText}>
                    Save hours of manual organization
                  </Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>

          <Animated.View entering={FadeInDown.delay(700)} style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.purchaseButton,
                loading && styles.purchaseButtonDisabled,
              ]}
              onPress={handlePurchase}
              disabled={loading}
            >
              <Text style={styles.purchaseButtonText}>
                {loading
                  ? 'Processing...'
                  : selectedPlan
                  ? `Get ${selectedPlan === 'subscription' ? 'SnapSort Pro' : 'Unlock Pack'}`
                  : 'Select a Plan'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
            >
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              {selectedPlan === 'subscription'
                ? 'Subscription automatically renews. Cancel anytime in your account settings.'
                : 'One-time purchase. No recurring charges.'}
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
  plansContainer: {
    marginVertical: lightTheme.spacing.lg,
  },
  plansTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.sm,
    borderWidth: 2,
    borderColor: lightTheme.colors.border,
  },
  planCardSelected: {
    borderColor: lightTheme.colors.primary,
    backgroundColor: lightTheme.colors.primary + '10',
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.xs,
  },
  planCardTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  planCardPrice: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.primary,
  },
  planCardSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    marginBottom: lightTheme.spacing.sm,
  },
  planFeatures: {
    gap: lightTheme.spacing.xs,
  },
  planFeature: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.text,
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
    paddingTop: lightTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: lightTheme.colors.border,
    backgroundColor: lightTheme.colors.background,
  },
  purchaseButton: {
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.lg,
    paddingVertical: lightTheme.spacing.sm,
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
    minHeight: 44,
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
