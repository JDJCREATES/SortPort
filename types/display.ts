export type AlbumViewMode = 'grid-2' | 'grid-3' | 'grid-4' | 'grid-6' | 'grid-8' | 'large' | 'large-portrait';

export interface ViewModeConfig {
  columns: number;
  aspectRatio: number;
  spacing: number;
  showDetails: boolean;
}

export const VIEW_MODE_CONFIGS: Record<AlbumViewMode, ViewModeConfig> = {
  'grid-2': {
    columns: 2,
    aspectRatio: 1,
    spacing: 12,
    showDetails: true,
  },
  'grid-3': {
    columns: 3,
    aspectRatio: 1,
    spacing: 8,
    showDetails: false,
  },
  'grid-4': {
    columns: 4,
    aspectRatio: 1,
    spacing: 6,
    showDetails: false,
  },
  'grid-6': {
    columns: 6,
    aspectRatio: 1,
    spacing: 4,
    showDetails: false,
  },
  'grid-8': {
    columns: 8,
    aspectRatio: 1,
    spacing: 2,
    showDetails: false,
  },
  'large': {
    columns: 1,
    aspectRatio: 16 / 9,
    spacing: 16,
    showDetails: true,
  },
  'large-portrait': {
    columns: 2,
    aspectRatio: 3 / 4, // Portrait aspect ratio
    spacing: 12,
    showDetails: true,
  },
};

export interface ImageViewerData {
  id: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  creationTime: number;
  modificationTime?: number;
  fileSize?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
}