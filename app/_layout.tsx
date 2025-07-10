import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import { AppProvider } from '../contexts/AppContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AppProvider>
  );
}

function RootNavigator() {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    checkFirstLaunch();
  }, []);

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

  if (isFirstLaunch === null) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {isFirstLaunch ? (
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