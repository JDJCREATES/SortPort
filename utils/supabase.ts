import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing env vars - URL:', !!supabaseUrl, 'Key:', !!supabaseAnonKey);
  throw new Error('Missing Supabase environment variables');
}

// Create a safe storage adapter that works with SSR
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
  },
});

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  subscription_status?: 'free' | 'pro' | 'unlock';
  created_at: string;
  updated_at: string;
}

export class SupabaseAuth {
  static async signUp(email: string, password: string, fullName?: string) {
    console.log('🔐 SupabaseAuth.signUp: Starting...');
    try {
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
        console.error('❌ SupabaseAuth.signUp: Supabase error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.signUp: Success');
      return data;
    } catch (error) {
      console.error('❌ SupabaseAuth.signUp: Failed:', error);
      throw error;
    }
  }

  static async signIn(email: string, password: string) {
    console.log('🔐 SupabaseAuth.signIn: Starting...');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ SupabaseAuth.signIn: Supabase error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.signIn: Success');
      return data;
    } catch (error) {
      console.error('❌ SupabaseAuth.signIn: Failed:', error);
      throw error;
    }
  }

  static async signOut() {
    console.log('🔐 SupabaseAuth.signOut: Starting...');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ SupabaseAuth.signOut: Supabase error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.signOut: Success');
    } catch (error) {
      console.error('❌ SupabaseAuth.signOut: Failed:', error);
      throw error;
    }
  }

  static async getCurrentUser() {
    console.log('🔐 SupabaseAuth.getCurrentUser: Starting...');
    try {
      // Skip during SSR
      if (typeof window === 'undefined') {
        console.log('🔐 SupabaseAuth.getCurrentUser: Skipping during SSR');
        return null;
      }

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        // Check if the error indicates a missing session rather than a real problem
        if (error.name === 'AuthApiError' && error.message.includes('session')) {
          console.log('🔐 SupabaseAuth.getCurrentUser: No session found, treating as no user');
          return null;
        }
        console.error('❌ SupabaseAuth.getCurrentUser: Error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.getCurrentUser: Success, user:', !!user);
      return user;
    } catch (error) {
      console.error('❌ SupabaseAuth.getCurrentUser: Failed:', error);
      throw error;
    }
  }

  static async updateProfile(updates: Partial<UserProfile>) {
    console.log('👤 SupabaseAuth.updateProfile: Starting...');
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
        console.error('❌ SupabaseAuth.updateProfile: Supabase error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.updateProfile: Success');
      return data;
    } catch (error) {
      console.error('❌ SupabaseAuth.updateProfile: Failed:', error);
      throw error;
    }
  }

  static async getProfile(): Promise<UserProfile | null> {
    console.log('👤 SupabaseAuth.getProfile: Starting...');
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        console.log('👤 SupabaseAuth.getProfile: No authenticated user found');
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ SupabaseAuth.getProfile: Supabase error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.getProfile: Success, profile:', !!data);
      return data;
    } catch (error) {
      console.error('❌ SupabaseAuth.getProfile: Failed:', error);
      throw error;
    }
  }

  static onAuthStateChange(callback: (event: string, session: any) => void) {
    // Skip during SSR
    if (typeof window === 'undefined') {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    return supabase.auth.onAuthStateChange(callback);
  }

  static async getSession() {
    console.log('🔐 SupabaseAuth.getSession: Starting...');
    try {
      // Skip during SSR
      if (typeof window === 'undefined') {
        console.log('🔐 SupabaseAuth.getSession: Skipping during SSR');
        return null;
      }

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('❌ SupabaseAuth.getSession: Supabase error:', error);
        throw error;
      }
      console.log('✅ SupabaseAuth.getSession: Success, session:', !!session);
      return session;
    } catch (error) {
      console.error('❌ SupabaseAuth.getSession: Failed:', error);
      throw error;
    }
  }
}