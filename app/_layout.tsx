import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseAuth } from '../utils/supabase';
import { AlertCircle, RefreshCw } from 'lucide-react-native';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authCheckError, setAuthCheckError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    checkFirstLaunch();
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Log auth errors for debugging
  useEffect(() => {
    if (authCheckError) {
      console.error('Authentication check failed:', authCheckError);
    }
  }, [authCheckError]);

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem('@snapsort_has_launched');
      if (hasLaunched === null) {
        setIsFirstLaunch(true);
        await AsyncStorage.setItem('@snapsort_has_launched', 'true');
      } else {
        setIsFirstLaunch(false);
      }
    } catch (error) {
      console.error('Error checking first launch:', error);
      setIsFirstLaunch(false);
    }
  };

  const checkAuthStatus = async () => {
    try {
      setAuthCheckError(null);
      const user = await SupabaseAuth.getCurrentUser();
      setIsAuthenticated(!!user);
    } catch (error: any) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
      
      // Set a user-friendly error message
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        setAuthCheckError('Unable to connect to authentication service. Please check your internet connection.');
      } else if (error.message?.includes('Invalid API key') || error.message?.includes('unauthorized')) {
        setAuthCheckError('Authentication service configuration error. Please contact support.');
      } else {
        setAuthCheckError('Authentication check failed. Please try again.');
      }
    }
  };

  const handleRetryAuth = async () => {
    setIsRetrying(true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay for UX
    await checkAuthStatus();
    setIsRetrying(false);
  };

  // Set up auth state listener
  useEffect(() => {
    const { data: { subscription } } = SupabaseAuth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session?.user);
      // Clear auth errors when auth state changes successfully
      if (session?.user) {
        setAuthCheckError(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Show error screen if authentication check failed
  if (authCheckError) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="auto" />
        <View style={styles.errorContent}>
          <AlertCircle size={64} color="#EF4444" style={styles.errorIcon} />
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorMessage}>{authCheckError}</Text>
          <TouchableOpacity 
            style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]} 
            onPress={handleRetryAuth}
            disabled={isRetrying}
          >
            <RefreshCw 
              size={20} 
              color="white" 
              style={[styles.retryIcon, isRetrying && styles.retryIconSpinning]} 
            />
            <Text style={styles.retryButtonText}>
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.errorHint}>
            If this problem persists, please check your internet connection or contact support.
          </Text>
        </View>
      </View>
    );
  }

  // Still loading auth status
  if (isFirstLaunch === null || isAuthenticated === null) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Show welcome screen if first launch OR user is not authenticated */}
        {(isFirstLaunch || !isAuthenticated) ? (
          <Stack.Screen name="welcome" />
        ) : (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="welcome" />
          </>
        )}
        <Stack.Screen name="new-sort" />
        <Stack.Screen name="album/[id]" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorContent: {
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  errorIcon: {
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  retryButtonDisabled: {
    backgroundColor: '#94A3B8',
    elevation: 0,
    shadowOpacity: 0,
  },
  retryIcon: {
    marginRight: 8,
  },
  retryIconSpinning: {
    // Note: For a spinning animation, you'd need react-native-reanimated
    // This is just a placeholder for the styling
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  errorHint: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
});