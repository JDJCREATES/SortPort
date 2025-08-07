import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Dimensions,
  StyleSheet,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SPLASH_CONFIG } from '../config/splashConfig';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FloatingCardProps {
  image: any;
  title: string;
  subtitle: string;
  initialRotation: number;
  animationDelay: number;
  animationDuration: number;
}

const FloatingCard: React.FC<FloatingCardProps> = ({
  image,
  title,
  subtitle,
  initialRotation,
  animationDelay,
  animationDuration,
}) => {
  const translateX = useSharedValue(-200);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(initialRotation);
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Start animation sequence
    const startAnimation = () => {
      // Phase 1: Enter from left
      translateX.value = withTiming(50, {
        duration: animationDuration * 0.15,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(-20, {
        duration: animationDuration * 0.15,
        easing: Easing.out(Easing.cubic),
      });
      scale.value = withTiming(1, {
        duration: animationDuration * 0.15,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, {
        duration: animationDuration * 0.1,
        easing: Easing.out(Easing.cubic),
      });

      // Phase 2: Float in center (70% of duration)
      setTimeout(() => {
        translateX.value = withTiming(0, {
          duration: animationDuration * 0.7,
          easing: Easing.inOut(Easing.cubic),
        });
        translateY.value = withRepeat(
          withSequence(
            withTiming(10, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
            withTiming(-10, { duration: 3000, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          true
        );
      }, animationDuration * 0.15);

      // Phase 3: Exit to right
      setTimeout(() => {
        translateX.value = withTiming(200, {
          duration: animationDuration * 0.15,
          easing: Easing.in(Easing.cubic),
        });
        translateY.value = withTiming(30, {
          duration: animationDuration * 0.15,
          easing: Easing.in(Easing.cubic),
        });
        scale.value = withTiming(0.8, {
          duration: animationDuration * 0.15,
          easing: Easing.in(Easing.cubic),
        });
        opacity.value = withTiming(0, {
          duration: animationDuration * 0.15,
          easing: Easing.in(Easing.cubic),
        });
      }, animationDuration * 0.85);
    };

    const timer = setTimeout(startAnimation, animationDelay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.floatingCard, animatedStyle]}>
      <View style={styles.cardContent}>
        <Image source={image} style={styles.cardImage} resizeMode="cover" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
    </Animated.View>
  );
};

const FloatingElement: React.FC<{ delay: number; size: number; leftPercent: number; topPercent: number }> = ({
  delay,
  size,
  leftPercent,
  topPercent,
}) => {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animatedValue.value,
    transform: [
      { scale: interpolate(animatedValue.value, [0, 1], [0.8, 1.2]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.floatingElement,
        {
          width: size,
          height: size,
          left: `${leftPercent}%`,
          top: `${topPercent}%`,
        },
        animatedStyle,
      ]}
    />
  );
};

const AnimatedText: React.FC = () => {
  const textValues = useSharedValue(
    SPLASH_CONFIG.content.mainText.split('').map(() => ({ scale: 0, opacity: 0, translateY: 50 }))
  );

  useEffect(() => {
    const animateText = () => {
      SPLASH_CONFIG.content.mainText.split('').forEach((_, index) => {
        setTimeout(() => {
          textValues.value = textValues.value.map((value, i) => {
            if (i === index) {
              return {
                scale: withSpring(1, { damping: 8, stiffness: 100 }),
                opacity: withTiming(1, { duration: 500 }),
                translateY: withSpring(0, { damping: 10, stiffness: 100 }),
              };
            }
            return value;
          });
        }, index * SPLASH_CONFIG.timing.textCharacterStagger);
      });
    };

    const timer = setTimeout(animateText, SPLASH_CONFIG.timing.textAnimationDelay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.textContainer}>
      {SPLASH_CONFIG.content.mainText.split('').map((char, index) => {
        const animatedStyle = useAnimatedStyle(() => {
          const value = textValues.value[index];
          return {
            transform: [
              { scale: value?.scale || 0 },
              { translateY: value?.translateY || 50 },
            ],
            opacity: value?.opacity || 0,
          };
        });

        return (
          <Animated.Text
            key={index}
            style={[
              styles.mainText,
              char === SPLASH_CONFIG.content.accentCharacter ? styles.accentText : null,
              animatedStyle,
            ]}
          >
            {char}
          </Animated.Text>
        );
      })}
    </View>
  );
};

interface SortxPortSplashProps {
  onAnimationComplete?: () => void;
}

const SortxPortSplash: React.FC<SortxPortSplashProps> = ({ onAnimationComplete }) => {
  const backgroundOpacity = useSharedValue(0);

  useEffect(() => {
    // Fade in background
    backgroundOpacity.value = withTiming(1, { duration: SPLASH_CONFIG.timing.backgroundFadeIn });

    // Auto-complete after total duration
    if (onAnimationComplete) {
      const timer = setTimeout(onAnimationComplete, SPLASH_CONFIG.timing.totalDuration);
      return () => clearTimeout(timer);
    }
  }, [onAnimationComplete]);

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Background gradient */}
      <Animated.View style={[styles.background, backgroundStyle]}>
        <LinearGradient
          colors={SPLASH_CONFIG.colors.background}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Grid pattern overlay */}
      <View style={styles.gridPattern} />

      {/* Floating elements */}
      {SPLASH_CONFIG.layout.floatingElements.map((element, index) => (
        <FloatingElement
          key={index}
          delay={SPLASH_CONFIG.timing.floatingElementDelays[index]}
          size={element.size}
          leftPercent={element.leftPercent}
          topPercent={element.topPercent}
        />
      ))}

      {/* Floating cards */}
      {SPLASH_CONFIG.content.cards.map((cardConfig, index) => (
        <FloatingCard
          key={cardConfig.key}
          image={SPLASH_CONFIG.images[cardConfig.key as keyof typeof SPLASH_CONFIG.images]}
          title={cardConfig.title}
          subtitle={cardConfig.subtitle}
          initialRotation={cardConfig.initialRotation}
          animationDelay={SPLASH_CONFIG.timing.cardAnimationDelays[cardConfig.key as keyof typeof SPLASH_CONFIG.timing.cardAnimationDelays]}
          animationDuration={SPLASH_CONFIG.timing.cardAnimationDurations[cardConfig.key as keyof typeof SPLASH_CONFIG.timing.cardAnimationDurations]}
        />
      ))}

      {/* Main text */}
      <View style={styles.mainTextContainer}>
        <AnimatedText />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  gridPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.1,
    backgroundColor: 'transparent',
  },
  floatingElement: {
    position: 'absolute',
    backgroundColor: SPLASH_CONFIG.colors.floatingElements,
    borderRadius: 50,
    shadowColor: SPLASH_CONFIG.colors.floatingElements,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  floatingCard: {
    position: 'absolute',
    width: SPLASH_CONFIG.layout.cardWidth,
    height: SPLASH_CONFIG.layout.cardHeight,
    backgroundColor: SPLASH_CONFIG.colors.cardBackground,
    borderRadius: SPLASH_CONFIG.layout.cardBorderRadius,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.4,
    shadowRadius: 50,
    elevation: 25,
  },
  cardContent: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: SPLASH_CONFIG.layout.cardBorderRadius,
  },
  cardImage: {
    width: '100%',
    height: SPLASH_CONFIG.layout.cardImageHeight,
    borderTopLeftRadius: SPLASH_CONFIG.layout.cardBorderRadius,
    borderTopRightRadius: SPLASH_CONFIG.layout.cardBorderRadius,
  },
  cardText: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: SPLASH_CONFIG.colors.cardTextPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: SPLASH_CONFIG.colors.cardTextSecondary,
    textAlign: 'center',
  },
  mainTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainText: {
    fontSize: SCREEN_WIDTH > 400 ? SPLASH_CONFIG.layout.textSize.large : SPLASH_CONFIG.layout.textSize.small,
    fontWeight: '900',
    color: SPLASH_CONFIG.colors.textPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 32,
    letterSpacing: 2,
  },
  accentText: {
    color: SPLASH_CONFIG.colors.accent,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 40,
  },
});

export default SortxPortSplash;
