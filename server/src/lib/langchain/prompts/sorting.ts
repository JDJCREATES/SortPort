/**
 * Sorting Prompt Templates
 * 
 * Reusable prompt templates for different types of image sorting operations.
 * These prompts are optimized for consistency, accuracy, and cost-effectiveness.
 * 
 * Input: User queries, image metadata, sorting context
 * Output: Structured sorting decisions with reasoning
 * 
 * Key Features:
 * - Consistent output formatting across all sorting types
 * - Context-aware prompts that consider user preferences
 * - Cost optimization through clear, focused instructions
 * - Fallback handling for ambiguous queries
 * - Confidence scoring for result quality assessment
 */

import { PromptTemplate } from '@langchain/core/prompts';

// Base template for all sorting operations
export const BASE_SORTING_TEMPLATE = `You are an expert image curator and sorting specialist. Your job is to analyze images and sort them according to the user's request.

Context:
- User Query: {query}
- Number of Images: {imageCount}
- Sorting Type: {sortType}
- User Preferences: {userPreferences}

Guidelines:
1. Always provide clear reasoning for your sorting decisions
2. Consider the user's query intent and context
3. Rate your confidence (0-1) based on available information
4. If vision analysis is needed but unavailable, work with existing metadata
5. Prioritize user satisfaction while being cost-conscious

Output your response as valid JSON in this exact format:
{{
  "sortedImages": [
    {{
      "imageId": "uuid",
      "position": 1,
      "sortScore": 0.95,
      "reasoning": "specific reason for this position",
      "metadata": {{
        "tone": "optional emotional tone",
        "scene": "optional scene description",
        "features": ["feature1", "feature2"],
        "confidence": 0.9
      }}
    }}
  ],
  "overallReasoning": "comprehensive explanation of sorting strategy",
  "confidence": 0.85,
  "recommendedActions": ["action1", "action2"]
}}`;

// Tone-based sorting template
export const TONE_SORTING_TEMPLATE = PromptTemplate.fromTemplate(`${BASE_SORTING_TEMPLATE}

TONE SORTING FOCUS:
You are specifically sorting images by emotional tone and mood. Consider:

Target Tone: {targetTone}
Intensity Level: {intensity}

Available Image Data:
{imageData}

Tone Categories to Consider:
- Happy/Joyful: bright, smiling, celebratory content
- Calm/Peaceful: serene, quiet, relaxing scenes
- Energetic/Dynamic: action, movement, vibrant colors
- Melancholic/Sad: subdued colors, solitary subjects
- Dramatic/Intense: high contrast, stormy weather, bold compositions
- Romantic/Intimate: soft lighting, close-ups, warm tones
- Professional/Formal: structured, clean, business-like
- Playful/Fun: informal, colorful, casual interactions

For each image, analyze:
1. Visual elements that convey emotion (lighting, color, composition)
2. Subject matter and context
3. Facial expressions or body language if present
4. Overall mood conveyed

Sort from strongest match to weakest match for the target tone.`);

// Scene-based sorting template
export const SCENE_SORTING_TEMPLATE = PromptTemplate.fromTemplate(`${BASE_SORTING_TEMPLATE}

SCENE SORTING FOCUS:
You are sorting images by scene type, location, and setting characteristics.

Target Scene: {sceneType}
Location Preference: {locationPreference}
Time of Day: {timeOfDay}

Available Image Data:
{imageData}

Scene Categories to Consider:
- Indoor: homes, offices, restaurants, shops, studios
- Outdoor: parks, streets, beaches, mountains, forests
- Urban: cities, buildings, traffic, crowds
- Nature: landscapes, wildlife, plants, water bodies
- Events: parties, concerts, sports, ceremonies
- Travel: landmarks, tourist spots, transportation
- Work: offices, meetings, professional settings
- Leisure: hobbies, recreation, entertainment

For each image, analyze:
1. Primary location and setting
2. Environmental characteristics
3. Time of day indicators (lighting, shadows)
4. Weather conditions if visible
5. Human activity context

Sort by best match to target scene criteria.`);

// Thumbnail selection template
export const THUMBNAIL_TEMPLATE = PromptTemplate.fromTemplate(`${BASE_SORTING_TEMPLATE}

THUMBNAIL SELECTION FOCUS:
You are selecting the best images to represent a collection or album.

Selection Criteria:
- Quality: {qualityRequirement}
- Representativeness: {representativenessLevel}
- Visual Appeal: {visualAppealFactors}

Available Image Data:
{imageData}

Thumbnail Selection Factors:
1. Image Quality
   - Sharpness and clarity
   - Good exposure and lighting
   - Minimal noise or artifacts
   - Proper composition

2. Representativeness
   - Captures essence of collection
   - Shows variety of content
   - Includes key subjects/themes
   - Tells a story

3. Visual Appeal
   - Engaging composition
   - Attractive colors
   - Clear subject matter
   - Emotional connection

4. Technical Considerations
   - Good resolution
   - Proper aspect ratio
   - Works well at small sizes
   - Clear focal point

Rank images by their suitability as thumbnails, with top choices first.`);

// Custom query template for flexible sorting
export const CUSTOM_QUERY_TEMPLATE = PromptTemplate.fromTemplate(`${BASE_SORTING_TEMPLATE}

CUSTOM SORTING FOCUS:
You are handling a flexible, custom sorting request that may combine multiple criteria.

Custom Requirements:
{customCriteria}

Available Image Data:
{imageData}

Analysis Approach:
1. Break down the user's request into key sorting factors
2. Identify the primary and secondary criteria
3. Determine the relative importance of each factor
4. Look for patterns in the available image data
5. Apply multi-criteria sorting logic

Consider these common sorting patterns:
- Chronological: by date/time
- Quality-based: by technical merit
- Content-based: by subject matter
- Aesthetic: by visual appeal
- Thematic: by conceptual similarity
- Functional: by intended use
- Narrative: by story potential

Be creative but systematic in your approach. If the request is ambiguous, make reasonable assumptions and explain them in your reasoning.`);

// Smart album creation template
export const SMART_ALBUM_TEMPLATE = PromptTemplate.fromTemplate(`${BASE_SORTING_TEMPLATE}

SMART ALBUM CREATION FOCUS:
You are creating intelligent album groupings based on content analysis.

Album Theme: {albumTheme}
Grouping Strategy: {groupingStrategy}

Available Image Data:
{imageData}

Album Creation Guidelines:
1. Identify natural groupings in the image collection
2. Create cohesive albums with 5-20 images each
3. Ensure each album has a clear theme or purpose
4. Minimize overlap between albums
5. Consider user's organizational preferences

Common Album Types:
- Event-based: weddings, parties, trips, holidays
- People-based: family, friends, colleagues
- Location-based: home, work, travel destinations
- Activity-based: sports, hobbies, work projects
- Time-based: years, seasons, months
- Theme-based: food, pets, nature, architecture

For each suggested album:
1. Provide a descriptive name
2. List included images with reasoning
3. Suggest a representative thumbnail
4. Explain the grouping logic

Output should include multiple album suggestions with image assignments.`);

// Vision analysis prompt for atlas processing
export const VISION_ANALYSIS_TEMPLATE = PromptTemplate.fromTemplate(`You are an expert image analyst examining a 3x3 grid of images for sorting purposes.

User's Sorting Request: {query}
Analysis Purpose: {purpose}

Atlas Layout:
A1 | A2 | A3
B1 | B2 | B3  
C1 | C2 | C3

For each position (A1-C3), analyze:
1. Main subjects and objects
2. Scene type and setting
3. Emotional tone and mood
4. Visual quality and composition
5. Colors and lighting
6. Any text or distinctive features
7. Relevance to the user's sorting request

Provide your analysis as JSON:
{{
  "imageAnalyses": {{
    "A1": {{
      "description": "detailed description",
      "tone": "emotional assessment",
      "scene": "setting/location type",
      "features": ["feature1", "feature2"],
      "relevanceScore": 0.85,
      "reasoning": "why this score for the user's request"
    }},
    // ... for each position
  }},
  "overallInsights": "patterns and relationships across images",
  "sortingRecommendation": "how to best sort these images for the user's request",
  "confidence": 0.9
}}

Focus on details that help with the sorting request: "{query}"`);

// Error handling and fallback template
export const FALLBACK_TEMPLATE = PromptTemplate.fromTemplate(`You are helping with image sorting, but there was an issue with the primary analysis.

Available Information:
- User Query: {query}
- Error Context: {errorContext}
- Fallback Data: {fallbackData}

Please provide a helpful response that:
1. Acknowledges the limitation
2. Offers what analysis is possible with available data
3. Suggests alternative approaches
4. Maintains user confidence in the system

Respond in the standard JSON format but include appropriate caveats in the reasoning fields.`);

// Export all templates
export const SortingPrompts = {
  BASE_SORTING: BASE_SORTING_TEMPLATE,
  TONE_SORTING: TONE_SORTING_TEMPLATE,
  SCENE_SORTING: SCENE_SORTING_TEMPLATE,
  THUMBNAIL: THUMBNAIL_TEMPLATE,
  CUSTOM_QUERY: CUSTOM_QUERY_TEMPLATE,
  SMART_ALBUM: SMART_ALBUM_TEMPLATE,
  VISION_ANALYSIS: VISION_ANALYSIS_TEMPLATE,
  FALLBACK: FALLBACK_TEMPLATE
};

// Helper function to format image data for prompts
export function formatImageDataForPrompt(images: any[]): string {
  return images.map((img, index) => {
    const data = [];
    data.push(`Image ${index + 1} (ID: ${img.id}):`);
    
    if (img.virtualName) data.push(`  Name: ${img.virtualName}`);
    if (img.caption) data.push(`  Caption: ${img.caption}`);
    if (img.virtual_description) data.push(`  Description: ${img.virtual_description}`);
    if (img.virtualTags?.length) data.push(`  Tags: ${img.virtualTags.join(', ')}`);
    if (img.visionSummary) data.push(`  Analysis: ${img.visionSummary}`);
    
    // Add metadata insights
    if (img.metadata?.Labels) {
      const topLabels = img.metadata.Labels
        .filter((l: any) => l.Confidence > 75)
        .slice(0, 3)
        .map((l: any) => l.Name);
      if (topLabels.length) data.push(`  Detected: ${topLabels.join(', ')}`);
    }
    
    data.push(`  Created: ${new Date(img.created_at).toLocaleDateString()}`);
    
    return data.join('\n');
  }).join('\n\n');
}

// Helper function to format user preferences for prompts
export function formatUserPreferences(preferences: any): string {
  const prefs = [];
  
  if (preferences.preferredSort) {
    prefs.push(`Preferred sorting: ${preferences.preferredSort}`);
  }
  
  if (preferences.useVisionSparingly) {
    prefs.push('Cost-conscious: avoid expensive vision analysis when possible');
  }
  
  if (preferences.excludeNsfw) {
    prefs.push('Family-friendly: exclude inappropriate content');
  }
  
  if (preferences.favoriteStyles?.length) {
    prefs.push(`Favorite styles: ${preferences.favoriteStyles.join(', ')}`);
  }
  
  return prefs.length > 0 ? prefs.join(', ') : 'No specific preferences';
}
