import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { lightTheme } from '../../utils/theme';
import { useApp } from '../../contexts/AppContext';

export default function TabLayout() {
  const { settings } = useApp();
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightTheme.colors.primary,
        tabBarInactiveTintColor: lightTheme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: lightTheme.colors.background,
          borderTopColor: lightTheme.colors.border,
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
            },
          }),
        },
        // Valid tab bar styling options
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Inter-Medium',
          marginTop: 2,
        },
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