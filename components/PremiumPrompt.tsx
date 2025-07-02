import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Crown, Unlock } from 'lucide-react-native';
import { lightTheme } from '../utils/theme';

interface PremiumPromptProps {
  type: 'subscription' | 'unlock';
  onUpgrade: () => void;
  onDismiss?: () => void;
}

export function PremiumPrompt({ type, onUpgrade, onDismiss }: PremiumPromptProps) {
  const isSubscription = type === 'subscription';
  
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        {isSubscription ? (
          <Crown size={24} color={lightTheme.colors.warning} />
        ) : (
          <Unlock size={24} color={lightTheme.colors.primary} />
        )}
      </View>
      
      <Text style={styles.title}>
        {isSubscription ? 'SnapSort Pro' : 'Unlock Pack'}
      </Text>
      
      <Text style={styles.description}>
        {isSubscription 
          ? 'Automatic background sorting, OCR features, and cloud export'
          : 'Access private/NSFW folders and album export features'
        }
      </Text>
      
      <Text style={styles.price}>
        {isSubscription ? '$2.99/month' : '$9.99 one-time'}
      </Text>
      
      <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
        <Text style={styles.upgradeButtonText}>
          {isSubscription ? 'Subscribe Now' : 'Unlock Now'}
        </Text>
      </TouchableOpacity>
      
      {onDismiss && (
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>Maybe Later</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.xl,
    alignItems: 'center',
    margin: lightTheme.spacing.md,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: lightTheme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  description: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: lightTheme.spacing.md,
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: lightTheme.colors.primary,
    marginBottom: lightTheme.spacing.lg,
  },
  upgradeButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.xl,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    marginBottom: lightTheme.spacing.sm,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: lightTheme.spacing.sm,
  },
  dismissButtonText: {
    color: lightTheme.colors.textSecondary,
    fontSize: 14,
  },
});