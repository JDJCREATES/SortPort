/**
 * Supabase Edge Function for Credit Deduction
 * Safely deducts credits from user balance with atomic operations
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeductCreditsRequest {
  amount: number;
  type: 'ai_sort' | 'nsfw_process' | 'query';
  description: string;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify the JWT token and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    // Parse request body
    const body: DeductCreditsRequest = await req.json()
    
    // Validate request
    if (!body.amount || body.amount <= 0) {
      throw new Error('Invalid amount')
    }
    
    if (!body.type || !['ai_sort', 'nsfw_process', 'query'].includes(body.type)) {
      throw new Error('Invalid transaction type')
    }
    
    if (!body.description) {
      throw new Error('Description is required')
    }

    // Call the deduct_credits function
    const { data, error } = await supabaseClient.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: body.amount,
      p_type: body.type,
      p_description: body.description,
      p_metadata: body.metadata || {}
    })

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in deduct-credits function:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})