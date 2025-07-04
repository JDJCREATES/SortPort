import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView, 
  Alert, 
  BackHandler,
  StatusBar,
  Dimensions,

  Platform,
  RefreshControl
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, Sparkles, Zap, ArrowRight, LogIn, ChevronLeft } from 'lucide-react-native';
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  SlideInRight, 
  SlideOutLeft,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhotoLoader } from '../utils/photoLoader';
import { AuthModal } from '../components/AuthModal';
import { useApp } from '../contexts/AppContext';
import { lightTheme } from '../utils/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ONBOARDING_COMPLETED_KEY = '@snapsort_onboarding_completed';
const WELCOME_SEEN_KEY = '@snapsort_welcome_seen';

interface Slide {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  backgroundColor?: string;
}

export default function WelcomeScreen() {
  const { userProfile, isAuthenticated } = useApp();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [isPermissionRequesting, setIsPermissionRequesting] = useState(false);
  
  const slideProgress = useSharedValue(0);

  const slides: Slide[] = [
    {
      id: 'welcome',
      icon: <Sparkles size={64} color={lightTheme.colors.primary} />,
      title: 'Welcome to SnapSort',
      description: 'AI-powered photo organization that understands your pictures and creates smart albums automatically.',
      backgroundColor: `${lightTheme.colors.primary}05`,
    },
    {
      id: 'smart-albums',
      icon: <Camera size={64} color={lightTheme.colors.secondary} />,
      title: 'Smart Albums',
      description: 'Automatically sort photos into meaningful albums using advanced AI. Find receipts, travel photos, and more instantly.',
      backgroundColor: `${lightTheme.colors.secondary}05`,
    },
    {
      id: 'picture-hack',
      icon: <Zap size={64} color={lightTheme.colors.warning} />,
      title: 'Picture Hack',
      description: 'Tell us what you want to find using natural language, and we\'ll sort your photos instantly with AI magic.',
      backgroundColor: `${lightTheme.colors.warning}05`,
    },
    {
      id: 'get-started',
      icon: <LogIn size={64} color={lightTheme.colors.success} />,
      title: 'Get Started',
      description: 'Sign in to sync your albums across devices and access premium features, or continue as a guest to try the app.',
      backgroundColor: `${lightTheme.colors.success}05`,
    },
  ];

  // Check if userProfile has seen welcome before
  useEffect(() => {
    checkWelcomeStatus();
  }, []);

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (currentSlide > 0) {
          previousSlide();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [currentSlide])
  );

  // Update slide progress animation
  useEffect(() => {
    slideProgress.value = withSpring(currentSlide, {
      damping: 20,
      stiffness: 90,
    });
  }, [currentSlide]);

  const checkWelcomeStatus = async () => {
    try {
      setIsLoading(true);
      
      // Check if userProfile is already authenticated and should skip welcome
      if (isAuthenticated && userProfile) {
        router.replace('/(tabs)');
        return;
      }

      const [welcomeSeen, onboardingCompleted] = await Promise.all([
        AsyncStorage.getItem(WELCOME_SEEN_KEY),
        AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)
      ]);

      const hasSeenBefore = welcomeSeen === 'true';
      const hasCompletedOnboarding = onboardingCompleted === 'true';

      setHasSeenWelcome(hasSeenBefore);

      if (hasSeenBefore || hasCompletedOnboarding) {
        // Skip to the last slide (sign in/get started)
        setCurrentSlide(slides.length - 1);
      }
    } catch (error) {
      console.error('Error checking welcome status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markWelcomeAsSeen = async () => {
    try {
      await AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true');
    } catch (error) {
      console.error('Error marking welcome as seen:', error);
    }
  };

  const markOnboardingCompleted = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } catch (error) {
      console.error('Error marking onboarding as completed:', error);
    }
  };

  const nextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
      
      // Mark welcome as seen when userProfile progresses past first slide
      if (currentSlide === 0) {
        markWelcomeAsSeen();
      }
    }
  }, [currentSlide, slides.length]);

  const previousSlide = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);

  const handleGetStarted = async () => {
    if (isPermissionRequesting) return;
    
    try {
      setIsPermissionRequesting(true);
      
      const permissionStatus = await PhotoLoader.requestPermissions();
      const granted = permissionStatus === 'granted';
      
      if (granted) {
        await markOnboardingCompleted();
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          'Permission Required',
          'Photo library access is required to organize your photos. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                // On Android, we can't directly open settings, but we can show instructions
                Alert.alert(
                  'Enable Photo Access',
                  'Go to Settings > Apps > SnapSort > Permissions > Storage and enable photo access.',
                  [{ text: 'OK' }]
                );
              }
            },
            { text: 'Try Again', onPress: handleGetStarted }
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert(
        'Error',
        'Failed to request photo library permissions. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsPermissionRequesting(false);
    }
  };

  const handleSignInPrompt = () => {
    Alert.alert(
      'Choose Your Experience',
      'Sign in for the full experience with cloud sync and premium features, or continue as a guest to try the app.',
      [
        { 
          text: 'Continue as Guest', 
          style: 'cancel', 
          onPress: handleGetStarted 
        },
        { 
          text: 'Sign In', 
          onPress: () => setShowAuthModal(true)
        }
      ]
    );
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    
    try {
      const permissionStatus = await PhotoLoader.requestPermissions();
      const granted = permissionStatus === 'granted';
      
      if (granted) {
        await markOnboardingCompleted();
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          'Permission Required',
          'Photo library access is required to organize your photos. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: handleAuthSuccess }
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting permissions after auth:', error);
      Alert.alert(
        'Error',
        'Failed to request photo library permissions. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const animatedSlideStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      slideProgress.value,
      [currentSlide - 1, currentSlide, currentSlide + 1],
      [SCREEN_WIDTH, 0, -SCREEN_WIDTH]
    );

    return {
      transform: [{ translateX }],
    };
  });

  const currentSlideData = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;
  const isFirstSlide = currentSlide === 0;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={lightTheme.colors.background} />
        <Animated.View entering={FadeInUp} style={styles.loadingContent}>
          <Sparkles size={48} color={lightTheme.colors.primary} />
          <Text style={styles.loadingText}>Loading SnapSort...</Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={lightTheme.colors.background} />
      
      {/* Header with back button */}
      {!isFirstSlide && (
        <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={previousSlide}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={lightTheme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {currentSlide + 1} of {slides.length}
          </Text>
          <View style={styles.headerSpacer} />
        </Animated.View>
      )}

      <Animated.View 
        entering={FadeInUp.delay(200)} 
        style={[styles.content, { backgroundColor: currentSlideData.backgroundColor }]}
      >
        <Animated.View 
          key={currentSlide}
          entering={SlideInRight.duration(500)}
          exiting={SlideOutLeft.duration(300)}
          style={styles.slideContainer}
        >
          <View style={styles.iconContainer}>
            {currentSlideData.icon}
          </View>
          <Text style={styles.title}>{currentSlideData.title}</Text>
          <Text style={styles.description}>{currentSlideData.description}</Text>
        </Animated.View>

        {/* Progress Indicators */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.pagination}>
          {slides.map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.dot,
                index === currentSlide && styles.activeDot,
              ]}
              onPress={() => setCurrentSlide(index)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            />
          ))}
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeInDown.delay(600)} style={styles.buttonContainer}>
          {!isLastSlide ? (
            <TouchableOpacity 
              style={styles.nextButton} 
              onPress={nextSlide}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <ArrowRight size={20} color={lightTheme.colors.primary} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity 
                style={styles.signInButton} 
                onPress={() => setShowAuthModal(true)}
                activeOpacity={0.8}
              >
                <LogIn size={20} color="white" />
                <Text style={styles.signInButtonText}>Sign In</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.startButton, styles.startButtonSecondary]} 
                onPress={handleSignInPrompt}
                activeOpacity={0.8}
                disabled={isPermissionRequesting}
              >
                <Text style={[styles.startButtonText, styles.startButtonTextSecondary]}>
                  {isPermissionRequesting ? 'Please wait...' : 'Continue as Guest'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* Additional Info for Last Slide */}
        {isLastSlide && (
          <Animated.View entering={FadeInDown.delay(800)} style={styles.authHint}>
            <Text style={styles.authHintText}>
              {hasSeenWelcome 
                ? 'Welcome back! Sign in to access your albums or continue as a guest.'
                : 'Sign in to sync your albums across devices and access premium features, or continue as a guest to try the app.'
              }
            </Text>
          </Animated.View>
        )}
      </Animated.View>

      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    gap: lightTheme.spacing.lg,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
    header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: lightTheme.spacing.lg,
    paddingTop: Platform.OS === 'android' ? lightTheme.spacing.md : 0,
    paddingBottom: lightTheme.spacing.sm,
    height: 56,
  },
  backButton: {
    padding: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.surface,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.textSecondary,
  },
  headerSpacer: {
    width: 40, // Same width as back button to center the title
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: lightTheme.spacing.xl,
    borderTopLeftRadius: lightTheme.borderRadius.xl,
    borderTopRightRadius: lightTheme.borderRadius.xl,
    marginTop: lightTheme.spacing.sm,
  },
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
    maxWidth: SCREEN_WIDTH - (lightTheme.spacing.xl * 2),
  },
  iconContainer: {
    marginBottom: lightTheme.spacing.xl * 1.5,
    padding: lightTheme.spacing.xl * 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: lightTheme.borderRadius.xl * 2,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.lg,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  description: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: lightTheme.spacing.md,
    maxWidth: SCREEN_WIDTH * 0.85,
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: lightTheme.spacing.xl,
    gap: lightTheme.spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: lightTheme.colors.border,
    opacity: 0.5
  },
  activeDot: {
    backgroundColor: lightTheme.colors.primary,
    width: 32,
    opacity: 1,
  },
  buttonContainer: {
    width: '100%',
    gap: lightTheme.spacing.md,
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
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    minHeight: 56,
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
    gap: lightTheme.spacing.sm,
    elevation: 6,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    minHeight: 56,
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
    justifyContent: 'center',
    elevation: 6,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    minHeight: 56,
  },
  startButtonSecondary: {
    backgroundColor: lightTheme.colors.surface,
    borderWidth: 2,
    borderColor: lightTheme.colors.primary,
    elevation: 2,
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
    paddingVertical: lightTheme.spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: lightTheme.borderRadius.lg,
    borderWidth: 1,
    borderColor: lightTheme.colors.border,
  },
  authHintText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});
