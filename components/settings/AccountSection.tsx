import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { router } from 'expo-router';
import { SupabaseAuth, UserProfile } from '../../utils/supabase';
import { lightTheme } from '../../utils/theme';

interface AccountSectionProps {
  userProfile: UserProfile | null;
  isLoadingProfile: boolean;
  signOut: () => Promise<void>;
  setShowAuthModal: (show: boolean) => void;
}

export function AccountSection({ 
  userProfile, 
  isLoadingProfile, 
  signOut,
  setShowAuthModal 
}: AccountSectionProps) {
  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  return (
    <Animated.View entering={FadeInUp.delay(150)} style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>
      
      {isLoadingProfile ? (
        <View style={styles.loadingCard}>
          <Text style={styles.loadingText}>Loading account...</Text>
        </View>
      ) : userProfile ? (
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <Ionicons name="person-circle" size={24} color={lightTheme.colors.primary} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {userProfile.full_name || 'User'}
              </Text>
              <Text style={styles.profileEmail}>{userProfile.email}</Text>
            </View>
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Ionicons name="log-out" size={16} color={lightTheme.colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity 
          style={styles.signInCard}
          onPress={() => setShowAuthModal(true)}
        >
          <Ionicons name="log-in" size={24} color={lightTheme.colors.primary} />
          <View style={styles.signInInfo}>
            <Text style={styles.signInTitle}>Sign In to SnapSort</Text>
            <Text style={styles.signInDescription}>
              Sync your albums across devices and access premium features
            </Text>
          </View>
        </TouchableOpacity>
      )}
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
  loadingCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  loadingText: {
    fontSize: 16,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  profileCard: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.sm,
  },
  profileName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
  },
  signOutButton: {
    padding: lightTheme.spacing.sm,
  },
  signInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.lg,
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: `${lightTheme.colors.primary}20`,
  },
  signInInfo: {
    flex: 1,
    marginLeft: lightTheme.spacing.md,
  },
  signInTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  signInDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    lineHeight: 20,
  },
});