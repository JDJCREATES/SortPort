import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { Platform } from 'react-native';
import { LangChainResult, AlbumOutput, UserFlags, ImageMeta } from '../types';

export class LangChainAgent {
  private model: ChatOpenAI | null = null;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
    
    if (this.apiKey && this.apiKey !== 'your_openai_api_key_here') {
      try {
        this.model = new ChatOpenAI({
          modelName: 'gpt-4-vision-preview',
          maxTokens: 1000,
          openAIApiKey: this.apiKey,
        });
      } catch (error) {
        console.error('Error initializing OpenAI model:', error);
      }
    }
  }

  async analyzeImage(base64: string, imageId: string): Promise<LangChainResult> {
    // If no API key or model not initialized, throw error
    if (!this.model || !this.apiKey || this.apiKey === 'your_openai_api_key_here') {
      throw new Error('OpenAI API key not configured. Please add your API key to use AI analysis.');
    }

    try {
      const prompt = `You are a photo sorting assistant. Analyze this image and provide a JSON response with the following structure:
      {
        "description": "Brief description of what's in the image",
        "category": "Main category (e.g., 'receipts', 'travel', 'screenshots', 'people', 'food', 'documents', 'memes', 'nature')",
        "nsfwScore": 0.0-1.0,
        "tags": ["tag1", "tag2", "tag3"],
        "confidence": 0.0-1.0
      }
      
      Be accurate and concise. Focus on the main subject and categorize appropriately.`;

      const message = new HumanMessage({
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
            },
          },
        ],
      });

      const response = await this.model.invoke([message]);
      const content = response.content as string;
      
      // Parse JSON response
      const jsonMatch = content.match(/\{.*\}/s);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        id: imageId,
        description: parsed.description || 'Unknown image',
        category: parsed.category || 'unsorted',
        nsfwScore: parsed.nsfwScore || 0,
        tags: parsed.tags || [],
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.error('Error analyzing image:', error);
      throw error;
    }
  }

  async batchAnalyzeImages(
    images: Array<{id: string, base64: string}>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LangChainResult[]> {
    const results: LangChainResult[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const result = await this.analyzeImage(image.base64, image.id);
        results.push(result);
        onProgress?.(i + 1, images.length);
        
        // Add delay to avoid rate limiting
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error analyzing image ${image.id}:`, error);
        onProgress?.(i + 1, images.length);
        // Continue processing other images instead of failing completely
      }
    }

    return results;
  }

  filterNSFW(results: LangChainResult[], hasUnlockPack: boolean): LangChainResult[] {
    if (hasUnlockPack) {
      return results;
    }
    return results.filter(result => result.nsfwScore < 0.5);
  }

  groupResults(results: LangChainResult[], userPrompt?: string): AlbumOutput {
    // Group by category
    const categoryGroups: { [key: string]: LangChainResult[] } = {};
    const unsorted: string[] = [];

    results.forEach(result => {
      if (result.category === 'unsorted' || result.confidence < 0.3) {
        unsorted.push(result.id);
      } else {
        if (!categoryGroups[result.category]) {
          categoryGroups[result.category] = [];
        }
        categoryGroups[result.category].push(result);
      }
    });

    // Create albums from groups
    const albums = Object.entries(categoryGroups).map(([category, items]) => {
      const allTags = items.flatMap(item => item.tags);
      const uniqueTags = [...new Set(allTags)];
      
      return {
        id: `album_${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: this.formatCategoryName(category),
        imageIds: items.map(item => item.id),
        tags: uniqueTags,
        createdAt: Date.now(),
        thumbnail: items[0]?.id,
        count: items.length,
        isLocked: this.isCategoryLocked(category),
      };
    });

    return {
      albums,
      unsorted,
    };
  }

  private formatCategoryName(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'receipts': 'Receipts & Bills',
      'travel': 'Travel Memories',
      'screenshots': 'Screenshots',
      'people': 'People & Portraits',
      'food': 'Food & Dining',
      'documents': 'Documents',
      'memes': 'Memes & Funny',
      'nature': 'Nature & Outdoors',
      'pets': 'Pets & Animals',
      'events': 'Events & Celebrations',
    };

    return categoryMap[category.toLowerCase()] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  private isCategoryLocked(category: string): boolean {
    const lockedCategories = ['nsfw', 'private', 'adult'];
    return lockedCategories.some(locked => category.toLowerCase().includes(locked));
  }

  async sortImages(
    prompt: string,
    images: ImageMeta[],
    flags: UserFlags,
    onProgress?: (completed: number, total: number) => void
  ): Promise<AlbumOutput> {
    if (images.length === 0) {
      throw new Error('No photos available to sort. Please ensure you have photos in your gallery and have granted photo library permissions.');
    }

    try {
      // Limit to prevent overwhelming the API
      const limitedImages = images.slice(0, 20);
      
      // Convert images to base64
      const base64Images = await Promise.all(
        limitedImages.map(async (image, index) => {
          try {
            const response = await fetch(image.uri);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
              };
              reader.readAsDataURL(blob);
            });
            return { id: image.id, base64 };
          } catch (error) {
            console.error(`Error converting image ${image.id}:`, error);
            return null;
          }
        })
      );

      const validImages = base64Images.filter(img => img !== null) as Array<{id: string, base64: string}>;

      if (validImages.length === 0) {
        throw new Error('Failed to process any images. Please check your internet connection and try again.');
      }

      // Analyze images
      const results = await this.batchAnalyzeImages(validImages, onProgress);

      if (results.length === 0) {
        throw new Error('AI analysis failed. Please check your OpenAI API key configuration.');
      }

      // Filter NSFW if needed
      const filteredResults = this.filterNSFW(results, flags.hasUnlockPack);

      // Group into albums
      return this.groupResults(filteredResults, prompt);
    } catch (error) {
      console.error('Error sorting images:', error);
      throw error;
    }
  }
}