import React, { useState, useEffect, useCallback } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { getCurrentTheme, ThemeManager } from '../../utils/theme';
import { useApp } from '../../contexts/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme } from '../../types';
import { GlobalChatOverlay } from '../../components/GlobalChatOverlay';

export default function TabLayout() {
  const { settings } = useApp();
  const insets = useSafeAreaInsets();
  
  // State to force re-render when theme changes
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getCurrentTheme());
  
  // Subscribe to theme changes
  useEffect(() => {
    const themeManager = ThemeManager.getInstance();
    
    // Subscribe to theme changes
    const unsubscribe = themeManager.subscribe((newTheme, isDark) => {
      // Only update if the theme actually changed to prevent loops
      setCurrentTheme(prevTheme => {
        // Deep comparison of relevant theme properties
        const hasChanged = 
          prevTheme.colors.primary !== newTheme.colors.primary ||
          prevTheme.colors.background !== newTheme.colors.background ||
          prevTheme.colors.textSecondary !== newTheme.colors.textSecondary ||
          prevTheme.colors.border !== newTheme.colors.border;
        
        return hasChanged ? newTheme : prevTheme;
      });
    });
    
    // Cleanup subscription on unmount
    return unsubscribe;
  }, []); // Empty dependency array - only run once on mount
  
  // Memoize tab bar style to prevent unnecessary recalculations
  const tabBarStyle = React.useMemo(() => ({
    backgroundColor: currentTheme.colors.background,
    borderTopColor: currentTheme.colors.border,
    // Ensure proper spacing above system buttons
    paddingBottom: Platform.select({
      android: Math.max(insets.bottom, 8), // Ensure minimum 8px padding
      ios: insets.bottom,
    }),
    height: Platform.select({
      android: 60 + Math.max(insets.bottom, 8), // Base height + safe area
      ios: 60 + insets.bottom,
    }),
    // Add subtle shadow/elevation
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
        borderTopWidth: 1,
      },
    }),
  }), [currentTheme.colors.background, currentTheme.colors.border, insets.bottom]);

  // Memoize tab bar item style
  const tabBarItemStyle = React.useMemo(() => ({
    paddingVertical: 4,
    paddingBottom: Platform.select({
      android: 4,
      ios: 0,
    }),
  }), []);

  // Memoize tab bar label style
  const tabBarLabelStyle = React.useMemo(() => ({
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
    marginBottom: Platform.select({
      android: 2,
      ios: 0,
    }),
  }), []);

  // Memoize screen options to prevent recreation
  const screenOptions = React.useMemo(() => ({
    headerShown: false,
    tabBarActiveTintColor: currentTheme.colors.primary,
    tabBarInactiveTintColor: currentTheme.colors.textSecondary,
    tabBarStyle,
    tabBarItemStyle,
    tabBarLabelStyle,
    // Ensure tab bar is always visible
    tabBarHideOnKeyboard: false,
    tabBarPosition: 'bottom' as const,
    // Valid animation options
    animation: 'shift' as const,
  }), [
    currentTheme.colors.primary,
    currentTheme.colors.textSecondary,
    tabBarStyle,
    tabBarItemStyle,
    tabBarLabelStyle,
  ]);

  // Memoize icon components to prevent unnecessary re-renders
  const AlbumsIcon = useCallback(({ size, color, focused }: { size: number; color: string; focused: boolean }) => (
    <Ionicons 
      name={focused ? "folder-open" : "folder-open-outline"} 
      size={size} 
      color={color}
      style={{
        transform: [{ scale: focused ? 1.05 : 1 }],
        opacity: focused ? 1 : 0.8,
      }}
    />
  ), []);

  const NSFWIcon = useCallback(({ color, focused }: { color: string; focused: boolean }) => (
    <MaterialCommunityIcons 
      name="emoticon-devil" 
      size={24} 
      color={color}
      style={{
        transform: [{ scale: focused ? 1.05 : 1 }],
        opacity: focused ? 1 : 0.8,
      }}
    />
  ), []);

  const SettingsIcon = useCallback(({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons 
      name={focused ? 'settings' : 'settings-outline'} 
      size={24} 
      color={color}
      style={{
        transform: [{ scale: focused ? 1.05 : 1 }],
        opacity: focused ? 1 : 0.8,
      }}
    />
  ), []);

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="index"
          options={{
            href: null, // Hide this tab from the tab bar
          }}
        />
        <Tabs.Screen
          name="albums"
          options={{
            title: 'Albums',
            tabBarIcon: AlbumsIcon,
          }}
        />
        <Tabs.Screen
          name="nsfw-albums"
          options={{
            title: 'NSFW',
            tabBarIcon: NSFWIcon,
            // Hide the tab completely when showModeratedContent is false
            href: settings.showModeratedContent ? '/nsfw-albums' : null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: SettingsIcon,
          }}
        />
      </Tabs>
      <GlobalChatOverlay />
    </View>
  );
}