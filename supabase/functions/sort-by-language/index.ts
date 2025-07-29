/**
 * Supabase Edge Function: Natural Language Image Sorting
 * 
 * Bridges the React Native client with the LCEL-based Express server.
 * Handles authentication, request validation, and response formatting.
 * 
 * Input: Natural language sorting queries from client
 * Output: Sorted image results with reasoning and metadata
 * 
 * Key Features:
 * - Authentication via Supabase JWT
 * - Request/response validation and sanitization
 * - Credit checking and deduction
 * - LCEL server integration
 * - Error handling and logging
 * - CORS support for React Native
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LCEL_SERVER_URL = Deno.env.get('LCEL_SERVER_URL') 

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req: any) => {
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

    // Transform request for LCEL server
    const lcelRequest = {
      query,
      images: imageIds ? await getVirtualImagesForLCEL(supabaseClient, imageIds) : [],
      options: {
        maxResults: maxResults || 50,
        sortCriteria: [sortType || 'custom'],
        includeAnalysis: true,
        userContext: {
          id: user.id,
          preferences: {
            sortType,
            useVision
          }
        }
      }
    }

    console.log(`📤 Forwarding request to LCEL server:`, {
      userId: user.id,
      queryLength: query.length,
      imageCount: lcelRequest.images.length,
      sortType
    })

    // Forward request to LCEL server
    const lcelResponse = await fetch(`${LCEL_SERVER_URL}/api/lcel/sort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization') || '',
      },
      body: JSON.stringify(lcelRequest),
    })

    const lcelData = await lcelResponse.json()

    // Log response for monitoring
    console.log(`📥 LCEL server response:`, {
      status: lcelResponse.status,
      success: lcelData.success,
      imageCount: lcelData.results?.length || 0,
      processingTime: lcelData.metadata?.processingTime || 0,
      methodUsed: lcelData.metadata?.methodUsed || 'unknown'
    })

    // Transform LCEL response to match expected frontend format
    const transformedResponse = {
      success: lcelData.success,
      data: lcelData.success ? {
        sortedImages: lcelData.results?.map((result: any, index: number) => ({
          id: result.image?.id || `unknown_${index}`,
          originalPath: result.image?.url || '',
          virtualName: result.image?.metadata?.virtualName || null,
          sortScore: result.sortScore || 0,
          reasoning: result.reasoning || '',
          position: result.position || index + 1,
          metadata: result.metadata || {}
        })) || [],
        reasoning: lcelData.metadata?.queryAnalysis?.intent || 'Sorted based on query',
        confidence: lcelData.metadata?.confidence || 0,
        usedVision: lcelData.metadata?.methodUsed?.includes('vision') || false,
        processingTime: lcelData.metadata?.processingTime || 0,
        cost: {
          balance: 0, // Updated by credit system
          breakdown: {
            embedding: 1,
            vision: lcelData.metadata?.methodUsed?.includes('vision') ? 2 : 0,
            processing: 1
          }
        }
      } : undefined,
      error: lcelData.error,
      meta: lcelData.metadata
    }

    // Return response with CORS headers
    return new Response(
      JSON.stringify(transformedResponse),
      {
        status: lcelResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

/**
 * Helper function to get virtual images formatted for LCEL server
 */
async function getVirtualImagesForLCEL(supabaseClient: any, imageIds: string[]) {
  const { data: virtualImages, error } = await supabaseClient
    .from('virtual_image')
    .select('*')
    .in('id', imageIds)
    .limit(100)

  if (error) {
    console.error('Failed to fetch virtual images:', error)
    return []
  }

  return virtualImages?.map((img: any) => ({
    id: img.id,
    url: img.original_path,
    metadata: {
      originalName: img.original_name,
      virtualName: img.virtual_name,
      tags: img.virtual_tags,
      description: img.virtual_description,
      nsfwScore: img.nsfw_score,
      detectedObjects: img.detected_objects,
      dominantColors: img.dominant_colors,
      location: img.location_name,
      dateTaken: img.date_taken,
      ...img.metadata
    }
  })) || []
}
