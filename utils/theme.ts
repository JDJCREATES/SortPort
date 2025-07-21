import { AppTheme } from '../types';

// Utility functions for color manipulation
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

const generateShade = (hex: string, percent: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const factor = (100 - percent) / 100;
  const r = Math.round(rgb.r * factor);
  const g = Math.round(rgb.g * factor);
  const b = Math.round(rgb.b * factor);
  
  return rgbToHex(Math.max(0, r), Math.max(0, g), Math.max(0, b));
};

const generateTint = (hex: string, percent: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const factor = percent / 100;
  const r = Math.round(rgb.r + (255 - rgb.r) * factor);
  const g = Math.round(rgb.g + (255 - rgb.g) * factor);
  const b = Math.round(rgb.b + (255 - rgb.b) * factor);
  
  return rgbToHex(Math.min(255, r), Math.min(255, g), Math.min(255, b));
};

// Calculate luminance for contrast checking
const getLuminance = (hex: string): number => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  
  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

// Calculate contrast ratio between two colors
const calculateContrastRatio = (color1: string, color2: string): number => {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
};

// Intelligently invert a color for dark mode
const invertColorForDarkMode = (hex: string): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const luminance = getLuminance(hex);
  
  // If it's already dark, make it lighter
  if (luminance < 0.5) {
    // For dark colors, create a lighter version
    return generateTint(hex, 60); // Make it 60% lighter
  } else {
    // For light colors, create a darker version
    return generateShade(hex, 70); // Make it 70% darker
  }
};

// Generate surface colors dynamically based on background
const generateSurfaceColors = (backgroundColor: string, isDark: boolean) => {
  const luminance = getLuminance(backgroundColor);
  
  if (isDark) {
    // For dark mode, create lighter surfaces
    return {
      surface: generateTint(backgroundColor, luminance > 0.1 ? 12 : 18),
      surfaceVariant: generateTint(backgroundColor, luminance > 0.1 ? 8 : 12),
      border: generateTint(backgroundColor, luminance > 0.1 ? 25 : 35),
    };
  } else {
    // For light mode, create darker surfaces
    return {
      surface: generateShade(backgroundColor, luminance < 0.8 ? 8 : 5),
      surfaceVariant: generateShade(backgroundColor, luminance < 0.8 ? 4 : 2),
      border: generateShade(backgroundColor, luminance < 0.8 ? 20 : 15),
    };
  }
};

// Generate text colors with guaranteed contrast
const generateTextColors = (backgroundColor: string, isDark: boolean) => {
  const luminance = getLuminance(backgroundColor);
  
  // Define high contrast text colors
  const lightText = '#FFFFFF';
  const darkText = '#000000';
  const lightSecondary = '#E2E8F0';
  const darkSecondary = '#475569';
  
  // Calculate contrast ratios
  const lightContrast = calculateContrastRatio(backgroundColor, lightText);
  const darkContrast = calculateContrastRatio(backgroundColor, darkText);
  
  // Choose text color based on best contrast (minimum 4.5:1 for accessibility)
  if (lightContrast > darkContrast && lightContrast >= 4.5) {
    return {
      text: lightText,
      textSecondary: lightSecondary,
    };
  } else if (darkContrast >= 4.5) {
    return {
      text: darkText,
      textSecondary: darkSecondary
    };
  } else {
    // Fallback based on luminance if neither meets contrast requirements
    if (luminance > 0.5) {
      return {
        text: '#1A1A1A',
        textSecondary: '#4A4A4A',
      };
    } else {
      return {
        text: '#F5F5F5',
        textSecondary: '#D1D5DB',
      };
    }
  }
};

// Single set of background colors - the system will handle dark mode conversion
export const BACKGROUND_COLORS = [
  '#FFFFFF', // Pure White
  '#F8F4F0', // Cloud Cream
  '#F5EBDD', // Linen Sand
  '#EDE5D1', // Pebble Beige
  '#ECECEC', // Mist Grey
  '#D6D3D1', // Soft Ash
  '#CFCFCF', // Silver Veil
  '#D8CAB8', // Greige Glow
  '#EAEAEA', // Pastel Fog
  '#FFE4E1', // Misty Rose
  '#E6E6FA', // Lavender
  '#e2e9efff', // Alice Blue
  '#F5FFFA', // Mint Cream
  '#fbf4d5ff', // Cornsilk
  '#FFE4B5', // Moccasin
  '#FFEFD5', // Papaya Whip
  '#E0FFFF', // Light Cyan
  '#F0FFF0', // Honeydew
  '#FDF5E6', // Old Lace
  '#FFB6C1', // Light Pink
  '#DDA0DD', // Plum
  '#87CEEB', // Sky Blue
  '#98FB98', // Pale Green
  '#F0E68C', // Khaki
  '#FFA07A', // Light Salmon
  '#20B2AA', // Light Sea Green
  '#87CEFA', // Light Sky Blue
  '#DEB887', // Burlywood
  '#F5DEB3', // Wheat
  // Keep essential darks for contrast
  '#A1A1AA', // Soft Charcoal
  '#1F2937', // Iron Black
  '#111827', // Obsidian Shadow
  '#171717', // Carbon Depth
];

// Accent colors with your new palette
export const ACCENT_COLORS = [
  '#FF6B6B', // Flame Coral
  '#FF9E5E', // Apricot Pop
  '#FFD166', // Golden Glow
  '#FFB3A7', // Melon Soda
  '#F9A8D4', // Blush Pink
  '#FF7EB9', // Bubblegum Bloom
  '#D72638', // Raspberry Rush
  '#E07A5F', // Terracotta Clay
  '#BC4B51', // Rosewood Blush
  '#DDBEA9', // Sandalwood Spice
  '#CDB4DB', // Orchid Mist
  '#A78BFA', // Lavender Smoke
  '#7C3AED', // Grape Royale
  '#BFA2DB', // Lilac Storm
  '#9B5DE5', // Mauve Twilight
  '#3A86FF', // Skybeam Blue
  '#B3CDE0', // Powder Blue
  '#5BC0EB', // Azure Snap
  '#00B5D8', // Cyan Drift
  '#9AE6B4', // Mint Sorbet
  '#34D399', // Emerald Palm
  '#228B22', // Jade Forest
  '#A3E635', // Lime Ice
  '#2EC4B6', // Teal Lake
  '#587792', // Denim Dust
  '#4C51BF', // Steel Indigo
  '#F4A261', // Marigold Flame
  '#DB2777', // Magenta Bloom
  '#E11D48', // Cherry Punch
  '#B5179E', // Electric Purple
];

export const defaultLightTheme: AppTheme = {
  colors: {
    primary: '#6366F1',
    secondary: '#FFFFFF',
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
    secondary: '#0F172A',
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

// Enhanced Theme Manager
export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: AppTheme = defaultLightTheme;
  private isDarkMode: boolean = false;
  private customColors: Partial<AppTheme['colors']> = {};
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

  getCustomColors(): Partial<AppTheme['colors']> {
    return this.customColors;
  }

  setTheme(isDark: boolean, customColors?: Partial<AppTheme['colors']>): void {
    this.isDarkMode = isDark;
    this.customColors = customColors || {};
    
    const baseTheme = isDark ? defaultDarkTheme : defaultLightTheme;
    
    // Start with base theme
    let themeColors = { ...baseTheme.colors };
    
    // Apply custom colors intelligently
    if (this.customColors.primary) {
      if (isDark) {
        // For dark mode, slightly lighten the chosen primary color for better visibility
        themeColors.primary = generateTint(this.customColors.primary, 20);
      } else {
        themeColors.primary = this.customColors.primary;
      }
    }
    
    if (this.customColors.secondary) {
      let backgroundColor = this.customColors.secondary;
      
      // For dark mode, darken the chosen background color
      if (isDark) {
        backgroundColor = generateShade(backgroundColor, 75); // Darken by 75%
      }
      
      themeColors.background = backgroundColor;
      themeColors.secondary = backgroundColor;
      
      // Generate surface colors dynamically based on the darkened/original color
      const surfaceColors = generateSurfaceColors(backgroundColor, isDark);
      themeColors = { ...themeColors, ...surfaceColors };
      
      // Generate text colors with guaranteed contrast
      const textColors = generateTextColors(backgroundColor, isDark);
      themeColors = { ...themeColors, ...textColors };
    }
    
    // Apply any other custom colors with appropriate dark mode adjustments
    Object.keys(this.customColors).forEach(key => {
      if (key !== 'primary' && key !== 'secondary') {
        const colorKey = key as keyof AppTheme['colors'];
        const customColor = this.customColors[colorKey]!;
        
        if (isDark) {
          // For dark mode, adjust colors appropriately
          if (key === 'text' || key === 'textSecondary') {
            // Text colors should be lightened in dark mode
            themeColors[colorKey] = generateTint(customColor, 30);
          } else {
            // Other colors should be slightly darkened or kept as-is
            themeColors[colorKey] = generateShade(customColor, 20);
          }
        } else {
          themeColors[colorKey] = customColor;
        }
      }
    });
    
    this.currentTheme = {
      ...baseTheme,
      colors: themeColors,
    };

    // Update global theme references
    if (isDark) {
      darkTheme = this.currentTheme;
    } else {
      lightTheme = this.currentTheme;
    }

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.currentTheme, this.isDarkMode);
      } catch (error) {
        console.error('Error in theme listener:', error);
      }
    });
  }

  // Update a specific color and refresh theme
  updateColor(colorKey: keyof AppTheme['colors'], color: string): void {
    this.customColors = {
      ...this.customColors,
      [colorKey]: color,
    };
    
    // Refresh theme with updated colors
    this.setTheme(this.isDarkMode, this.customColors);
  }

  // Reset a specific color to default
  resetColor(colorKey: keyof AppTheme['colors']): void {
    const updatedColors = { ...this.customColors };
    delete updatedColors[colorKey];
    this.customColors = updatedColors;
    
    // Refresh theme
    this.setTheme(this.isDarkMode, this.customColors);
  }

  // Reset all colors to default
  resetAllColors(): void {
    this.customColors = {};
    this.setTheme(this.isDarkMode, {});
  }

  subscribe(listener: (theme: AppTheme, isDark: boolean) => void): () => void {
    this.listeners.push(listener);
    
    // Immediately call listener with current theme
    try {
      listener(this.currentTheme, this.isDarkMode);
    } catch (error) {
      console.error('Error calling theme listener:', error);
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Method to initialize theme from settings
  initializeFromSettings(settings: { darkMode: boolean; customColors?: Partial<AppTheme['colors']> }): void {
    console.log('🎨 Initializing theme from settings:', settings);
    this.setTheme(settings.darkMode, settings.customColors);
  }

  // Helper method to preview theme changes without applying them
  previewTheme(customColors: Partial<AppTheme['colors']>): AppTheme {
    const baseTheme = this.isDarkMode ? defaultDarkTheme : defaultLightTheme;
    let themeColors = { ...baseTheme.colors };
    
    // Apply preview colors intelligently
    if (customColors.primary) {
      if (this.isDarkMode) {
        themeColors.primary = generateTint(customColors.primary, 20);
      } else {
        themeColors.primary = customColors.primary;
      }
    }
    
    if (customColors.secondary) {
      let backgroundColor = customColors.secondary;
      
      // For dark mode, darken the chosen background color
      if (this.isDarkMode) {
        backgroundColor = generateShade(backgroundColor, 75);
      }
      
      themeColors.background = backgroundColor;
      themeColors.secondary = backgroundColor;
      
      const surfaceColors = generateSurfaceColors(backgroundColor, this.isDarkMode);
      themeColors = { ...themeColors, ...surfaceColors };
      
      const textColors = generateTextColors(backgroundColor, this.isDarkMode);
      themeColors = { ...themeColors, ...textColors };
    }
    
    // Apply other custom colors with dark mode adjustments
    Object.keys(customColors).forEach(key => {
      if (key !== 'primary' && key !== 'secondary') {
        const colorKey = key as keyof AppTheme['colors'];
        const customColor = customColors[colorKey]!;
        
        if (this.isDarkMode) {
          if (key === 'text' || key === 'textSecondary') {
            themeColors[colorKey] = generateTint(customColor, 30);
          } else {
            themeColors[colorKey] = generateShade(customColor, 20);
          }
        } else {
          themeColors[colorKey] = customColor;
        }
      }
    });
    
    return {
      ...baseTheme,
      colors: themeColors,
    };
  }

  // Get contrast ratio for accessibility checking
  getContrastRatio(color1: string, color2: string): number {
    return calculateContrastRatio(color1, color2);
  }
}

// Export the current theme (will be dynamic based on user settings)
export let lightTheme = defaultLightTheme;
export let darkTheme = defaultDarkTheme;

// Update theme colors function - now uses ThemeManager methods
export const updateThemeColors = (customColors: Partial<AppTheme['colors']>, isDark: boolean = false) => {
  const themeManager = ThemeManager.getInstance();
  themeManager.setTheme(isDark, customColors);
  return themeManager.getCurrentTheme();
};

// Helper function to get current theme
export const getCurrentTheme = (): AppTheme => {
  return ThemeManager.getInstance().getCurrentTheme();
};

// Helper function to preview theme changes
export const previewThemeColors = (customColors: Partial<AppTheme['colors']>): AppTheme => {
  return ThemeManager.getInstance().previewTheme(customColors);
};

// Helper function to get contrast ratio
export const getContrastRatio = (color1: string, color2: string): number => {
  return ThemeManager.getInstance().getContrastRatio(color1, color2);
};

// Helper function to check if a color combination meets accessibility standards
export const meetsAccessibilityStandards = (backgroundColor: string, textColor: string): boolean => {
  const ratio = getContrastRatio(backgroundColor, textColor);
  return ratio >= 4.5; // WCAG AA standard
};

// Helper function to get recommended text color for a background
export const getRecommendedTextColor = (backgroundColor: string): string => {
  const luminance = getLuminance(backgroundColor);
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

// Initialize theme manager
const themeManager = ThemeManager.getInstance();

// Export theme manager instance for direct access if needed
export { themeManager };
