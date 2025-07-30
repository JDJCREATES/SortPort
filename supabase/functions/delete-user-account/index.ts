import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const

interface DeleteResult {
  table: string;
  deleted_count: number;
  error?: string;
}

interface DeleteResponse {
  success: boolean;
  message?: string;
  error?: string;
  results: DeleteResult[];
  user_id?: string;
  user_email?: string;
}

serve((req: Request): Promise<Response> => {
  return handleRequest(req);
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    const errorResponse: DeleteResponse = {
      success: false,
      error: 'Method not allowed',
      results: []
    }
    
    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  const results: DeleteResult[] = []

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing required environment variables')
    }

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify user with regular client first
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      console.error('User verification failed:', userError)
      throw new Error('Unauthorized - invalid token')
    }

    console.log('🗑️ Starting hard delete for user:', user.id, user.email)

    // Store user info before deletion
    const userInfo = {
      id: user.id,
      email: user.email || 'unknown'
    }

    // First, let's check what data exists for this user
    console.log('🔍 Checking existing data...')
    
    const existingTables: string[] = [
      'albums',
      'credit_transactions', 
      'moderated_folders',
      'moderated_images',
      'nsfw_bulk_jobs',
      'nsfw_bulk_results',
      'sort_sessions',
      'user_credits',
      'virtual_image',
      'bulk_job_virtual_images'
    ]

    for (const table of existingTables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
        
        if (error) {
          console.log(`⚠️ Could not check ${table}:`, error.message)
        } else {
          const recordCount = data?.length || 0
          console.log(`📊 Found ${recordCount} records in ${table}`)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.log(`⚠️ Exception checking ${table}:`, errorMessage)
      }
    }

    // Delete the profile (this should cascade delete everything else if properly configured)
    console.log('🗑️ Hard deleting profile (should cascade)...')
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user.id)
      .select()

    if (profileError) {
      console.error('❌ Profile deletion failed:', profileError)
      results.push({
        table: 'profiles',
        deleted_count: 0,
        error: profileError.message
      })
      throw new Error(`Profile deletion failed: ${profileError.message}`)
    }

    const profileDeletedCount = profileData?.length || 0
    console.log(`✅ Profile deleted: ${profileDeletedCount} record`)
    results.push({
      table: 'profiles',
      deleted_count: profileDeletedCount
    })

    // Check if cascade deletes worked
    console.log('🔍 Checking if cascade deletes worked...')
    for (const table of existingTables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
        
        if (error) {
          console.log(`⚠️ Could not verify ${table} deletion:`, error.message)
        } else {
          const remainingCount = data?.length || 0
          console.log(`📊 Remaining records in ${table}: ${remainingCount}`)
          if (remainingCount > 0) {
            console.log(`⚠️ CASCADE DELETE may not be working for ${table}`)
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.log(`⚠️ Exception verifying ${table}:`, errorMessage)
      }
    }

    // Sign out the user first (this will trigger auth state change)
    console.log('🚪 Signing out user before deletion...')
    const { error: signOutError } = await supabaseClient.auth.signOut()
    
    if (signOutError) {
      console.warn('⚠️ Sign out failed, but continuing with deletion:', signOutError.message)
    } else {
      console.log('✅ User signed out successfully')
    }

    // Small delay to ensure sign out is processed
    await new Promise(resolve => setTimeout(resolve, 100))

    // Delete the auth user (this is the nuclear option)
    console.log('🗑️ Deleting auth user...')
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (authDeleteError) {
      console.error('❌ Auth user deletion failed:', authDeleteError)
      results.push({
        table: 'auth.users',
        deleted_count: 0,
        error: authDeleteError.message
      })
      throw new Error(`Auth user deletion failed: ${authDeleteError.message}`)
    }

    console.log('✅ Auth user deleted successfully')
    results.push({
      table: 'auth.users',
      deleted_count: 1
    })

    // If we got here, everything succeeded
    console.log('✅ User account completely deleted')

    const successResponse: DeleteResponse = {
      success: true,
      message: 'User account completely deleted',
      results,
      user_id: userInfo.id,
      user_email: userInfo.email
    }

    return new Response(
      JSON.stringify(successResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('❌ Delete user account function failed:', errorMessage)
    
    const errorResponse: DeleteResponse = {
      success: false,
      error: errorMessage,
      results: results
    }
    
    return new Response(
      JSON.stringify(errorResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
}