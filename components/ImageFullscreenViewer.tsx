import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  StatusBar,
  Dimensions,
  Platform,
  Share,
  Alert,
  Pressable,
} from 'react-native';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  clamp,
  useAnimatedGestureHandler,
} from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { ImageViewerData } from '../types/display';
import { lightTheme } from '../utils/theme';

type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center';

interface ImageFullscreenViewerProps {
  visible: boolean;
  images: ImageViewerData[];
  initialIndex: number;
  onClose: () => void;
  onImageChange?: (index: number) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_HEIGHT = 60;
const INFO_PANEL_HEIGHT = 300;
const SWIPE_THRESHOLD = 50;
const ZOOM_THRESHOLD = 1.2;

export function ImageFullscreenViewer({
  visible,
  images,
  initialIndex,
  onClose,
  onImageChange,
}: ImageFullscreenViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [imageResizeMode, setImageResizeMode] = useState<ResizeMode>('contain');

  // Animation values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const imageTranslateX = useSharedValue(0);
  const infoPanelTranslateY = useSharedValue(INFO_PANEL_HEIGHT);
  const controlsOpacity = useSharedValue(1);

  // Auto-hide controls timer
  const hideControlsTimer = React.useRef<NodeJS.Timeout | null>(null);

  const currentImage = useMemo(() => {
    return images[currentIndex] || null;
  }, [images, currentIndex]);

  const resetImageTransform = useCallback(() => {
    'worklet';
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
  }, [scale, translateX, translateY]);

  const showControls = useCallback(() => {
    controlsOpacity.value = withTiming(1, { duration: 200 });
    setIsControlsVisible(true);
    
    // Clear existing timer
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    
    // Set new timer to hide controls
    hideControlsTimer.current = setTimeout(() => {
      controlsOpacity.value = withTiming(0, { duration: 200 });
      setIsControlsVisible(false);
    }, 3000);
  }, [controlsOpacity]);

  const hideControls = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    controlsOpacity.value = withTiming(0, { duration: 200 });
    setIsControlsVisible(false);
  }, [controlsOpacity]);

  const toggleControls = useCallback(() => {
    if (isControlsVisible) {
      hideControls();
    } else {
      showControls();
    }
  }, [isControlsVisible, showControls, hideControls]);

  const changeImage = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < images.length) {
      setCurrentIndex(newIndex);
      onImageChange?.(newIndex);
      resetImageTransform();
      imageTranslateX.value = 0;
    }
  }, [images.length, onImageChange, resetImageTransform, imageTranslateX]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      changeImage(currentIndex - 1);
    }
  }, [currentIndex, changeImage]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      changeImage(currentIndex + 1);
    }
  }, [currentIndex, images.length, changeImage]);

  const toggleInfoPanel = useCallback(() => {
    const newVisibility = !isInfoVisible;
    setIsInfoVisible(newVisibility);
    infoPanelTranslateY.value = withSpring(
      newVisibility ? 0 : INFO_PANEL_HEIGHT,
      { damping: 20, stiffness: 90 }
    );
  }, [isInfoVisible, infoPanelTranslateY]);

  const cycleResizeMode = useCallback(() => {
    const modes: ResizeMode[] = ['contain', 'cover', 'stretch', 'center'];
    const currentIndex = modes.indexOf(imageResizeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setImageResizeMode(modes[nextIndex]);
  }, [imageResizeMode]);
  const handleShare = useCallback(async () => {
    if (!currentImage) return;
    
    try {
      if (Platform.OS === 'web') {
        // Web fallback
        if (navigator.share) {
          await navigator.share({
            title: currentImage.filename,
            text: `Check out this image: ${currentImage.filename}`,
            url: currentImage.uri,
          });
        } else {
          // Fallback for browsers without Web Share API
          await navigator.clipboard.writeText(currentImage.uri);
          Alert.alert('Copied', 'Image URL copied to clipboard');
        }
      } else {
        await Share.share({
          url: currentImage.uri,
          title: currentImage.filename,
        });
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      Alert.alert('Error', 'Failed to share image');
    }
  }, [currentImage]);

  const handleDownload = useCallback(() => {
    if (!currentImage) return;
    
    if (Platform.OS === 'web') {
      // Web download
      const link = document.createElement('a');
      link.href = currentImage.uri;
      link.download = currentImage.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Alert.alert('Download', 'Download functionality would be implemented here');
    }
  }, [currentImage]);

  // Pan gesture for image movement and navigation
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1) {
        // Pan when zoomed
        translateX.value = event.translationX;
        translateY.value = event.translationY;
      } else {
        // Horizontal swipe for navigation
        imageTranslateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        // Snap back if panned too far when zoomed
        const maxTranslateX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
        const maxTranslateY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;
        
        translateX.value = withSpring(
          clamp(translateX.value, -maxTranslateX, maxTranslateX)
        );
        translateY.value = withSpring(
          clamp(translateY.value, -maxTranslateY, maxTranslateY)
        );
      } else {
        // Handle navigation swipe
        const threshold = SCREEN_WIDTH * 0.3;
        
        if (Math.abs(event.translationX) > threshold) {
          if (event.translationX > 0 && currentIndex > 0) {
            runOnJS(goToPrevious)();
          } else if (event.translationX < 0 && currentIndex < images.length - 1) {
            runOnJS(goToNext)();
          }
        }
        
        imageTranslateX.value = withSpring(0);
      }
    });

  // Pinch gesture for zoom
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clamp(event.scale, 0.5, 3);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
      } else if (scale.value > 2.5) {
        scale.value = withSpring(2.5);
      }
      
      // Reset translation if zoomed out
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  // Double tap gesture for zoom toggle
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        runOnJS(resetImageTransform)();
      } else {
        scale.value = withSpring(2);
      }
    });

  // Single tap gesture for controls toggle
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(toggleControls)();
    });

  // Swipe up gesture for info panel
  const swipeUpGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow info panel toggle when image is not zoomed
      if (scale.value > 1.1) return;
      
      if (event.translationY < -SWIPE_THRESHOLD && !isInfoVisible) {
        runOnJS(toggleInfoPanel)();
      } else if (event.translationY > SWIPE_THRESHOLD && isInfoVisible) {
        runOnJS(toggleInfoPanel)();
      }
    });

  // Combined gestures
  const composedGesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTapGesture, singleTapGesture),
    Gesture.Simultaneous(panGesture, pinchGesture),
    swipeUpGesture
  );

  // Animated styles
  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + imageTranslateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const controlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const infoPanelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: infoPanelTranslateY.value }],
  }));

  // Format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Initialize on mount
  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      resetImageTransform();
      showControls();
    }
  }, [visible, initialIndex, resetImageTransform, showControls]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, []);

  if (!visible || !currentImage) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <GestureHandlerRootView style={styles.container}>
        <View style={styles.background}>
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={styles.imageContainer}>
              <Animated.Image
                source={{ uri: currentImage.uri }}
                style={[styles.image, imageAnimatedStyle]}
                resizeMode={imageResizeMode}
              />
            </Animated.View>
          </GestureDetector>

          {/* Header Controls */}
          <Animated.View style={[styles.header, controlsAnimatedStyle]}>
            <Pressable style={styles.headerButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentImage.filename}
            </Text>
            <View style={styles.headerActions}>
              <Pressable style={styles.headerButton} onPress={cycleResizeMode}>
                <MaterialIcons name="crop" size={20} color="white" />
              </Pressable>
              <Pressable style={styles.headerButton} onPress={handleShare}>
                <Ionicons name="share" size={20} color="white" />
              </Pressable>
              <Pressable style={styles.headerButton} onPress={handleDownload}>
                <Ionicons name="download" size={20} color="white" />
              </Pressable>
              <Pressable style={styles.headerButton} onPress={toggleInfoPanel}>
                <Ionicons name="information-circle" size={20} color="white" />
              </Pressable>
            </View>
          </Animated.View>

      {/* Navigation Controls */}
<Animated.View style={[styles.navigationContainer, controlsAnimatedStyle]}>
  {currentIndex > 0 && (
    <Pressable style={[styles.navButton, styles.navButtonLeft]} onPress={goToPrevious}>
      <Ionicons name="chevron-back" size={32} color="white" />
    </Pressable>
  )}
  {currentIndex < images.length - 1 && (
    <Pressable style={[styles.navButton, styles.navButtonRight]} onPress={goToNext}>
      <Ionicons name="chevron-forward" size={32} color="white" />
    </Pressable>
  )}
</Animated.View>


          {/* Image Counter */}
          <Animated.View style={[styles.counter, controlsAnimatedStyle]}>
            <Text style={styles.counterText}>
              {currentIndex + 1} of {images.length}
            </Text>
            <Text style={styles.resizeModeText}>
              {imageResizeMode.charAt(0).toUpperCase() + imageResizeMode.slice(1)}
            </Text>
          </Animated.View>

          {/* Info Panel */}
          <Animated.View style={[styles.infoPanel, infoPanelAnimatedStyle]}>
            <View style={styles.infoPanelHandle} />
            <View style={styles.infoPanelContent}>
              <Text style={styles.infoTitle}>{currentImage.filename}</Text>
              
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Dimensions</Text>
                  <Text style={styles.infoValue}>
                    {currentImage.width} × {currentImage.height}
                  </Text>
                </View>
                
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>File Size</Text>
                  <Text style={styles.infoValue}>
                    {formatFileSize(currentImage.fileSize)}
                  </Text>
                </View>
                
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Created</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(currentImage.creationTime)}
                  </Text>
                </View>
                
                {currentImage.modificationTime && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Modified</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(currentImage.modificationTime)}
                    </Text>
                  </View>
                )}
                
                {currentImage.location && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Location</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.latitude.toFixed(6)}, {currentImage.location.longitude.toFixed(6)}
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.infoActions}>
                <Pressable style={styles.infoActionButton} onPress={handleShare}>
                  <Ionicons name="share" size={20} color={lightTheme.colors.primary} />
                  <Text style={styles.infoActionText}>Share</Text>
                </Pressable>
                
                <Pressable style={styles.infoActionButton} onPress={handleDownload}>
                  <Ionicons name="download" size={20} color={lightTheme.colors.primary} />
                  <Text style={styles.infoActionText}>Download</Text>
                </Pressable>
                
                <Pressable style={styles.infoActionButton}>
                  <Ionicons name="heart" size={20} color={lightTheme.colors.primary} />
                  <Text style={styles.infoActionText}>Favorite</Text>
                </Pressable>
                
                <Pressable style={styles.infoActionButton}>
                  <Ionicons name="ellipsis-vertical" size={20} color={lightTheme.colors.primary} />
                  <Text style={styles.infoActionText}>More</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: 'black',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT + (Platform.OS === 'ios' ? 44 : 24),
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  headerButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    flex: 1,
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginHorizontal: 16,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  navigationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonLeft: {
    left: 16,
  },
  navButtonRight: {
    right: 16,
  },
  counter: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 4,
  },
  resizeModeText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    opacity: 0.8,
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: INFO_PANEL_HEIGHT,
    backgroundColor: lightTheme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  infoPanelHandle: {
    width: 40,
    height: 4,
    backgroundColor: lightTheme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  infoPanelContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  infoItem: {
    width: '48%',
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: lightTheme.colors.text,
  },
  infoActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: lightTheme.colors.border,
  },
  infoActionButton: {
    alignItems: 'center',
    gap: 4,
  },
  infoActionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.primary,
  },
});