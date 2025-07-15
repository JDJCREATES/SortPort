import React, { createContext, useContext, useReducer, useEffect, ReactNode, useRef, useCallback } from 'react';
import { SupabaseAuth, UserProfile } from '../utils/supabase';
import { CreditPurchaseManager } from '../utils/creditPurchaseManager';
import { MediaStorage } from '../utils/mediaStorage';
import { AlbumUtils } from '../utils/albumUtils';
import { UserFlags, AppSettings, Album } from '../types';
import { PhotoLoader } from '../utils/photoLoader';
import { ThemeManager } from '../utils/theme';
import  { supabase } from '../utils/supabase';

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
    showModeratedInMainAlbums: false,
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
  
  // Data management actions - ADD THESE
  clearAllAppData: (skipStateReset?: boolean) => Promise<void>;
  resetAppState: () => void;
  deleteUserAccount: () => Promise<void>;
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
  
  // Add the missing initializationPromise ref
  const initializationPromise = useRef<Promise<void> | null>(null);
  
  // Add these refs to prevent race conditions
  const refreshPromises = useRef<{
    userFlags: Promise<void> | null;
    albums: Promise<void> | null;
    allPhotosAlbum: Promise<void> | null;
  }>({ userFlags: null, albums: null, allPhotosAlbum: null });

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
      
      // Initialize theme from loaded settings
      const settings = await MediaStorage.loadSettings();
      const themeManager = ThemeManager.getInstance();
      themeManager.initializeFromSettings({
        darkMode: settings.darkMode,
        customColors: settings.customColors
      });
      
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
    try {
      const newSettings = { ...state.settings, [key]: value };
      dispatch({ type: 'SET_SETTINGS', payload: newSettings });
      await MediaStorage.saveSettings(newSettings);
      
      // Sync with theme manager when customColors or darkMode changes
      if (key === 'customColors' || key === 'darkMode') {
        const { ThemeManager } = await import('../utils/theme');
        const themeManager = ThemeManager.getInstance();
        themeManager.setTheme(
          key === 'darkMode' ? value : newSettings.darkMode,
          key === 'customColors' ? value : newSettings.customColors
        );
      }
      
      console.log(`✅ Setting ${key} updated successfully`);
    } catch (error) {
      console.error(`❌ Error updating setting ${key}:`, error);
      throw error;
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

  const refreshAlbums = useCallback(async () => {
    // Add stack trace to debug what's calling this
    console.log('📁 refreshAlbums called from:', new Error().stack?.split('\n')[2]?.trim());
    
    // Prevent concurrent executions
    if (refreshPromises.current.albums) {
      console.log('📁 refreshAlbums: Already running, waiting for completion...');
      return refreshPromises.current.albums;
    }

    console.log('📁 refreshAlbums: Starting...');
    dispatch({ type: 'SET_ALBUMS_LOADING', payload: true });
    
    const promise = (async () => {
      try {
        // Check if any folders are selected
        const currentSettings = await MediaStorage.loadSettings();
        const selectedFolders = currentSettings.selectedFolders || [];
        
        if (selectedFolders.length === 0) {
          console.log('📁 refreshAlbums: No folders selected, skipping permission check');
          // Still ensure All Photos album exists (but empty)
          if (!refreshPromises.current.allPhotosAlbum) {
            console.log('📁 refreshAlbums: Ensuring empty All Photos album exists...');
            refreshPromises.current.allPhotosAlbum = AlbumUtils.ensureAllPhotosAlbumExists();
            await refreshPromises.current.allPhotosAlbum;
            refreshPromises.current.allPhotosAlbum = null;
          }
        } else {
          // Only check permissions if folders are selected
          const permissionResult = await PhotoLoader.checkAndRequestPermissions();
          
          if (!permissionResult.granted) {
            console.warn('⚠️ refreshAlbums: Photo permissions not granted:', permissionResult.message);
            dispatch({ type: 'SET_ALBUMS_ERROR', payload: permissionResult.message });
            return;
          }
          
          // Only ensure All Photos album exists if we're not already doing it
          if (!refreshPromises.current.allPhotosAlbum) {
            console.log('📁 refreshAlbums: Ensuring All Photos album exists...');
            refreshPromises.current.allPhotosAlbum = AlbumUtils.ensureAllPhotosAlbumExists();
            await refreshPromises.current.allPhotosAlbum;
            refreshPromises.current.allPhotosAlbum = null;
          }
        }
        
        console.log('📁 refreshAlbums: Loading albums from database...');
        let albums = await AlbumUtils.loadAlbums();
        
        if (currentSettings.nsfwFilter && !currentSettings.showModeratedContent) {
          albums = albums.filter(album => !album.isModeratedAlbum);
        }
        
        console.log('📁 refreshAlbums: Loaded', albums.length, 'albums');
        dispatch({ type: 'SET_ALBUMS', payload: albums });
        console.log('✅ refreshAlbums: Complete');
      } catch (error) {
        console.error('❌ refreshAlbums: Error:', error);
        dispatch({ type: 'SET_ALBUMS_ERROR', payload: error instanceof Error ? error.message : 'Failed to load albums' });
      } finally {
        dispatch({ type: 'SET_ALBUMS_LOADING', payload: false });
        refreshPromises.current.albums = null;
      }
    })();

    refreshPromises.current.albums = promise;
    return promise;
  }, []);

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

  const ensureAllPhotosAlbum = useCallback(async () => {
    // Prevent concurrent executions
    if (refreshPromises.current.allPhotosAlbum) {
      console.log('📁 ensureAllPhotosAlbum: Already running, waiting for completion...');
      return refreshPromises.current.allPhotosAlbum;
    }

    try {
      console.log('📁 ensureAllPhotosAlbum: Starting...');
      refreshPromises.current.allPhotosAlbum = AlbumUtils.ensureAllPhotosAlbumExists();
      await refreshPromises.current.allPhotosAlbum;
      
      // Only refresh albums if we're not already refreshing them
      if (!refreshPromises.current.albums) {
        await refreshAlbums();
      }
    } catch (error) {
      console.error('Error ensuring All Photos album:', error);
    } finally {
      refreshPromises.current.allPhotosAlbum = null;
    }
  }, [refreshAlbums]);

  const deleteUserAccount = async () => {
    if (!state.userProfile) {
      throw new Error('No user profile found');
    }

    console.log('🗑️ Starting account deletion for user:', state.userProfile.id, state.userProfile.email);
    
    // Store user info before any operations
    const userToDelete = { ...state.userProfile };
    
    try {
      // Get current session for auth
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
      if (sessionError || !session) {
        throw new Error('No active session found');
      }

      console.log('🗑️ Calling delete-user-account edge function...');
    
      // Call the edge function (this will sign out the user and delete everything)
      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw new Error(`Account deletion failed: ${error.message}`);
      }

      if (!data.success) {
        console.error('❌ Edge function returned failure:', data);
        throw new Error(`Account deletion failed: ${data.error}`);
      }

      console.log('✅ Edge function succeeded:', data);
      console.log('📊 Deletion results:', data.results);

      // Clear local data after successful server deletion
      console.log('🗑️ Clearing local data...');
      await MediaStorage.clearAllData();
      await AlbumUtils.clearNsfwCache();
      
      // Reset app state
      resetAppState();
      
      // Reset theme
      const themeManager = ThemeManager.getInstance();
      themeManager.setTheme(false, undefined);
      
      // The user should already be signed out by the edge function
      // But let's make sure our local state reflects this
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
      
      console.log('✅ User account deletion completed successfully');
    
    } catch (error) {
      console.error('❌ Error during account deletion:', error);
      throw error;
    }
  };

  const clearAllAppData = async (skipStateReset: boolean = false) => {
    console.log('🧹 Clearing all app data from context...');
    
    try {
      // 1. Clear all local storage
      await MediaStorage.clearAllData();
      
      // 2. Clear NSFW cache
      await AlbumUtils.clearNsfwCache();
      
      // 3. Clear user-specific data from Supabase if authenticated
      if (state.isAuthenticated && state.userProfile) {
        try {
          const { error: nsfwError } = await supabase
            .from('nsfw_results')
            .delete()
            .eq('user_id', state.userProfile.id);
          
          if (nsfwError) console.warn('Failed to clear NSFW results:', nsfwError);

          const { error: albumsError } = await supabase
            .from('user_albums')
            .delete()
            .eq('user_id', state.userProfile.id);
          
          if (albumsError) console.warn('Failed to clear user albums:', albumsError);

          const { error: jobsError } = await supabase
            .from('nsfw_bulk_jobs')
            .delete()
            .eq('user_id', state.userProfile.id);
          
          if (jobsError) console.warn('Failed to clear bulk jobs:', jobsError);
        } catch (error) {
          console.warn('Error clearing remote data:', error);
        }
      }
      
      // 4. Reset app state only if not skipping
      if (!skipStateReset) {
        resetAppState();
        
        // 5. Reset theme to default
        const themeManager = ThemeManager.getInstance();
        themeManager.setTheme(false, undefined); // Reset to light theme, no custom colors
      }
      
      console.log('✅ All app data cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing app data:', error);
      throw error;
    }
  };

  const resetAppState = () => {
    console.log('🔄 Resetting app state to defaults...');
    
    // Reset to initial state but keep authentication status
    dispatch({
      type: 'SET_USER_FLAGS',
      payload: {
        creditBalance: 0,
        hasPurchasedCredits: false
      }
    });
    
    dispatch({
      type: 'SET_SETTINGS',
      payload: {
        darkMode: false,
        autoSort: false,
        nsfwFilter: true,
        notifications: true,
        selectedFolders: ['all_photos'],
        lastAutoSortTimestamp: 0,
        showModeratedContent: false,
        showModeratedInMainAlbums: false,
      }
    });
    
    dispatch({
      type: 'SET_ALBUMS',
      payload: []
    });
    
    // Clear any error states
    dispatch({
      type: 'SET_ALBUMS_ERROR',
      payload: null
    });
    
    console.log('✅ App state reset to defaults');
  };

  const testDeleteOperations = async () => {
    if (!state.userProfile) {
      console.log('❌ No user profile found');
      return;
    }

    const userId = state.userProfile.id;
    console.log('🧪 Testing delete operations for user:', userId);

    try {
      // Test 1: Check what data exists
      console.log('🔍 Checking existing data...');
      
      const { data: nsfwCheck, error: nsfwCheckError } = await supabase
        .from('nsfw_results')
        .select('*')
        .eq('user_id', userId);
      
      console.log('NSFW results found:', nsfwCheck?.length || 0, 'records');
      if (nsfwCheckError) console.log('NSFW check error:', nsfwCheckError);

      const { data: nsfwBulkCheck, error: nsfwBulkCheckError } = await supabase
        .from('nsfw_bulk_results')
        .select('*')
        .eq('user_id', userId);
      
      console.log('NSFW bulk results found:', nsfwBulkCheck?.length || 0, 'records');
      if (nsfwBulkCheckError) console.log('NSFW bulk check error:', nsfwBulkCheckError);

      const { data: sortSessionsCheck, error: sortSessionsCheckError } = await supabase
        .from('sort_sessions')
        .select('*')
        .eq('user_id', userId);
      
      console.log('Sort sessions found:', sortSessionsCheck?.length || 0, 'records');
      if (sortSessionsCheckError) console.log('Sort sessions check error:', sortSessionsCheckError);

      const { data: moderatedFoldersCheck, error: moderatedFoldersCheckError } = await supabase
        .from('moderated_folders')
        .select('*')
        .eq('user_id', userId);
      
      console.log('Moderated folders found:', moderatedFoldersCheck?.length || 0, 'records');
      if (moderatedFoldersCheckError) console.log('Moderated folders check error:', moderatedFoldersCheckError);

      const { data: moderatedImagesCheck, error: moderatedImagesCheckError } = await supabase
        .from('moderated_images')
        .select('*')
        .eq('user_id', userId);
      
      console.log('Moderated images found:', moderatedImagesCheck?.length || 0, 'records');
      if (moderatedImagesCheckError) console.log('Moderated images check error:', moderatedImagesCheckError);

      // Test 2: Try to delete with detailed error reporting
      console.log('🗑️ Testing NSFW results deletion...');
      const { data: nsfwDeleteData, error: nsfwDeleteError, count: nsfwDeleteCount } = await supabase
        .from('nsfw_results')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .select();

      console.log('NSFW delete result:', {
        data: nsfwDeleteData,
        error: nsfwDeleteError,
        count: nsfwDeleteCount
      });

      console.log('🗑️ Testing NSFW bulk results deletion...');
      const { data: nsfwBulkDeleteData, error: nsfwBulkDeleteError, count: nsfwBulkDeleteCount } = await supabase
        .from('nsfw_bulk_results')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .select();

      console.log('NSFW bulk delete result:', {
        data: nsfwBulkDeleteData,
        error: nsfwBulkDeleteError,
        count: nsfwBulkDeleteCount
      });

      console.log('🗑️ Testing sort sessions deletion...');
      const { data: sortSessionsDeleteData, error: sortSessionsDeleteError, count: sortSessionsDeleteCount } = await supabase
        .from('sort_sessions')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .select();

      console.log('Sort sessions delete result:', {
        data: sortSessionsDeleteData,
        error: sortSessionsDeleteError,
        count: sortSessionsDeleteCount
      });

      console.log('🗑️ Testing moderated folders deletion...');
      const { data: moderatedFoldersDeleteData, error: moderatedFoldersDeleteError, count: moderatedFoldersDeleteCount } = await supabase
        .from('moderated_folders')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .select();

      console.log('Moderated folders delete result:', {
        data: moderatedFoldersDeleteData,
        error: moderatedFoldersDeleteError,
        count: moderatedFoldersDeleteCount
      });

      console.log('🗑️ Testing moderated images deletion...');
      const { data: moderatedImagesDeleteData, error: moderatedImagesDeleteError, count: moderatedImagesDeleteCount } = await supabase
        .from('moderated_images')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .select();

      console.log('Moderated images delete result:', {
        data: moderatedImagesDeleteData,
        error: moderatedImagesDeleteError,
        count: moderatedImagesDeleteCount
      });

      // Test 3: Check current user permissions
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current auth user:', user?.id, user?.email);
      console.log('Profile user:', userId);
      console.log('Users match:', user?.id === userId);

    } catch (error) {
      console.error('❌ Test failed:', error);
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
    clearAllAppData,
    resetAppState,
    deleteUserAccount,
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