export interface ImageMeta {
  id: string;
  uri: string;
  thumbnailUri?: string;
  filename: string;
  width: number;
  height: number;
  creationTime: number;
  modificationTime: number;
}

export interface UserFlags {
  isSubscribed: boolean;
  hasUnlockPack: boolean;
  isProUser: boolean;
}

export interface LangChainResult {
  id: string;
  description: string;
  category: string;
  nsfwScore: number; // 0.0 - 1.0
  tags: string[];
  confidence: number;
}

export interface AlbumOutput {
  albums: Album[];
  unsorted: string[];
}

export interface Album {
  id: string;
  name: string;
  imageIds: string[];
  tags: string[];
  createdAt: number;
  isLocked?: boolean;
  thumbnail?: string;
  count: number;
  isAllPhotosAlbum?: boolean;
}

export interface SortSession {
  id: string;
  prompt: string;
  timestamp: number;
  results: AlbumOutput;
  processingTime: number;
}

export interface AppTheme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

export interface CustomThemeColors {
  primary?: string;
  secondary?: string;
  accent?: string;
}

export interface AppSettings {
  darkMode: boolean;
  autoSort: boolean;
  nsfwFilter: boolean;
  notifications: boolean;
  customColors?: CustomThemeColors;
  selectedFolders?: string[];
  lastAutoSortTimestamp?: number;
}

export interface RevenueCatProduct {
  identifier: string;
  description: string;
  title: string;
  price: string;
  priceString: string;
  currencyCode: string;
}

export interface PurchaseInfo {
  productIdentifier: string;
  purchaseDate: string;
  originalPurchaseDate: string;
  expirationDate?: string;
}