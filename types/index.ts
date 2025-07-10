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
  creditBalance: number;
  hasPurchasedCredits: boolean;
}

export interface PurchaseInfo {
  productIdentifier: string;
  purchaseDate: string;
  originalPurchaseDate: string;
  expirationDate?: string;
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
  isModeratedAlbum?: boolean;
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
  showModeratedContent?: boolean;
}

export interface CreditPack {
  identifier: string;
  credits: number;
  price: string;
  priceString: string;
  bonus?: number; // Bonus percentage
  description: string;
  title: string;
  currencyCode: string;
}

export interface ModerationLabel {
  Name: string;
  Confidence: number;
  ParentName?: string;
}

export interface ModeratedFolder {
  id: string;
  user_id: string;
  folder_id: string;
  folder_name: string;
  last_scanned_at: string;
  status: 'pending' | 'scanning' | 'scanned' | 'error';
  created_at: string;
  updated_at: string;
}

export interface ModeratedImage {
  id: string;
  user_id: string;
  image_id: string;
  folder_id: string;
  is_nsfw: boolean;
  moderation_labels: ModerationLabel[];
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: 'purchase' | 'ai_sort' | 'nsfw_process' | 'query' | 'refund' | 'bonus';
  amount: number;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface UserCredits {
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface ModerationResult {
  image_id: string;
  is_nsfw: boolean;
  moderation_labels: ModerationLabel[];
  confidence_score: number;
}