/**
 * Supabase Edge Function for Adding Credits
 * Called by RevenueCat webhooks or direct purchases
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddCreditsRequest {
  user_id: string;
  amount: number;
  type: 'purchase' | 'bonus' | 'refund';
  description: string;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role
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

    // Parse request body
    const body: AddCreditsRequest = await req.json()
    
    // Validate request
    if (!body.user_id) {
      throw new Error('User ID is required')
    }
    
    if (!body.amount || body.amount <= 0) {
      throw new Error('Invalid amount')
    }
    
    if (!body.type || !['purchase', 'bonus', 'refund'].includes(body.type)) {
      throw new Error('Invalid transaction type')
    }
    
    if (!body.description) {
      throw new Error('Description is required')
    }

    // Call the add_credits function
    const { data, error } = await supabaseClient.rpc('add_credits', {
      p_user_id: body.user_id,
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
    console.error('Error in add-credits function:', error)
    
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