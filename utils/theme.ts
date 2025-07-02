import { AppTheme } from '../types';

export const defaultLightTheme: AppTheme = {
  colors: {
    primary: '#6366F1',
    secondary: '#8B5CF6',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
  },
};

export const defaultDarkTheme: AppTheme = {
  colors: {
    primary: '#818CF8',
    secondary: '#A78BFA',
    background: '#0F172A',
    surface: '#1E293B',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#334155',
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
  },
};

// Export the current theme (will be dynamic based on user settings)
export let lightTheme = defaultLightTheme;
export let darkTheme = defaultDarkTheme;

export const updateThemeColors = (customColors: Partial<AppTheme['colors']>, isDark: boolean = false) => {
  const baseTheme = isDark ? defaultDarkTheme : defaultLightTheme;
  const updatedTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...customColors,
    },
  };
  
  if (isDark) {
    darkTheme = updatedTheme;
  } else {
    lightTheme = updatedTheme;
  }
  
  return updatedTheme;
};