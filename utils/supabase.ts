import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

//this code might need to be cleaned up/updated!!!

// Create a safe storage adapter that works with SSR and web builds
const createStorageAdapter = () => {
  if (Platform.OS === 'web') {
    return {
      getItem: async (key: string) => {
        if (typeof window === 'undefined') {
          return null; // Return null during SSR
        }
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        if (typeof window === 'undefined') {
          return; // Do nothing during SSR
        }
        try {
          localStorage.setItem(key, value);
        } catch {
          // Ignore storage errors
        }
      },
      removeItem: async (key: string) => {
        if (typeof window === 'undefined') {
          return; // Do nothing during SSR
        }
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore storage errors
        }
      },
    };
  }
  
  // Use AsyncStorage for native platforms
  return AsyncStorage;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createStorageAdapter(),
    autoRefreshToken: typeof window !== 'undefined', // Only auto-refresh on client
    persistSession: typeof window !== 'undefined', // Only persist on client
    detectSessionInUrl: false, // Disable for SSR compatibility
    flowType: 'pkce',
  },
});

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  subscription_status?: 'free' | 'pro' | 'unlock';
  status?: 'active' | 'inactive';
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export class SupabaseAuth {
  private static authPromise: Promise<any> | null = null;
  private static isInitialized = false;

  // Call this at the very beginning of your app initialization
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      if (typeof window === 'undefined') {
        return;
      }

      // Only validate session, don't trigger auth state changes
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('❌ SupabaseAuth: Session initialization failed, clearing corrupted state');
        await supabase.auth.signOut();
        return;
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ SupabaseAuth: Critical initialization error');
    }
  }

  static async signUp(email: string, password: string, fullName?: string) {
    try {
      // ✅ Check for existing inactive user first
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .eq('status', 'inactive')
        .single();

      if (existingProfile) {
        console.log('🔄 Found inactive user, attempting reactivation');
        return await this.reactivateUser(email, password, fullName);
      }

      // Normal signup flow
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      throw error;
    }
  }

  static async signIn(email: string, password: string) {
    // Prevent multiple concurrent sign-in attempts
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = this._performSignIn(email, password);
    
    try {
      const result = await this.authPromise;
      return result;
    } finally {
      this.authPromise = null;
    }
  }

  private static async _performSignIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      throw error;
    }
  }

  static async signOut() {
    try {
      // Clear any pending auth operations
      this.authPromise = null;
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  static async getCurrentUser() {
    try {
      // Skip during SSR
      if (typeof window === 'undefined') {
        return null;
      }

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        // Check if the error indicates a missing session rather than a real problem
        if (error.name === 'AuthApiError' && (error.message.includes('session') || error.message.includes('JWT'))) {
          return null;
        }
        throw error;
      }
      return user;
    } catch (error) {
      throw error;
    }
  }

  static async updateProfile(updates: Partial<UserProfile>) {
    try {
      const user = await this.getCurrentUser();
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      throw error;
    }
  }

  static async getProfile(): Promise<UserProfile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      return data;
    } catch (error) {
      throw error;
    }
  }

  static onAuthStateChange(callback: (event: string, session: any) => void) {
    // Skip during SSR
    if (typeof window === 'undefined') {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }

    // Wrap the callback to add error handling
    const wrappedCallback = (event: string, session: any) => {
      try {
        callback(event, session);
      } catch (error) {
        console.error('❌ SupabaseAuth: Auth state change callback error');
      }
    };

    return supabase.auth.onAuthStateChange(wrappedCallback);
  }

  static async getSession() {
    try {
      // Skip during SSR
      if (typeof window === 'undefined') {
        return null;
      }

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      return session;
    } catch (error) {
      throw error;
    }
  }

  static async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      console.error('❌ SupabaseAuth: Session refresh failed');
      throw error;
    }
  }

  // ✅ New reactivation method
  static async reactivateUser(email: string, password: string, fullName?: string) {
    try {
      console.log('🔄 Reactivating user account:', email);

      // First, try to sign in with existing auth user
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // If sign in fails, the auth user might not exist, so create new one
        console.log('🔄 Auth user not found, creating new auth user');
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        // Reactivate the profile with new auth user ID
        if (signUpData.user) {
          await supabase
            .from('profiles')
            .update({
              id: signUpData.user.id, // Update with new auth user ID
              status: 'active',
              deleted_at: null,
              updated_at: new Date().toISOString(),
              full_name: fullName || null,
            })
            .eq('email', email);
        }

        return signUpData;
      } else {
        // Auth user exists, just reactivate the profile
        console.log('🔄 Auth user exists, reactivating profile');
        await supabase
          .from('profiles')
          .update({
            status: 'active',
            deleted_at: null,
            updated_at: new Date().toISOString(),
            full_name: fullName || null,
          })
          .eq('email', email);

        return signInData;
      }
    } catch (error) {
      console.error('❌ Reactivation failed:', error);
      throw error;
    }
  }

  // ✅ New soft delete method
  static async softDeleteUser() {
    try {
      const user = await this.getCurrentUser();
      if (!user) throw new Error('No authenticated user');

      console.log('🗑️ Soft deleting user:', user.email);

      // Soft delete the profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          status: 'inactive',
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) {
        throw profileError;
      }

      // Sign out the user
      await this.signOut();

      console.log('✅ User soft deleted successfully');
    } catch (error) {
      console.error('❌ Soft delete failed:', error);
      throw error;
    }
  }

  // ✅ Check if user is active
  static async isUserActive(): Promise<boolean> {
    try {
      const profile = await this.getProfile();
      return profile?.status !== 'inactive';
    } catch (error) {
      return false;
    }
  }
}