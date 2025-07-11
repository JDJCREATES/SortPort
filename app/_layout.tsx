import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  Text, 
  Alert,
  StatusBar,
  Platform 
} from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider } from '../contexts/AppContext';
import { MediaStorage } from '../utils/mediaStorage';
import { getCurrentTheme, ThemeManager } from '../utils/theme';
import { AppTheme } from '../types';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; theme: AppTheme },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; theme: AppTheme }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
    
    // Log to crash reporting service in production
    // crashlytics().recordError(error);
  }

  render() {
    if (this.state.hasError) {
      const styles = createErrorStyles(this.props.theme);
      
      return (
        <View style={styles.errorContainer}>
          <StatusBar 
            barStyle={this.props.theme.colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
            backgroundColor={this.props.theme.colors.background}
          />
          <Ionicons 
            name="warning-outline" 
            size={64} 
            color={this.props.theme.colors.error} 
          />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            The app encountered an unexpected error. Please restart the app.
          </Text>
          <Text style={styles.errorDetails}>
            {this.state.error?.message || 'Unknown error occurred'}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

// Loading Component
const LoadingScreen: React.FC<{ theme: AppTheme; message?: string }> = ({ 
  theme, 
  message = 'Loading...' 
}) => {
  const styles = createLoadingStyles(theme);
  
  return (
    <Animated.View 
      entering={FadeIn.duration(300)} 
      exiting={FadeOut.duration(300)}
      style={styles.container}
    >
      <StatusBar 
        barStyle={theme.colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.content}>
        <ActivityIndicator 
          size="large" 
          color={theme.colors.primary} 
          style={styles.spinner}
        />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
};

// Main Layout Component
export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');

  // Subscribe to theme changes
  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    const unsubscribe = themeManager.subscribe((newTheme) => {
      setCurrentTheme(newTheme);
    });
    return unsubscribe;
  }, []);

  // Initialize app
  const initializeApp = useCallback(async () => {
    try {
      setLoadingMessage('Loading settings...');
      
      // Load app settings and initialize theme
      const settings = await MediaStorage.loadSettings();
      const themeManager = ThemeManager.getInstance();
      themeManager.initializeFromSettings(settings);
      
      setLoadingMessage('Preparing app...');
      
      // Small delay to ensure everything is properly initialized
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setAppIsReady(true);
      
    } catch (error) {
      console.error('App initialization error:', error);
      setInitializationError(
        error instanceof Error 
          ? error.message 
          : 'Failed to initialize app. Please restart the app.'
      );
    }
  }, []);

  // Run initialization
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // Hide splash screen when ready
  useEffect(() => {
    if (appIsReady || initializationError) {
      const hideSplash = async () => {
        try {
          await SplashScreen.hideAsync();
        } catch (error) {
          console.warn('Error hiding splash screen:', error);
        }
      };
      
      // Small delay for smooth transition
      setTimeout(hideSplash, 100);
    }
  }, [appIsReady, initializationError]);

  // Handle initialization error
  if (initializationError) {
    const styles = createErrorStyles(currentTheme);
    
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={styles.errorContainer}>
            <StatusBar 
              barStyle={currentTheme.colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
              backgroundColor={currentTheme.colors.background}
            />
            <Ionicons 
              name="alert-circle-outline" 
              size={64} 
              color={currentTheme.colors.error} 
            />
            <Text style={styles.errorTitle}>Initialization Failed</Text>
            <Text style={styles.errorMessage}>{initializationError}</Text>
            <Text style={styles.errorHint}>
              Try restarting the app. If the problem persists, please contact support.
            </Text>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Show loading screen while initializing
  if (!appIsReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <LoadingScreen theme={currentTheme} message={loadingMessage} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Main app layout
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary theme={currentTheme}>
          <AppProvider>
            <StatusBar 
              barStyle={currentTheme.colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
              backgroundColor={currentTheme.colors.background}
              translucent={false}
            />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { 
                  backgroundColor: currentTheme.colors.background 
                },
                animation: 'slide_from_right',
                animationDuration: 300,
              }}
            >
              <Stack.Screen 
                name="(tabs)" 
                options={{ 
                  headerShown: false,
                  gestureEnabled: false, // Disable swipe back on tab navigator
                }} 
              />
              <Stack.Screen 
                name="album/[id]" 
                options={{ 
                  headerShown: false,
                  presentation: 'card',
                  gestureEnabled: true,
                }} 
              />
              <Stack.Screen 
                name="welcome" 
                options={{ 
                  headerShown: false,
                  presentation: 'modal',
                  gestureEnabled: false,
                }} 
              />
            </Stack>
          </AppProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Styles using system fonts
const createLoadingStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  spinner: {
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});

const createErrorStyles = (theme: AppTheme) => StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  errorMessage: {
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorDetails: {
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.error,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.8,
  },
  errorHint: {
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: theme.spacing.sm,
    opacity: 0.7,
  },
});