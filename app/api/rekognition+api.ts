/**
 * AWS Rekognition API route for NSFW content detection
 * Handles image moderation using Amazon Rekognition's DetectModerationLabels API
 * Images are processed in-memory only - no storage to S3 or database
 */

import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

interface ModerationRequest {
  image_base64: string;
  image_id: string;
}

interface ModerationLabel {
  Name: string;
  Confidence: number;
  ParentName?: string;
}

interface ModerationResponse {
  image_id: string;
  is_nsfw: boolean;
  moderation_labels: ModerationLabel[];
  confidence_score: number;
}

// NSFW threshold configuration
const NSFW_CONFIDENCE_THRESHOLD = 80; // Minimum confidence to flag as NSFW
const NSFW_CATEGORIES = [
  'Explicit Nudity',
  'Suggestive',
  'Violence',
  'Visually Disturbing',
  'Rude Gestures',
  'Drugs',
  'Tobacco',
  'Alcohol',
  'Gambling',
  'Hate Symbols'
];

export async function POST(request: Request): Promise<Response> {
  try {
    // Validate environment variables
    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = process.env;
    
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION) {
      console.error('❌ Missing AWS credentials in environment variables');
      return new Response(
        JSON.stringify({ 
          error: 'AWS credentials not configured',
          details: 'Server configuration error'
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body
    let body: ModerationRequest;
    try {
      body = await request.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON in request body',
          details: 'Request must contain valid JSON'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { image_base64, image_id } = body;

    // Validate required fields
    if (!image_base64 || !image_id) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields',
          details: 'image_base64 and image_id are required'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate base64 format and size
    if (typeof image_base64 !== 'string' || image_base64.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid image_base64',
          details: 'image_base64 must be a non-empty string'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Convert base64 to buffer and check size (5MB limit for Rekognition)
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(image_base64, 'base64');
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid base64 encoding',
          details: 'image_base64 must be valid base64 encoded data'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const imageSizeMB = imageBuffer.length / (1024 * 1024);
    if (imageSizeMB > 5) {
      return new Response(
        JSON.stringify({ 
          error: 'Image too large',
          details: `Image size (${imageSizeMB.toFixed(2)}MB) exceeds 5MB limit`
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Rekognition client
    const rekognitionClient = new RekognitionClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create moderation command
    const command = new DetectModerationLabelsCommand({
      Image: {
        Bytes: imageBuffer,
      },
      MinConfidence: 50, // Lower threshold to catch more potential issues
    });

    // Call Rekognition API
    console.log(`🔍 Analyzing image ${image_id} for NSFW content...`);
    const response = await rekognitionClient.send(command);

    // Process moderation labels
    const moderationLabels = response.ModerationLabels || [];
    
    // Determine if image is NSFW based on labels and confidence
    let isNsfw = false;
    let maxConfidence = 0;

    for (const label of moderationLabels) {
      const confidence = label.Confidence || 0;
      maxConfidence = Math.max(maxConfidence, confidence);
      
      // Check if this label indicates NSFW content
      if (confidence >= NSFW_CONFIDENCE_THRESHOLD) {
        const labelName = label.Name || '';
        const parentName = label.ParentName || '';
        
        if (NSFW_CATEGORIES.some(category => 
          labelName.includes(category) || parentName.includes(category)
        )) {
          isNsfw = true;
          break;
        }
      }
    }

    // Format response
    const moderationResponse: ModerationResponse = {
      image_id,
      is_nsfw: isNsfw,
      moderation_labels: moderationLabels.map(label => ({
        Name: label.Name || '',
        Confidence: label.Confidence || 0,
        ParentName: label.ParentName,
      })),
      confidence_score: maxConfidence,
    };

    console.log(`✅ Image ${image_id} analysis complete: ${isNsfw ? 'NSFW' : 'Safe'} (confidence: ${maxConfidence.toFixed(2)}%)`);

    return new Response(
      JSON.stringify(moderationResponse),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Rekognition API error:', error);
    
    // Handle specific AWS errors
    if (error instanceof Error) {
      if (error.name === 'InvalidImageFormatException') {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid image format',
            details: 'Image must be in JPEG or PNG format'
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      if (error.name === 'ImageTooLargeException') {
        return new Response(
          JSON.stringify({ 
            error: 'Image too large',
            details: 'Image exceeds maximum size limit'
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      if (error.name === 'InvalidParameterException') {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid parameters',
            details: 'Invalid image data or parameters'
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: 'Failed to process image moderation request'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}