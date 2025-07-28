import { User } from '@supabase/supabase-js';
import { supabaseService } from '../../lib/supabase/client';
import redis from 'redis';

export interface AuthUser {
  id: string;
  email: string;
  credits: number;
  subscription_tier: string;
  created_at: string;
  preferences?: Record<string, any>;
  session_metadata?: Record<string, any>;
}

export interface AuthValidationResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  cached?: boolean;
}

export class AuthService {
  private redisClient: any;
  private cacheEnabled: boolean;
  private cacheTTL: number;

  constructor() {
    this.cacheEnabled = process.env.REDIS_URL ? true : false;
    this.cacheTTL = parseInt(process.env.AUTH_CACHE_TTL || '300'); // 5 minutes default
    
    if (this.cacheEnabled) {
      this.initializeRedis();
    }
  }

  private initializeRedis(): void {
    try {
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });
      
      this.redisClient.on('error', (err: Error) => {
        console.error('Redis Client Error:', err);
        this.cacheEnabled = false;
      });
      
      this.redisClient.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.cacheEnabled = false;
    }
  }

  async validateToken(token: string): Promise<AuthValidationResult> {
    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = await this.getCachedUser(token);
        if (cached) {
          return { success: true, user: cached, cached: true };
        }
      }

      // Validate with Supabase
      const { data: { user }, error } = await supabaseService.auth.getUser(token);
      
      if (error || !user) {
        return { success: false, error: error?.message || 'Invalid token' };
      }

      // Fetch user profile data
      const authUser = await this.fetchUserProfile(user);
      
      if (!authUser) {
        return { success: false, error: 'User profile not found' };
      }

      // Cache the result
      if (this.cacheEnabled) {
        await this.cacheUser(token, authUser);
      }

      return { success: true, user: authUser };
    } catch (error) {
      console.error('Token validation error:', error);
      return { success: false, error: 'Authentication service error' };
    }
  }

  private async fetchUserProfile(user: User): Promise<AuthUser | null> {
    try {
      const { data: profile, error } = await supabaseService
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        return null;
      }

      return {
        id: user.id,
        email: user.email || '',
        credits: profile?.credits || 0,
        subscription_tier: profile?.subscription_tier || 'free',
        created_at: user.created_at,
        preferences: profile?.preferences || {},
        session_metadata: {}
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  private async getCachedUser(token: string): Promise<AuthUser | null> {
    if (!this.cacheEnabled || !this.redisClient) return null;

    try {
      const cacheKey = `auth:${token}`;
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Cache retrieval error:', error);
    }
    
    return null;
  }

  private async cacheUser(token: string, user: AuthUser): Promise<void> {
    if (!this.cacheEnabled || !this.redisClient) return;

    try {
      const cacheKey = `auth:${token}`;
      await this.redisClient.setEx(
        cacheKey, 
        this.cacheTTL, 
        JSON.stringify(user)
      );
    } catch (error) {
      console.error('Cache storage error:', error);
    }
  }

  async invalidateUserCache(userId: string): Promise<void> {
    if (!this.cacheEnabled || !this.redisClient) return;

    try {
      // This is a simplified approach - in production, you might want to
      // maintain a reverse index of token->userId mappings
      const pattern = 'auth:*';
      const keys = await this.redisClient.keys(pattern);
      
      for (const key of keys) {
        const cached = await this.redisClient.get(key);
        if (cached) {
          const user = JSON.parse(cached);
          if (user.id === userId) {
            await this.redisClient.del(key);
          }
        }
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  async refreshUserCredits(userId: string): Promise<number | null> {
    try {
      const { data: profile, error } = await supabaseService
        .from('user_profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Credits refresh error:', error);
        return null;
      }

      return profile?.credits || 0;
    } catch (error) {
      console.error('Error refreshing credits:', error);
      return null;
    }
  }

  async updateUserPreferences(userId: string, preferences: Record<string, any>): Promise<boolean> {
    try {
      const { error } = await supabaseService
        .from('user_profiles')
        .update({ preferences })
        .eq('user_id', userId);

      if (error) {
        console.error('Preferences update error:', error);
        return false;
      }

      // Invalidate cache for this user
      await this.invalidateUserCache(userId);
      return true;
    } catch (error) {
      console.error('Error updating preferences:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        console.error('Redis cleanup error:', error);
      }
    }
  }
}

// Singleton instance
export const authService = new AuthService();
