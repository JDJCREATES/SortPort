import React, { createContext, useContext, useReducer, useEffect, ReactNode, useRef } from 'react';
import { SupabaseAuth, UserProfile } from '../utils/supabase';
import { CreditPurchaseManager } from '../utils/creditPurchaseManager';
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
  | { type: 'SET_CREDIT_BALANCE'; payload: number }
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
    creditBalance: 0,
    hasPurchasedCredits: false
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
    
    case 'SET_CREDIT_BALANCE':
      return { 
        ...state, 
        userFlags: { ...state.userFlags, creditBalance: action.payload },
        isLoadingUserFlags: false 
      };
    
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
  deductCredits: (amount: number, type: 'ai_sort' | 'nsfw_process' | 'query', description: string, metadata?: Record<string, any>) => Promise<{ success: boolean; newBalance?: number; error?: string }>;
  getCreditBalance: () => Promise<number>;
  
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
  
  // Add these refs to prevent race conditions
  const initializationPromise = useRef<Promise<void> | null>(null);
  const refreshPromises = useRef<{
    userFlags: Promise<void> | null;
    albums: Promise<void> | null;
  }>({ userFlags: null, albums: null });

  // Initialize app data - prevent multiple concurrent calls
  useEffect(() => {
    if (!initializationPromise.current) {
      console.log('🚀 Starting app initialization...');
      initializationPromise.current = initializeApp();
    }
  }, []);

  // Set up auth state listener with debouncing
  useEffect(() => {
    console.log('🔐 Setting up auth state listener...');
    let timeoutId: NodeJS.Timeout;
    
    const { data: { subscription } } = SupabaseAuth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state changed:', event, !!session?.user, session?.user?.id || 'no-user');
      
      // Debounce rapid auth state changes
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await handleAuthStateChange(event, session);
      }, 100);
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthStateChange = async (event: string, session: any) => {
    if (session?.user) {
      // User signed in - prevent concurrent profile loading
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        try {
          console.log('👤 Loading user profile after sign in...');
          const profile = await SupabaseAuth.getProfile();
          console.log('👤 Profile loaded:', !!profile);
          dispatch({
            type: 'SET_AUTHENTICATED',
            payload: { isAuthenticated: true, userProfile: profile },
          });
          
          // Only refresh data once per auth change
          console.log('🔄 Refreshing user data after sign in...');
          await Promise.all([
            refreshUserFlags(),
            refreshAlbums()
          ]);
          console.log('✅ User data refresh complete');
        } catch (error) {
          console.error('Error loading user profile after sign in:', error);
          dispatch({
            type: 'SET_AUTHENTICATED',
            payload: { isAuthenticated: true, userProfile: null },
          });
        }
      }
    } else {
      // User signed out
      console.log('👤 User signed out, clearing state...');
      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: { isAuthenticated: false, userProfile: null },
      });
      
      dispatch({
        type: 'SET_USER_FLAGS',
        payload: {
          creditBalance: 0,
          hasPurchasedCredits: false,
        },
      });
    }
  };

  const initializeApp = async () => {
    console.log('🚀 initializeApp: Starting...');
    dispatch({ type: 'SET_INITIALIZING', payload: true });

    try {
      // Initialize Supabase auth first
      await SupabaseAuth.initialize();
      
      // Load settings first (doesn't require auth)
      await refreshSettings();
      
      // Check authentication status
      console.log('🔐 initializeApp: Checking auth status...');
      await checkAuthStatus();
      
      // Load user flags and albums in parallel, but only once
      console.log('🏷️ initializeApp: Loading user flags...');
      console.log('📁 initializeApp: Loading albums...');
      await Promise.all([
        refreshUserFlags(),
        refreshAlbums()
      ]);
      
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
    // Reset user flags when signed out
    dispatch({
      type: 'SET_USER_FLAGS',
      payload: {
        creditBalance: 0,
        hasPurchasedCredits: false,
      },
    });
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
    // Prevent concurrent executions
    if (refreshPromises.current.userFlags) {
      return refreshPromises.current.userFlags;
    }

    console.log('🏷️ refreshUserFlags: Starting...');
    dispatch({ type: 'SET_USER_FLAGS_LOADING', payload: true });
    
    const promise = (async () => {
      try {
        const creditManager = CreditPurchaseManager.getInstance();
        const flags = await creditManager.getUserFlags();
        dispatch({ type: 'SET_USER_FLAGS', payload: flags });
        console.log('✅ refreshUserFlags: Complete');
      } catch (error) {
        console.error('❌ refreshUserFlags: Error:', error);
        dispatch({ type: 'SET_USER_FLAGS_LOADING', payload: false });
      } finally {
        refreshPromises.current.userFlags = null;
      }
    })();

    refreshPromises.current.userFlags = promise;
    return promise;
  };

  const deductCredits = async (
    amount: number, 
    type: 'ai_sort' | 'nsfw_process' | 'query',
    description: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; newBalance?: number; error?: string }> => {
    try {
      const creditManager = CreditPurchaseManager.getInstance();
      const result = await creditManager.deductCredits(amount, type, description, metadata);
      
      if (result.success && result.newBalance !== undefined) {
        dispatch({ type: 'SET_CREDIT_BALANCE', payload: result.newBalance });
      }
      
      return result;
    } catch (error) {
      console.error('Error deducting credits:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const getCreditBalance = async (): Promise<number> => {
    try {
      const creditManager = CreditPurchaseManager.getInstance();
      const balance = await creditManager.getCreditBalance();
      dispatch({ type: 'SET_CREDIT_BALANCE', payload: balance });
      return balance;
    } catch (error) {
      console.error('Error getting credit balance:', error);
      return 0;
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
    // Prevent concurrent executions
    if (refreshPromises.current.albums) {
      return refreshPromises.current.albums;
    }

    console.log('📁 refreshAlbums: Starting...');
    dispatch({ type: 'SET_ALBUMS_LOADING', payload: true });
    
    const promise = (async () => {
      try {
        // Check permissions before loading albums
        const permissionResult = await PhotoLoader.checkAndRequestPermissions();
        
        if (!permissionResult.granted) {
          console.warn('⚠️ refreshAlbums: Photo permissions not granted:', permissionResult.message);
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
      } finally {
        refreshPromises.current.albums = null;
      }
    })();

    refreshPromises.current.albums = promise;
    return promise;
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
    deductCredits,
    getCreditBalance,
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