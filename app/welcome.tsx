import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Camera, Sparkles, Zap } from 'lucide-react-native';
import { PhotoLoader } from '../utils/photoLoader';
import { lightTheme } from '../utils/theme';

export default function WelcomeScreen() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      icon: <Sparkles size={64} color={lightTheme.colors.primary} />,
      title: 'Welcome to SnapSort',
      description: 'AI-powered photo organization that understands your pictures',
    },
    {
      icon: <Camera size={64} color={lightTheme.colors.secondary} />,
      title: 'Smart Albums',
      description: 'Automatically sort photos into meaningful albums using advanced AI',
    },
    {
      icon: <Zap size={64} color={lightTheme.colors.warning} />,
      title: 'Picture Hack',
      description: 'Tell us what you want to find, and we\'ll sort your photos instantly',
    },
  ];

  const handleRequestPermissions = async () => {
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
      <View style={styles.content}>
        <View style={styles.slideContainer}>
          <View style={styles.iconContainer}>
            {currentSlideData.icon}
          </View>
          <Text style={styles.title}>{currentSlideData.title}</Text>
          <Text style={styles.description}>{currentSlideData.description}</Text>
        </View>

        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentSlide && styles.activeDot,
              ]}
            />
          ))}
        </View>

        <View style={styles.buttonContainer}>
          {currentSlide < slides.length - 1 ? (
            <TouchableOpacity style={styles.nextButton} onPress={nextSlide}>
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.startButton} onPress={handleRequestPermissions}>
              <Text style={styles.startButtonText}>Get Started</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: lightTheme.spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: lightTheme.colors.border,
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: lightTheme.colors.primary,
  },
  buttonContainer: {
    width: '100%',
  },
  nextButton: {
    backgroundColor: lightTheme.colors.surface,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.primary,
  },
  startButton: {
    backgroundColor: lightTheme.colors.primary,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
});