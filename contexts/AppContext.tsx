import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { SupabaseAuth, UserProfile } from '../utils/supabase';
import { RevenueCatManager } from '../utils/revenuecat';
import { MediaStorage } from '../utils/mediaStorage';
import { AlbumUtils } from '../utils/albumUtils';
import { UserFlags, AppSettings, Album } from '../types';

// Define the state shape
interface AppState {
  // Authentication
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  isLoadingAuth: boolean;
  
  // User flags (subscription status)
  userFlags: UserFlags;
  isLoadingUserFlags: boolean;
  
  // App settings
  settings: AppSettings;
  isLoadingSettings: boolean;
  
  // Albums
  albums: Album[];
  isLoadingAlbums: boolean;
  albumsError: string | null;
  
  // General loading states
  isInitializing: boolean;
}

// Define action types
type AppAction =
  | { type: 'SET_INITIALIZING'; payload: boolean }
  | { type: 'SET_AUTH_LOADING'; payload: boolean }
  | { type: 'SET_AUTHENTICATED'; payload: { isAuthenticated: boolean; userProfile: UserProfile | null } }
  | { type: 'SET_USER_FLAGS_LOADING'; payload: boolean }
  | { type: 'SET_USER_FLAGS'; payload: UserFlags }
  | { type: 'SET_SETTINGS_LOADING'; payload: boolean }
  | { type: 'SET_SETTINGS'; payload: AppSettings }
  | { type: 'SET_ALBUMS_LOADING'; payload: boolean }
  | { type: 'SET_ALBUMS'; payload: Album[] }
  | { type: 'SET_ALBUMS_ERROR'; payload: string | null }
  | { type: 'ADD_ALBUM'; payload: Album }
  | { type: 'UPDATE_ALBUM'; payload: { id: string; updates: Partial<Album> } }
  | { type: 'REMOVE_ALBUM'; payload: string };

// Initial state
const initialState: AppState = {
  isAuthenticated: false,
  userProfile: null,
  isLoadingAuth: true,
  userFlags: {
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  },
  isLoadingUserFlags: true,
  settings: {
    darkMode: false,
    autoSort: false,
    nsfwFilter: true,
    notifications: true,
    selectedFolders: ['all_photos'],
    lastAutoSortTimestamp: 0,
  },
  isLoadingSettings: true,
  albums: [],
  isLoadingAlbums: true,
  albumsError: null,
  isInitializing: true,
};

// Reducer function
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INITIALIZING':
      return { ...state, isInitializing: action.payload };
    
    case 'SET_AUTH_LOADING':
      return { ...state, isLoadingAuth: action.payload };
    
    case 'SET_AUTHENTICATED':
      return {
        ...state,
        isAuthenticated: action.payload.isAuthenticated,
        userProfile: action.payload.userProfile,
        isLoadingAuth: false,
      };
    
    case 'SET_USER_FLAGS_LOADING':
      return { ...state, isLoadingUserFlags: action.payload };
    
    case 'SET_USER_FLAGS':
      return { ...state, userFlags: action.payload, isLoadingUserFlags: false };
    
    case 'SET_SETTINGS_LOADING':
      return { ...state, isLoadingSettings: action.payload };
    
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload, isLoadingSettings: false };
    
    case 'SET_ALBUMS_LOADING':
      return { ...state, isLoadingAlbums: action.payload };
    
    case 'SET_ALBUMS':
      return { 
        ...state, 
        albums: action.payload, 
        isLoadingAlbums: false,
        albumsError: null // Clear error on successful load
      };
    
    case 'SET_ALBUMS_ERROR': // ADD THIS CASE
      return { 
        ...state, 
        albumsError: action.payload,
        isLoadingAlbums: false 
      };
    
    case 'ADD_ALBUM':
      return {
        ...state,
        albums: [...state.albums, action.payload],
      };
    
    case 'UPDATE_ALBUM':
      return {
        ...state,
        albums: state.albums.map(album =>
          album.id === action.payload.id
            ? { ...album, ...action.payload.updates }
            : album
        ),
      };
    
    case 'REMOVE_ALBUM':
      return {
        ...state,
        albums: state.albums.filter(album => album.id !== action.payload),
      };
    
    default:
      return state;
  }
}

// Context actions interface
interface AppContextActions {
  // Authentication actions
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  
  // User flags actions
  refreshUserFlags: () => Promise<void>;
  
  // Settings actions
  updateSetting: (key: keyof AppSettings, value: any) => Promise<void>;
  refreshSettings: () => Promise<void>;
  
  // Albums actions
  refreshAlbums: () => Promise<void>;
  addAlbum: (album: Album) => Promise<void>;
  updateAlbum: (id: string, updates: Partial<Album>) => Promise<void>;
  removeAlbum: (id: string) => Promise<void>;
  ensureAllPhotosAlbum: () => Promise<void>;
}

// Combined context type
type AppContextType = AppState & AppContextActions;

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Initialize app data
  useEffect(() => {
    initializeApp();
  }, []);

  // Set up auth state listener
  useEffect(() => {
    const { data: { subscription } } = SupabaseAuth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, !!session?.user);
      
      if (session?.user) {
        // User signed in
        try {
          const profile = await SupabaseAuth.getProfile();
          dispatch({
            type: 'SET_AUTHENTICATED',
            payload: { isAuthenticated: true, userProfile: profile },
          });
          
          // Refresh user flags and albums when user signs in
          await refreshUserFlags();
          await refreshAlbums();
        } catch (error) {
          console.error('Error loading user profile after sign in:', error);
          dispatch({
            type: 'SET_AUTHENTICATED',
            payload: { isAuthenticated: true, userProfile: null },
          });
        }
      } else {
        // User signed out
        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { isAuthenticated: false, userProfile: null },
        });
        
        // Reset user flags when signed out
        dispatch({
          type: 'SET_USER_FLAGS',
          payload: {
            isSubscribed: false,
            hasUnlockPack: false,
            isProUser: false,
          },
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const initializeApp = async () => {
    console.log('Initializing app...');
    dispatch({ type: 'SET_INITIALIZING', payload: true });

    try {
      // Load settings first (doesn't require auth)
      await refreshSettings();
      
      // Check authentication status
      await checkAuthStatus();
      
      // Load user flags (works for both authenticated and non-authenticated users)
      await refreshUserFlags();
      
      // Load albums (works for both authenticated and non-authenticated users)
      await refreshAlbums();
      
      console.log('App initialization complete');
    } catch (error) {
      console.error('Error during app initialization:', error);
    } finally {
      dispatch({ type: 'SET_INITIALIZING', payload: false });
    }
  };

  const checkAuthStatus = async () => {
    dispatch({ type: 'SET_AUTH_LOADING', payload: true });
    
    try {
      const user = await SupabaseAuth.getCurrentUser();
      if (user) {
        const profile = await SupabaseAuth.getProfile();
        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { isAuthenticated: true, userProfile: profile },
        });
      } else {
        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { isAuthenticated: false, userProfile: null },
        });
      }
    } catch (error: any) {
      console.error('Error checking auth status:', error);
      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: { isAuthenticated: false, userProfile: null },
      });
    }
  };

  const signIn = async (email: string, password: string) => {
    await SupabaseAuth.signIn(email, password);
    // Auth state change listener will handle the rest
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    await SupabaseAuth.signUp(email, password, fullName);
    // Auth state change listener will handle the rest
  };

  const signOut = async () => {
    await SupabaseAuth.signOut();
    // Auth state change listener will handle the rest
  };

  const refreshUserProfile = async () => {
    if (!state.isAuthenticated) return;
    
    try {
      const profile = await SupabaseAuth.getProfile();
      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: { isAuthenticated: true, userProfile: profile },
      });
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  };

  const refreshUserFlags = async () => {
    dispatch({ type: 'SET_USER_FLAGS_LOADING', payload: true });
    
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const flags = await revenueCat.getUserFlags();
      dispatch({ type: 'SET_USER_FLAGS', payload: flags });
    } catch (error) {
      console.error('Error loading user flags:', error);
      dispatch({ type: 'SET_USER_FLAGS_LOADING', payload: false });
    }
  };

  const updateSetting = async (key: keyof AppSettings, value: any) => {
    const newSettings = { ...state.settings, [key]: value };
    dispatch({ type: 'SET_SETTINGS', payload: newSettings });
    await MediaStorage.saveSettings(newSettings);
    
    // If folder selection changed, update All Photos album
    if (key === 'selectedFolders') {
      await ensureAllPhotosAlbum();
    }
  };

  const refreshSettings = async () => {
    dispatch({ type: 'SET_SETTINGS_LOADING', payload: true });
    
    try {
      const settings = await MediaStorage.loadSettings();
      dispatch({ type: 'SET_SETTINGS', payload: settings });
    } catch (error) {
      console.error('Error loading settings:', error);
      dispatch({ type: 'SET_SETTINGS_LOADING', payload: false });
    }
  };

  const refreshAlbums = async () => {
    dispatch({ type: 'SET_ALBUMS_LOADING', payload: true });
    
    try {
      // Ensure All Photos album exists first
      await AlbumUtils.ensureAllPhotosAlbumExists();
      
      // Load all albums
      const albums = await AlbumUtils.loadAlbums();
      dispatch({ type: 'SET_ALBUMS', payload: albums });
    } catch (error) {
      console.error('Error loading albums:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load albums';
      dispatch({ type: 'SET_ALBUMS_ERROR', payload: errorMessage });
    }
  };

  const addAlbum = async (album: Album) => {
    await AlbumUtils.addAlbum(album);
    dispatch({ type: 'ADD_ALBUM', payload: album });
  };

  const updateAlbum = async (id: string, updates: Partial<Album>) => {
    await AlbumUtils.updateAlbum(id, updates);
    dispatch({ type: 'UPDATE_ALBUM', payload: { id, updates } });
  };

  const removeAlbum = async (id: string) => {
    await AlbumUtils.removeAlbum(id);
    dispatch({ type: 'REMOVE_ALBUM', payload: id });
  };

  const ensureAllPhotosAlbum = async () => {
    try {
      await AlbumUtils.ensureAllPhotosAlbumExists();
      // Refresh albums to get the updated All Photos album
      await refreshAlbums();
    } catch (error) {
      console.error('Error ensuring All Photos album:', error);
    }
  };

  const contextValue: AppContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    refreshUserProfile,
    refreshUserFlags,
    updateSetting,
    refreshSettings,
    refreshAlbums,
    addAlbum,
    updateAlbum,
    removeAlbum,
    ensureAllPhotosAlbum,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}