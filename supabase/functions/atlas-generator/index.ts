/**
 * Supabase Edge Function: Atlas Generator
 * 
 * Generates 3x3 image atlases for cost-effective GPT Vision analysis.
 * Handles image downloading, resizing, and grid composition.
 * 
 * Input: Array of image IDs (max 9)
 * Output: Atlas URL and position mapping
 * 
 * Key Features:
 * - Batch image processing for efficiency
 * - Atlas caching to reduce redundant generation
 * - Position labeling (A1-C3) for vision analysis
 * - Cost tracking and optimization
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const EXPRESS_SERVER_URL = Deno.env.get('EXPRESS_SERVER_URL') || 'http://localhost:3001'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Authentication required' 
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    const body = await req.json()
    const { imageIds, purpose = 'sorting', cacheKey } = body

    // Validate request
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'imageIds array is required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (imageIds.length > 9) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Maximum 9 images allowed per atlas' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check user credits for atlas generation
    const { data: profile } = await supabaseClient
      .from('user_profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < 2) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Insufficient credits for atlas generation',
          details: { required: 2, available: profile?.credits || 0 }
        }),
        {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Prepare atlas request
    const atlasRequest = {
      userId: user.id,
      imageIds: imageIds,
      purpose: purpose,
      cacheKey: cacheKey
    }

    console.log(`🎨 Generating atlas for user ${user.id}:`, {
      imageCount: imageIds.length,
      purpose,
      cacheKey
    })

    // Forward to Express server
    const expressResponse = await fetch(`${EXPRESS_SERVER_URL}/api/atlas/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization') || '',
      },
      body: JSON.stringify(atlasRequest),
    })

    const expressData = await expressResponse.json()

    // Log response
    console.log(`🎨 Atlas generation response:`, {
      status: expressResponse.status,
      success: expressData.success,
      atlasUrl: expressData.data?.atlasUrl ? 'generated' : 'none'
    })

    return new Response(
      JSON.stringify(expressData),
      {
        status: expressResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Atlas generation error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Atlas generation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
