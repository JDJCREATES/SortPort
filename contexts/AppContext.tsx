import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { SupabaseAuth, UserProfile } from '../utils/supabase';
import { supabaseUrl, supabaseAnonKey } from '../utils/supabase';
import { RevenueCatManager } from '../utils/revenuecat';
import { MediaStorage } from '../utils/mediaStorage';
import { AlbumUtils } from '../utils/albumUtils';
import { UserFlags, AppSettings, Album } from '../types';
import { PhotoLoader } from '../utils/photoLoader';

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
    showModeratedContent: false,
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
    console.log('🚀 Starting app initialization...');
    
    // Check if Supabase is properly configured
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase not configured - running in offline mode');
    }
    
    initializeApp();
  }, []);

  // Set up auth state listener
  useEffect(() => {
    console.log('🔐 Setting up auth state listener...');
    const { data: { subscription } } = SupabaseAuth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state changed:', event, !!session?.user, session?.user?.id || 'no-user');
      
      if (session?.user) {
        // User signed in
        try {
          console.log('👤 Loading user profile after sign in...');
          const profile = await SupabaseAuth.getProfile();
          console.log('👤 Profile loaded:', !!profile);
          dispatch({
            type: 'SET_AUTHENTICATED',
            payload: { isAuthenticated: true, userProfile: profile },
          });
          
          // Refresh user flags and albums when user signs in
          console.log('🔄 Refreshing user data after sign in...');
          await refreshUserFlags();
          await refreshAlbums();
          console.log('✅ User data refresh complete');
        } catch (error) {
          console.error('Error loading user profile after sign in:', error);
          dispatch({
            type: 'SET_AUTHENTICATED',
            payload: { isAuthenticated: true, userProfile: null },
          });
        }
      } else {
        // User signed out
        console.log('👤 User signed out, clearing state...');
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
    console.log('🚀 initializeApp: Starting...');
    dispatch({ type: 'SET_INITIALIZING', payload: true });

    try {
      // Load settings first (doesn't require auth)
      await refreshSettings();
      
      // Check authentication status
      console.log('🔐 initializeApp: Checking auth status...');
      await checkAuthStatus();
      
      // Load user flags (works for both authenticated and non-authenticated users)
      console.log('🏷️ initializeApp: Loading user flags...');
      await refreshUserFlags();
      
      // Load albums (works for both authenticated and non-authenticated users)
      console.log('📁 initializeApp: Loading albums...');
      await refreshAlbums();
      
      console.log('✅ initializeApp: Complete');
    } catch (error) {
      console.error('❌ initializeApp: Error during initialization:', error);
    } finally {
      console.log('🚀 initializeApp: Setting initialization complete');
      dispatch({ type: 'SET_INITIALIZING', payload: false });
    }
  };

  const checkAuthStatus = async () => {
    dispatch({ type: 'SET_AUTH_LOADING', payload: true });
    
    console.log('🔐 checkAuthStatus: Starting...');
    try {
      // Skip auth check if Supabase is not configured
      if (!supabaseUrl || !supabaseAnonKey) {
        console.log('🔐 checkAuthStatus: Supabase not configured, skipping auth');
        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { isAuthenticated: false, userProfile: null },
        });
        return;
      }
      
      const user = await SupabaseAuth.getCurrentUser();
      if (user) {
        console.log('👤 checkAuthStatus: User found, loading profile...');
        const profile = await SupabaseAuth.getProfile();
        console.log('👤 checkAuthStatus: Profile loaded:', !!profile);
        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { isAuthenticated: true, userProfile: profile },
        });
      } else {
        console.log('👤 checkAuthStatus: No user found');
        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { isAuthenticated: false, userProfile: null },
        });
      }
      console.log('✅ checkAuthStatus: Complete');
    } catch (error: any) {
      console.error('❌ checkAuthStatus: Error:', error);
      // Don't throw the error, just set unauthenticated state
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
    
    console.log('👤 refreshUserProfile: Starting...');
    try {
      const profile = await SupabaseAuth.getProfile();
      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: { isAuthenticated: true, userProfile: profile },
      });
      console.log('✅ refreshUserProfile: Complete');
    } catch (error) {
      console.error('❌ refreshUserProfile: Error:', error);
    }
  };

  const refreshUserFlags = async () => {
    console.log('🏷️ refreshUserFlags: Starting...');
    dispatch({ type: 'SET_USER_FLAGS_LOADING', payload: true });
    
    try {
      const revenueCat = RevenueCatManager.getInstance();
      const flags = await revenueCat.getUserFlags();
      dispatch({ type: 'SET_USER_FLAGS', payload: flags });
      console.log('✅ refreshUserFlags: Complete');
    } catch (error) {
      console.error('❌ refreshUserFlags: Error:', error);
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
    console.log('⚙️ refreshSettings: Starting...');
    dispatch({ type: 'SET_SETTINGS_LOADING', payload: true });
    
    try {
      const settings = await MediaStorage.loadSettings();
      dispatch({ type: 'SET_SETTINGS', payload: settings });
      console.log('✅ refreshSettings: Complete');
    } catch (error) {
      console.error('❌ refreshSettings: Error:', error);
      dispatch({ type: 'SET_SETTINGS_LOADING', payload: false });
    }
  };

  const refreshAlbums = async () => {
    console.log('📁 refreshAlbums: Starting...');
    dispatch({ type: 'SET_ALBUMS_LOADING', payload: true });
    
    try {
      // Check permissions before loading albums
      const permissionResult = await PhotoLoader.checkAndRequestPermissions();
      
      if (!permissionResult.granted) {
        console.warn('⚠️ refreshAlbums: Photo permissions not granted:', permissionResult.message);
        // Still try to load albums from database, but they might be empty
        dispatch({ type: 'SET_ALBUMS_ERROR', payload: permissionResult.message });
      }
      
      // Ensure All Photos album exists first
      console.log('📁 refreshAlbums: Ensuring All Photos album exists...');
      await AlbumUtils.ensureAllPhotosAlbumExists();
      
      // Load all albums
      console.log('📁 refreshAlbums: Loading albums from database...');
      let albums = await AlbumUtils.loadAlbums();
      
      // Filter out moderated albums if NSFW filter is enabled
      if (state.settings.nsfwFilter && !state.settings.showModeratedContent) {
        albums = albums.filter(album => !album.isModeratedAlbum);
      }
      
      console.log('📁 refreshAlbums: Loaded', albums.length, 'albums');
      dispatch({ type: 'SET_ALBUMS', payload: albums });
      console.log('✅ refreshAlbums: Complete');
    } catch (error) {
      console.error('❌ refreshAlbums: Error:', error);
      dispatch({ type: 'SET_ALBUMS_ERROR', payload: error instanceof Error ? error.message : 'Failed to load albums' });
      dispatch({ type: 'SET_ALBUMS_LOADING', payload: false });
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