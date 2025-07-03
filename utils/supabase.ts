import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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
        console.error('Supabase signup error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Signup failed:', error);
      throw error;
    }
  }

  static async signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase signin error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Signin failed:', error);
      throw error;
    }
  }

  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase signout error:', error);
        throw error;
      }
    } catch (error) {
      console.error('Signout failed:', error);
      throw error;
    }
  }

  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        // Handle different types of auth errors appropriately
        if (error.name === 'AuthApiError' && error.message?.includes('Auth session missing')) {
          // This is expected when no user is logged in
          return null;
        }
        
        // For other auth errors, provide more context
        if (error.message?.includes('Invalid API key')) {
          throw new Error('Authentication service configuration error. Please check your Supabase configuration.');
        }
        
        if (error.message?.includes('network') || error.message?.includes('fetch')) {
          throw new Error('Network error while checking authentication. Please check your internet connection.');
        }
        
        // For any other errors, throw with original message but add context
        throw new Error(`Authentication check failed: ${error.message}`);
      }
      return user;
    } catch (error) {
      // If it's already our custom error, re-throw it
      if (error instanceof Error && error.message.includes('Authentication')) {
        throw error;
      }
      
      // For unexpected errors, wrap them
      console.error('Unexpected error in getCurrentUser:', error);
      throw new Error('Unexpected authentication error. Please try again.');
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
        console.error('Update profile error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Failed to update profile:', error);
      throw error;
    }
  }

  static async getProfile(): Promise<UserProfile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        console.log('No authenticated user found');
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Get profile error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Failed to get profile:', error);
      throw error;
    }
  }

  static onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }

  static async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Get session error:', error);
        throw error;
      }
      return session;
    } catch (error) {
      console.error('Failed to get session:', error);
      throw error;
    }
  }
}