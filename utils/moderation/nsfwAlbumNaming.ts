// Intelligent NSFW Album Naming based on AWS Rekognition Labels
export interface ModerationCategory {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  priority: number; // Higher priority = more specific categorization
  keywords: string[];
  parentCategories?: string[];
}

// Define moderation categories with intelligent naming
export const MODERATION_CATEGORIES: ModerationCategory[] = [
  // Explicit Content
  {
    id: 'explicit_nudity',
    displayName: 'Explicit Content',
    description: 'Images containing explicit nudity',
    icon: '🔞',
    priority: 10,
    keywords: ['Explicit Nudity', 'Graphic Male Nudity', 'Graphic Female Nudity', 'Sexual Activity'],
  },
  {
    id: 'partial_nudity',
    displayName: 'Partial Nudity',
    description: 'Images with partial nudity or revealing clothing',
    icon: '👙',
    priority: 8,
    keywords: [
      'Partial Nudity', 
      'Female Swimwear Or Underwear', 
      'Male Swimwear Or Underwear', 
      'Swimwear or Underwear', // ✅ ADD THIS - matches AWS format
      'Barechested Male', 
      'Revealing Clothes'
    ],
  },
  {
    id: 'suggestive_content',
    displayName: 'Suggestive Content',
    description: 'Suggestive or provocative imagery',
    icon: '💋',
    priority: 7,
    keywords: ['Suggestive', 'Illustrated Explicit Nudity', 'Adult Toys'],
  },

  // Violence & Disturbing Content
  {
    id: 'graphic_violence',
    displayName: 'Graphic Violence',
    description: 'Images containing graphic violence or gore',
    icon: '⚔️',
    priority: 9,
    keywords: ['Graphic Violence Or Gore', 'Violence', 'Physical Violence', 'Weapon Violence'],
  },
  {
    id: 'weapons',
    displayName: 'Weapons',
    description: 'Images containing weapons',
    icon: '🔫',
    priority: 6,
    keywords: ['Weapons'],
  },
  {
    id: 'disturbing_content',
    displayName: 'Disturbing Content',
    description: 'Visually disturbing or unsettling imagery',
    icon: '😰',
    priority: 8,
    keywords: ['Visually Disturbing', 'Self Injury', 'Emaciated Bodies', 'Corpses', 'Hanging'],
  },

  // Substance Use
  {
    id: 'drugs',
    displayName: 'Drug Content',
    description: 'Images related to drug use',
    icon: '💊',
    priority: 5,
    keywords: ['Drugs'],
  },
  {
    id: 'alcohol',
    displayName: 'Alcohol Content',
    description: 'Images containing alcohol',
    icon: '🍺',
    priority: 3,
    keywords: ['Alcohol'],
  },
  {
    id: 'tobacco',
    displayName: 'Tobacco Content',
    description: 'Images containing tobacco products',
    icon: '🚬',
    priority: 4,
    keywords: ['Tobacco'],
  },

  // Offensive Content
  {
    id: 'hate_symbols',
    displayName: 'Hate Symbols',
    description: 'Images containing hate symbols',
    icon: '⚠️',
    priority: 9,
    keywords: ['Hate Symbols'],
  },
  {
    id: 'rude_gestures',
    displayName: 'Inappropriate Gestures',
    description: 'Images with rude or inappropriate gestures',
    icon: '🖕',
    priority: 5,
    keywords: ['Rude Gestures'],
  },

  // Gambling
  {
    id: 'gambling',
    displayName: 'Gambling Content',
    description: 'Images related to gambling',
    icon: '🎰',
    priority: 3,
    keywords: ['Gambling'],
  },
];

export class NsfwAlbumNaming {
  /**
   * Generate intelligent album name based on moderation labels
   */
  static generateAlbumName(moderationLabels: any[]): {
    name: string;
    description: string;
    icon: string;
    category: ModerationCategory;
  } {
    if (!moderationLabels || moderationLabels.length === 0) {
      return {
        name: 'Flagged Content',
        description: 'Content flagged by moderation system',
        icon: '🚫',
        category: {
          id: 'unknown',
          displayName: 'Unknown',
          description: 'Unknown flagged content',
          icon: '🚫',
          priority: 1,
          keywords: [],
        }
      };
    }

    // Find the highest priority category that matches the labels
    let bestMatch: ModerationCategory | null = null;
    let highestPriority = 0;

    for (const category of MODERATION_CATEGORIES) {
      for (const label of moderationLabels) {
        // ✅ FIXED: Handle both AWS format and our format
        const labelName = label.Name || label.name || '';
        const parentName = label.ParentName || label.parent_name || '';
        
        // ✅ IMPROVED: Better matching logic
        const matchesKeyword = category.keywords.some(keyword => 
          labelName.toLowerCase().includes(keyword.toLowerCase()) || 
          parentName.toLowerCase().includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(labelName.toLowerCase())
        );

        if (matchesKeyword && category.priority > highestPriority) {
          bestMatch = category;
          highestPriority = category.priority;
        
          console.log(`🎯 Matched label "${labelName}" to category "${category.displayName}" (priority: ${category.priority})`);
        }
      }
    }

    if (bestMatch) {
      return {
        name: bestMatch.displayName,
        description: bestMatch.description,
        icon: bestMatch.icon,
        category: bestMatch,
      };
    }

    // Fallback for unmatched labels
    console.log(`⚠️ No category match found for labels:`, moderationLabels.map(l => l.Name || l.name));
    
    return {
      name: 'Sensitive Content',
      description: 'Content flagged as potentially sensitive',
      icon: '⚠️',
      category: {
        id: 'sensitive',
        displayName: 'Sensitive Content',
        description: 'Content flagged as potentially sensitive',
        icon: '⚠️',
        priority: 2,
        keywords: [],
      }
    };
  }

  /**
   * Generate multiple album names for images with different moderation results
   */
  static generateMultipleAlbumNames(imagesModerationData: Array<{
    imageId: string;
    moderationLabels: any[];
    confidence: number;
  }>): Array<{
    categoryId: string;
    name: string;
    description: string;
    icon: string;
    imageIds: string[];
    averageConfidence: number;
    category: ModerationCategory;
  }> {
    const albumGroups: { [categoryId: string]: {
      category: ModerationCategory;
      imageIds: string[];
      confidences: number[];
    } } = {};

    // Group images by their primary moderation category
    for (const imageData of imagesModerationData) {
      const albumInfo = this.generateAlbumName(imageData.moderationLabels);
      const categoryId = albumInfo.category.id;

      if (!albumGroups[categoryId]) {
        albumGroups[categoryId] = {
          category: albumInfo.category,
          imageIds: [],
          confidences: [],
        };
      }

      albumGroups[categoryId].imageIds.push(imageData.imageId);
      albumGroups[categoryId].confidences.push(imageData.confidence);
    }

    // Convert groups to album definitions
    return Object.entries(albumGroups).map(([categoryId, group]) => {
      const averageConfidence = group.confidences.reduce((sum, conf) => sum + conf, 0) / group.confidences.length;
      
      return {
        categoryId,
        name: group.category.displayName,
        description: `${group.category.description} (${group.imageIds.length} images)`,
        icon: group.category.icon,
        imageIds: group.imageIds,
        averageConfidence,
        category: group.category,
      };
    }).sort((a, b) => b.category.priority - a.category.priority); // Sort by priority
  }

  /**
   * Get category info by ID
   */
  static getCategoryById(categoryId: string): ModerationCategory | null {
    return MODERATION_CATEGORIES.find(cat => cat.id === categoryId) || null;
  }

  /**
   * Get all available categories
   */
  static getAllCategories(): ModerationCategory[] {
    return [...MODERATION_CATEGORIES].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Generate a safe, user-friendly album name for display
   */
  static generateSafeDisplayName(category: ModerationCategory, imageCount: number): string {
    const countText = imageCount === 1 ? '1 image' : `${imageCount} images`;
    
    // Use more user-friendly names for sensitive categories
    const safeNames: { [key: string]: string } = {
      'explicit_nudity': 'Adult Content',
      'partial_nudity': 'Revealing Images',
      'suggestive_content': 'Suggestive Images',
      'graphic_violence': 'Violent Content',
      'disturbing_content': 'Disturbing Images',
      'hate_symbols': 'Inappropriate Symbols',
      'rude_gestures': 'Inappropriate Gestures',
    };

    const displayName = safeNames[category.id] || category.displayName;
    return `${displayName} (${countText})`;
  }
}
