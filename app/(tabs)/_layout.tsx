import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { getCurrentTheme } from '../../utils/theme';
import { useApp } from '../../contexts/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { settings } = useApp();
  const theme = getCurrentTheme();
  const insets = useSafeAreaInsets();
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
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
        },
        tabBarItemStyle: {
          paddingVertical: 4,
          paddingBottom: Platform.select({
            android: 4,
            ios: 0,
          }),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Inter-Medium',
          marginTop: 2,
          marginBottom: Platform.select({
            android: 2,
            ios: 0,
          }),
        },
        // Ensure tab bar is always visible
        tabBarHideOnKeyboard: false,
        tabBarPosition: 'bottom',
        // Valid animation options
        animation: 'shift',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color, focused }) => (
            <Ionicons 
              name={focused ? "home" : "home-outline"} 
              size={size} 
              color={color}
              style={{
                transform: [{ scale: focused ? 1.05 : 1 }],
                opacity: focused ? 1 : 0.8,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="albums"
        options={{
          title: 'Albums',
          tabBarIcon: ({ size, color, focused }) => (
            <Ionicons 
              name={focused ? "folder-open" : "folder-open-outline"} 
              size={size} 
              color={color}
              style={{
                transform: [{ scale: focused ? 1.05 : 1 }],
                opacity: focused ? 1 : 0.8,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="nsfw-albums"
        options={{
          title: 'NSFW',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons 
              name="emoticon-devil" 
              size={24} 
              color={color}
              style={{
                transform: [{ scale: focused ? 1.05 : 1 }],
                opacity: focused ? 1 : 0.8,
              }}
            />
          ),
          // Hide the tab completely when showModeratedContent is false
          href: settings.showModeratedContent ? '/nsfw-albums' : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'settings' : 'settings-outline'} 
              size={24} 
              color={color}
              style={{
                transform: [{ scale: focused ? 1.05 : 1 }],
                opacity: focused ? 1 : 0.8,
              }}
            />
          ),
        }}
      />
    </Tabs>
  );
}