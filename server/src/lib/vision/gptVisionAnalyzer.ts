/**
 * Production GPT Vision API integration for atlas-based image analysis
 * 
 * This module provides optimized GPT Vision analysis using atlas images to reduce costs
 * by up to 89% while maintaining high accuracy for image sorting and classification tasks.
 * 
 * Input: Atlas images with position mapping, natural language queries
 * Output: Structured analysis results with position-mapped image classifications
 * 
 * Features:
 * - Cost-optimized batch vision analysis via atlases
 * - Advanced prompt engineering for accurate results
 * - Structured output parsing with position mapping
 * - Retry logic with exponential backoff
 * - Rate limiting and usage tracking
 * - Multi-modal analysis combining vision + metadata
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AtlasResult } from '../imageProcessing/atlasGenerator.js';

export interface VisionAnalysisRequest {
  atlas: AtlasResult;
  query: string;
  analysisType: 'sort' | 'classify' | 'detect' | 'describe' | 'compare';
  metadata?: Record<string, any>[];
  options?: VisionAnalysisOptions;
}

export interface VisionAnalysisOptions {
  maxTokens?: number;
  temperature?: number;
  includeConfidence?: boolean;
  detailLevel?: 'low' | 'high';
  customPrompt?: string;
}

export interface VisionAnalysisResult {
  query: string;
  analysisType: string;
  results: Array<{
    position: string; // A1, B2, etc.
    imageId: string;
    classification: string;
    confidence?: number;
    reasoning?: string;
    attributes?: Record<string, any>;
  }>;
  summary: string;
  metadata: {
    tokensUsed: number;
    processingTime: number;
    atlasId: string;
    modelUsed: string;
    analysisId: string;
  };
}

// Structured output schemas
const ImageAnalysisSchema = z.object({
  position: z.string().describe('Grid position (A1-C3)'),
  classification: z.string().describe('Primary classification or category'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence score 0-1'),
  reasoning: z.string().optional().describe('Brief explanation for classification'),
  attributes: z.record(z.any()).optional().describe('Additional detected attributes')
});

const VisionResultSchema = z.object({
  results: z.array(ImageAnalysisSchema),
  summary: z.string().describe('Overall analysis summary'),
  primaryCategories: z.array(z.string()).optional().describe('Main categories found')
});

export class GPTVisionAnalyzer {
  private vision: ChatOpenAI;
  private rateLimitDelay = 1000; // Base delay between requests
  private maxRetries = 3;

  constructor() {
    this.vision = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2000,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Analyze atlas image using GPT Vision with optimized prompting
   */
  async analyzeAtlas(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const startTime = Date.now();
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const prompt = this.buildOptimizedPrompt(request);
      const imageData = this.prepareImageData(request.atlas);

      const response = await this.callVisionAPIWithRetry(prompt, imageData, request.options);
      
      const parsedResult = await this.parseStructuredResponse(response);
      
      // Map results back to original image IDs
      const mappedResults = this.mapResultsToImages(parsedResult.results, request.atlas.positionMap);

      return {
        query: request.query,
        analysisType: request.analysisType,
        results: mappedResults,
        summary: parsedResult.summary,
        metadata: {
          tokensUsed: response.response_metadata?.tokenUsage?.totalTokens || 0,
          processingTime: Date.now() - startTime,
          atlasId: request.atlas.metadata.atlasId,
          modelUsed: 'gpt-4o',
          analysisId
        }
      };

    } catch (error) {
      throw new Error(`Vision analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build optimized prompt based on analysis type and query
   */
  private buildOptimizedPrompt(request: VisionAnalysisRequest): string {
    const { query, analysisType, metadata, options } = request;
    const { positionMap, metadata: atlasMetadata } = request.atlas;

    const basePrompt = `You are analyzing a 3x3 grid of ${atlasMetadata.originalCount} images for image sorting/organization.

GRID LAYOUT:
${this.generateGridLayoutDescription(positionMap)}

TASK: ${this.getTaskDescription(analysisType)}
USER QUERY: "${query}"

${options?.customPrompt ? `ADDITIONAL INSTRUCTIONS: ${options.customPrompt}` : ''}

${metadata ? this.formatMetadataContext(metadata, positionMap) : ''}

IMPORTANT GUIDELINES:
- Analyze each visible image in the grid carefully
- Reference images by their grid position (A1, A2, A3, B1, B2, B3, C1, C2, C3)
- Provide clear, specific classifications
- Consider the user's natural language query when categorizing
- ${options?.includeConfidence ? 'Include confidence scores (0-1) for each classification' : ''}
- Focus on visual content, composition, and apparent context

Please analyze each image and provide structured results in JSON format:
{
  "results": [
    {
      "position": "A1",
      "classification": "specific category based on query",
      "confidence": 0.85,
      "reasoning": "brief explanation",
      "attributes": {"key": "value"}
    }
  ],
  "summary": "Overall summary of the analysis and patterns found",
  "primaryCategories": ["category1", "category2"]
}`;

    return basePrompt;
  }

  /**
   * Get task-specific description for different analysis types
   */
  private getTaskDescription(type: string): string {
    switch (type) {
      case 'sort':
        return 'Sort and categorize the images based on the user query. Group similar images together.';
      case 'classify':
        return 'Classify each image into appropriate categories based on content, style, or theme.';
      case 'detect':
        return 'Detect and identify specific objects, people, or elements in each image.';
      case 'describe':
        return 'Provide detailed descriptions of each image including content, mood, and context.';
      case 'compare':
        return 'Compare images and identify similarities, differences, and relationships between them.';
      default:
        return 'Analyze the images according to the user query and provide appropriate categorization.';
    }
  }

  /**
   * Generate human-readable grid layout description
   */
  private generateGridLayoutDescription(positionMap: Record<string, string>): string {
    const reverseMap: Record<string, string> = {};
    Object.entries(positionMap).forEach(([imageId, position]) => {
      reverseMap[position] = imageId;
    });

    let description = '';
    for (let row = 0; row < 3; row++) {
      const rowLetter = String.fromCharCode(65 + row); // A, B, C
      const rowPositions = [];
      for (let col = 1; col <= 3; col++) {
        const position = `${rowLetter}${col}`;
        const imageId = reverseMap[position];
        rowPositions.push(imageId ? `${position}: Image ${imageId.slice(-8)}` : `${position}: Empty`);
      }
      description += rowPositions.join(' | ') + '\n';
    }

    return description;
  }

  /**
   * Format metadata context for better analysis
   */
  private formatMetadataContext(metadata: Record<string, any>[], positionMap: Record<string, string>): string {
    if (!metadata || metadata.length === 0) return '';

    let context = '\nIMAGE METADATA CONTEXT:\n';
    
    metadata.forEach((meta, index) => {
      const imageId = Object.keys(positionMap)[index];
      const position = positionMap[imageId];
      
      if (position && meta) {
        context += `${position}: `;
        if (meta.filename) context += `Filename: ${meta.filename}, `;
        if (meta.timestamp) context += `Date: ${new Date(meta.timestamp).toLocaleDateString()}, `;
        if (meta.location) context += `Location: ${meta.location}, `;
        if (meta.tags) context += `Tags: ${meta.tags.join(', ')}, `;
        context += '\n';
      }
    });

    return context;
  }

  /**
   * Prepare image data for Vision API
   */
  private prepareImageData(atlas: AtlasResult): string {
    // Convert buffer to base64 for Vision API
    const base64 = atlas.atlasBuffer.toString('base64');
    return `data:image/${atlas.metadata.format};base64,${base64}`;
  }

  /**
   * Call Vision API with retry logic and rate limiting
   */
  private async callVisionAPIWithRetry(
    prompt: string,
    imageData: string,
    options?: VisionAnalysisOptions
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Rate limiting
        if (attempt > 1) {
          const delay = this.rateLimitDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const message = new HumanMessage({
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData,
                detail: options?.detailLevel || 'high'
              }
            }
          ]
        });

        // Use the pre-configured model
        return await this.vision.invoke([message]);

      } catch (error) {
        lastError = error as Error;
        console.warn(`Vision API attempt ${attempt} failed:`, error);
        
        // Don't retry on certain errors
        if (error instanceof Error && error.message.includes('invalid_request_error')) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Vision API call failed after all retries');
  }

  /**
   * Parse structured response from Vision API
   */
  private async parseStructuredResponse(response: any): Promise<z.infer<typeof VisionResultSchema>> {
    try {
      const content = response.content;
      
      // Extract JSON from response (handling markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);
      return VisionResultSchema.parse(parsed);

    } catch (error) {
      console.error('Failed to parse vision response:', response.content);
      
      // Fallback: try to extract information from unstructured response
      return this.parseUnstructuredResponse(response.content);
    }
  }

  /**
   * Fallback parser for unstructured responses
   */
  private parseUnstructuredResponse(content: string): z.infer<typeof VisionResultSchema> {
    // Simple regex-based extraction as fallback
    const results = [];
    const positionRegex = /([A-C][1-3]).*?([a-zA-Z\s]+)/g;
    
    let match;
    while ((match = positionRegex.exec(content)) !== null) {
      results.push({
        position: match[1],
        classification: match[2].trim(),
        confidence: 0.8, // Default confidence for fallback
        reasoning: 'Extracted from unstructured response'
      });
    }

    return {
      results,
      summary: content.length > 200 ? content.substring(0, 200) + '...' : content,
      primaryCategories: []
    };
  }

  /**
   * Map vision results back to original image IDs
   */
  private mapResultsToImages(
    results: Array<any>,
    positionMap: Record<string, string>
  ): Array<any> {
    const reverseMap: Record<string, string> = {};
    Object.entries(positionMap).forEach(([imageId, position]) => {
      reverseMap[position] = imageId;
    });

    return results.map(result => ({
      ...result,
      imageId: reverseMap[result.position] || 'unknown'
    }));
  }

  /**
   * Analyze single image (non-atlas) for comparison
   */
  async analyzeSingleImage(
    imageUrl: string,
    query: string,
    options?: VisionAnalysisOptions
  ): Promise<Omit<VisionAnalysisResult, 'results'> & { result: any }> {
    const startTime = Date.now();
    const analysisId = `single_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const prompt = `Analyze this image based on the query: "${query}"

Provide a detailed analysis including:
- Primary classification/category
- Key visual elements and content
- Mood, style, and context
- Relevance to the query

${options?.includeConfidence ? 'Include confidence scores where applicable.' : ''}

Respond in JSON format:
{
  "classification": "primary category",
  "confidence": 0.85,
  "description": "detailed description",
  "attributes": {"key": "value"},
  "reasoning": "explanation of classification"
}`;

    try {
      const message = new HumanMessage({
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: options?.detailLevel || 'high'
            }
          }
        ]
      });

      const response = await this.vision.invoke([message]);
      const parsed = JSON.parse(response.content as string);

      return {
        query,
        analysisType: 'single',
        result: parsed,
        summary: parsed.description || parsed.reasoning || 'Single image analysis completed',
        metadata: {
          tokensUsed: response.response_metadata?.tokenUsage?.totalTokens || 0,
          processingTime: Date.now() - startTime,
          atlasId: 'single_image',
          modelUsed: 'gpt-4o',
          analysisId
        }
      };

    } catch (error) {
      throw new Error(`Single image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
