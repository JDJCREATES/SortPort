import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Camera, Sparkles, Zap, ArrowRight, LogIn } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, SlideInRight } from 'react-native-reanimated';
import { PhotoLoader } from '../utils/photoLoader';
import { SupabaseAuth } from '../utils/supabase';
import { AuthModal } from '../components/AuthModal';
import { useApp } from '../contexts/AppContext';
import { lightTheme } from '../utils/theme';

export default function WelcomeScreen() {
  const { signIn, signUp } = useApp();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const slides = [
    {
      icon: <Sparkles size={64} color={lightTheme.colors.primary} />,
      title: 'Welcome to SnapSort',
      description: 'AI-powered photo organization that understands your pictures and creates smart albums automatically.',
    },
    {
      icon: <Camera size={64} color={lightTheme.colors.secondary} />,
      title: 'Smart Albums',
      description: 'Automatically sort photos into meaningful albums using advanced AI. Find receipts, travel photos, and more instantly.',
    },
    {
      icon: <Zap size={64} color={lightTheme.colors.warning} />,
      title: 'Picture Hack',
      description: 'Tell us what you want to find using natural language, and we\'ll sort your photos instantly with AI magic.',
    },
  ];

  const handleGetStarted = async () => {
    const granted = await PhotoLoader.requestPermissions();
    setPermissionGranted(granted);
    
    if (granted) {
      router.replace('/(tabs)');
    }
  };

  const handleSignInPrompt = () => {
    Alert.alert(
      'Sign In Required',
      'To access all features and sync your albums across devices, please sign in to your account.',
      [
        { text: 'Maybe Later', style: 'cancel', onPress: handleGetStarted },
        { 
          text: 'Sign In', 
          onPress: () => setShowAuthModal(true)
        }
      ]
    );
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    
    const granted = await PhotoLoader.requestPermissions();
    setPermissionGranted(granted);
    
    if (granted) {
      router.replace('/(tabs)');
    }
  };

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const currentSlideData = slides[currentSlide];

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={FadeInUp.delay(200)} style={styles.content}>
        <Animated.View 
          key={currentSlide}
          entering={SlideInRight.duration(500)}
          style={styles.slideContainer}
        >
          <View style={styles.iconContainer}>
            {currentSlideData.icon}
          </View>
          <Text style={styles.title}>{currentSlideData.title}</Text>
          <Text style={styles.description}>{currentSlideData.description}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400)} style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentSlide && styles.activeDot,
              ]}
            />
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600)} style={styles.buttonContainer}>
          {currentSlide < slides.length - 1 ? (
            <TouchableOpacity style={styles.nextButton} onPress={nextSlide}>
              <Text style={styles.nextButtonText}>Next</Text>
              <ArrowRight size={20} color={lightTheme.colors.primary} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.signInButton} onPress={() => setShowAuthModal(true)}>
                <LogIn size={20} color="white" />
                <Text style={styles.signInButtonText}>Sign In</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.startButton, styles.startButtonSecondary]} 
                onPress={handleSignInPrompt}
              >
                <Text style={[styles.startButtonText, styles.startButtonTextSecondary]}>
                  Continue as Guest
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {currentSlide === slides.length - 1 && (
          <Animated.View entering={FadeInDown.delay(800)} style={styles.authHint}>
            <Text style={styles.authHintText}>
              Sign in to sync your albums across devices and access premium features, or continue as a guest to try the app.
            </Text>
          </Animated.View>
        )}
      </Animated.View>

      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false);
          handleGetStarted();
        }}
        initialMode="signup"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: lightTheme.spacing.xl,
  },
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
  },
  iconContainer: {
    marginBottom: lightTheme.spacing.xl,
    padding: lightTheme.spacing.xl,
    backgroundColor: `${lightTheme.colors.primary}10`,
    borderRadius: lightTheme.borderRadius.xl,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.lg,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: lightTheme.spacing.md,
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: lightTheme.spacing.xl,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: lightTheme.colors.border,
    marginHorizontal: 6,
  },
  activeDot: {
    backgroundColor: lightTheme.colors.primary,
    width: 24,
  },
  buttonContainer: {
    width: '100%',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surface,
    paddingVertical: lightTheme.spacing.lg,
    borderRadius: lightTheme.borderRadius.lg,
    gap: lightTheme.spacing.sm,
    borderWidth: 2,
    borderColor: lightTheme.colors.primary,
  },
  nextButtonText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.primary,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.primary,
    paddingVertical: lightTheme.spacing.lg,
    borderRadius: lightTheme.borderRadius.lg,
    alignItems: 'center',
    marginBottom: lightTheme.spacing.md,
    gap: lightTheme.spacing.sm,
    elevation: 4,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  signInButtonText: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  startButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingVertical: lightTheme.spacing.lg,
    borderRadius: lightTheme.borderRadius.lg,
    alignItems: 'center',
    elevation: 4,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  startButtonSecondary: {
    backgroundColor: lightTheme.colors.surface,
    borderWidth: 2,
    borderColor: lightTheme.colors.primary,
    elevation: 1,
    shadowOpacity: 0.1,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  startButtonTextSecondary: {
    color: lightTheme.colors.primary,
  },
  authHint: {
    marginTop: lightTheme.spacing.lg,
    paddingHorizontal: lightTheme.spacing.lg,
  },
  authHintText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});