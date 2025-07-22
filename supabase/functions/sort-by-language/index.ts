/**
 * Supabase Edge Function: Natural Language Image Sorting
 * 
 * Bridges the React Native client with the Express LangChain server.
 * Handles authentication, request validation, and response formatting.
 * 
 * Input: Natural language sorting queries from client
 * Output: Sorted image results with reasoning and metadata
 * 
 * Key Features:
 * - Authentication via Supabase JWT
 * - Request/response validation and sanitization
 * - Credit checking and deduction
 * - Error handling and logging
 * - CORS support for React Native
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
    const { query, imageIds, sortType, useVision, maxResults, albumId } = body

    // Validate required fields
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Query parameter is required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check user credits (basic check - detailed check happens on Express server)
    const { data: profile } = await supabaseClient
      .from('user_profiles')
      .select('credits, tier')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < 1) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Insufficient credits',
          details: { required: 1, available: profile?.credits || 0 }
        }),
        {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Prepare request for Express server
    const sortRequest = {
      query: query.trim().substring(0, 500), // Limit query length
      userId: user.id,
      imageIds: Array.isArray(imageIds) ? imageIds.slice(0, 100) : undefined, // Limit array size
      albumId: albumId || undefined,
      sortType: sortType || 'custom',
      useVision: Boolean(useVision),
      maxResults: Math.min(maxResults || 50, 100) // Cap at 100 results
    }

    // Determine endpoint based on sort type
    let endpoint = '/api/sort'
    switch (sortType) {
      case 'tone':
        endpoint = '/api/sort/tone'
        break
      case 'scene':
        endpoint = '/api/sort/scene'
        break
      case 'thumbnail':
        endpoint = '/api/sort/thumbnails'
        break
      case 'smart_album':
        endpoint = '/api/sort/albums'
        break
    }

    console.log(`📤 Forwarding ${sortType} request to Express server:`, {
      endpoint,
      userId: user.id,
      queryLength: query.length,
      imageCount: imageIds?.length || 0
    })

    // Forward request to Express server
    const expressResponse = await fetch(`${EXPRESS_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization') || '',
      },
      body: JSON.stringify(sortRequest),
    })

    const expressData = await expressResponse.json()

    // Log response for monitoring
    console.log(`📥 Express server response:`, {
      status: expressResponse.status,
      success: expressData.success,
      imageCount: expressData.data?.sortedImages?.length || 0,
      processingTime: expressData.data?.processingTime || 0,
      usedVision: expressData.data?.usedVision || false
    })

    // Return response with CORS headers
    return new Response(
      JSON.stringify(expressData),
      {
        status: expressResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
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
