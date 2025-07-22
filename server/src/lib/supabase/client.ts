import { createClient } from '@supabase/supabase-js';

// Validate required environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

if (!supabaseAnonKey) {
  throw new Error('SUPABASE_ANON_KEY environment variable is required');
}

// Service role client (for server-side operations with elevated permissions)
export const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Anonymous client (for operations that don't require elevated permissions)
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to create user-scoped client
export function createUserClient(userToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    }
  });
}

// Test connection helper
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabaseService
      .from('virtual_image')
      .select('id')
      .limit(1);
    
    return !error;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return false;
  }
}

// Database schema types (subset for LangChain operations)
export interface VirtualImageRow {
  id: string;
  user_id: string;
  originalPath: string;
  originalName: string;
  hash: string;
  virtualName: string | null;
  virtualTags: string[] | null;
  virtualAlbum: string | null;
  virtual_description: string | null;
  nsfwScore: number | null;
  isFlagged: boolean | null;
  caption: string | null;
  visionSummary: string | null;
  vision_sorted: boolean | null;
  metadata: Record<string, any> | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
  sortOrder: number;
}

export interface UserProfileRow {
  id: string;
  email: string | null;
  credits: number;
  tier: 'free' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
}

// Custom error types for database operations
export class DatabaseError extends Error {
  constructor(
    message: string,
    public originalError?: any,
    public table?: string,
    public operation?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Helper function to handle database errors consistently
export function handleDatabaseError(error: any, table?: string, operation?: string): never {
  console.error(`Database error in ${table}::${operation}:`, error);
  
  if (error.code === 'PGRST116') {
    throw new DatabaseError('Record not found', error, table, operation);
  }
  
  if (error.code === '23505') {
    throw new DatabaseError('Duplicate record', error, table, operation);
  }
  
  if (error.code === '23503') {
    throw new DatabaseError('Foreign key constraint violation', error, table, operation);
  }
  
  throw new DatabaseError(
    error.message || 'Unknown database error',
    error,
    table,
    operation
  );
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: typeof supabaseService) => Promise<T>
): Promise<T> {
  // Note: Supabase doesn't support explicit transactions in the JS client
  // This is a placeholder for transaction-like behavior
  // In practice, we'd need to implement this at the SQL level or use batch operations
  return await callback(supabaseService);
}
