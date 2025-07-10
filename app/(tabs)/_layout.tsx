import { Tabs } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { lightTheme } from '../../utils/theme';
import { useApp } from '../../contexts/AppContext';

export default function TabLayout() {
  const { userFlags, settings } = useApp();
  
  console.log('🐛 userFlags:', userFlags);
  console.log('🐛 settings.showModeratedContent:', settings.showModeratedContent);
  
  const shouldShowNsfw = (userFlags.isSubscribed || userFlags.hasUnlockPack) && settings.showModeratedContent;
  console.log('🐛 shouldShowNsfw:', shouldShowNsfw);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightTheme.colors.primary,
        tabBarInactiveTintColor: lightTheme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: lightTheme.colors.background,
          borderTopColor: lightTheme.colors.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="albums"
        options={{
          title: 'Albums',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="folder-open" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="nsfw-albums"
        options={{
          title: 'NSFW',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="emoticon-devil" size={24} color={color} />
          ),
          href: shouldShowNsfw ? '/nsfw-albums' : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}