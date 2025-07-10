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

// Create a theme manager class for better control
export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: AppTheme = defaultLightTheme;
  private isDarkMode: boolean = false;
  private listeners: ((theme: AppTheme, isDark: boolean) => void)[] = [];

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  getCurrentTheme(): AppTheme {
    return this.currentTheme;
  }

  isDark(): boolean {
    return this.isDarkMode;
  }

  setTheme(isDark: boolean, customColors?: Partial<AppTheme['colors']>): void {
    this.isDarkMode = isDark;
    const baseTheme = isDark ? defaultDarkTheme : defaultLightTheme;
    
    this.currentTheme = {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        ...customColors,
      },
    };

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.currentTheme, this.isDarkMode);
      } catch (error) {
        console.error('Error in theme listener:', error);
      }
    });
  }

  subscribe(listener: (theme: AppTheme, isDark: boolean) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
}

// Export the current theme (will be dynamic based on user settings)
export let lightTheme = defaultLightTheme;
export let darkTheme = defaultDarkTheme;

// Update theme colors function
export const updateThemeColors = (customColors: Partial<AppTheme['colors']>, isDark: boolean = false) => {
  const themeManager = ThemeManager.getInstance();
  themeManager.setTheme(isDark, customColors);
  
  const updatedTheme = themeManager.getCurrentTheme();
  
  if (isDark) {
    darkTheme = updatedTheme;
  } else {
    lightTheme = updatedTheme;
  }
  
  return updatedTheme;
};

// Helper function to get current theme
export const getCurrentTheme = (): AppTheme => {
  return ThemeManager.getInstance().getCurrentTheme();
};
