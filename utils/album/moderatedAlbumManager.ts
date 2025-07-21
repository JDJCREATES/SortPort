import { supabase } from '../supabase';
import { NsfwAlbumNaming } from '../moderation/nsfwAlbumNaming';
import { generateUUID } from '../helpers/uuid';

/**
 *  Called Through AlbumUtils after bulk mdoeration is completed
 * -- May be handled or called throuhg langchain soon!
 */


interface ModerationResult {
  confidence_score: number;
  moderation_labels: any[];
}

interface AlbumCategory {
  name: string;
  imageIds: string[];
  categoryId: string;
  category: any;
}

export class ModeratedAlbumManager {
  /**
   * Create categorized moderated albums based on moderation labels
   */
  
  static async createCategorizedModeratedAlbums(
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: ModerationResult }
  ): Promise<void> {
    try {
      console.log(`🔒 createCategorizedModeratedAlbums called with ${nsfwImages.length} images`);
      console.log(`🔒 Moderation results keys: ${Object.keys(moderationResults).length}`);
    
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 createCategorizedModeratedAlbums: User not authenticated, skipping');
        return;
      }

      if (!nsfwImages || nsfwImages.length === 0) {
        console.log('🔒 createCategorizedModeratedAlbums: No NSFW images provided');
        return;
      }

      // ✅ FIXED: Prepare moderation data in the correct format for NsfwAlbumNaming
      const imagesModerationData = nsfwImages.map((image: any) => {
        const moderationResult = moderationResults[image.id];
        
        return {
          imageId: image.id,
          moderationLabels: moderationResult?.moderation_labels || [],
          confidence: moderationResult?.confidence_score || 0,
        };
      });

      console.log(`🎯 Prepared moderation data for ${imagesModerationData.length} images`);
      console.log(`🎯 Sample moderation data:`, imagesModerationData[0]);

      // ✅ Use NsfwAlbumNaming for intelligent categorization
      const albumCategories = NsfwAlbumNaming.generateMultipleAlbumNames(imagesModerationData);

      console.log(`🎯 Generated ${albumCategories.length} categorized albums:`, 
        albumCategories.map((cat: AlbumCategory) => `${cat.name} (${cat.imageIds.length} images)`));

      // ✅ ModeratedAlbumManager handles database operations
      for (const albumCategory of albumCategories) {
        await this.createOrUpdateCategorizedAlbum(user.id, albumCategory, nsfwImages, moderationResults);
      }

      // ✅ ModeratedAlbumManager handles detailed records
      await this.insertDetailedModeratedImages(user.id, nsfwImages, moderationResults);

    } catch (error) {
      console.error('❌ createCategorizedModeratedAlbums: Error:', error);
    }
  }

  
  /**
   * Create or update a specific categorized moderated album
   */
  private static async createOrUpdateCategorizedAlbum(
    userId: string,
    albumCategory: AlbumCategory,
    allNsfwImages: any[],
    moderationResults: { [imageId: string]: ModerationResult }
  ): Promise<void> {
    try {
      // Filter images for this specific category
      const categoryImages = allNsfwImages.filter((img: any) => 
        albumCategory.imageIds.includes(img.id)
      );

      if (categoryImages.length === 0) return;

        // ✅ FIXED: Use base name without count
      const albumName = albumCategory.category.displayName; // "Explicit Content", "Partial Nudity"
      // Generate thumbnail from first image in category
      const thumbnail = categoryImages[0]?.uri || null;

      // ✅ FIXED: Search by exact display name since there's no count
      const { data: existingAlbums, error: loadError } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', userId)
        .eq('is_moderated_album', true)
        .eq('name', albumName) // ✅ Exact name match since no count
        .order('created_at', { ascending: false })
        .limit(1);

      if (loadError) {
        console.error('❌ Error loading existing categorized album:', loadError);
        return;
      }

      // ✅ Fallback: search by category ID in tags
      let finalExistingAlbums: any[] = existingAlbums || [];
      if (finalExistingAlbums.length === 0) {
        const { data: fallbackAlbums, error: fallbackError } = await supabase
          .from('albums')
          .select('*')
          .eq('user_id', userId)
          .eq('is_moderated_album', true)
          .contains('tags', [albumCategory.categoryId])
          .order('created_at', { ascending: false })
          .limit(1);
      
        if (!fallbackError && fallbackAlbums) {
          finalExistingAlbums = fallbackAlbums;
        }
      }

    

      if (finalExistingAlbums.length > 0) {
        // Update existing album
        const existingAlbum = finalExistingAlbums[0];
        const existingImageIds = existingAlbum.image_ids || [];
        const mergedImageIds = [...new Set([...existingImageIds, ...albumCategory.imageIds])];

        if (mergedImageIds.length > existingImageIds.length) {
          const { error: updateError } = await supabase
            .from('albums')
            .update({
              name: albumName, // ✅ Keep same base name
              image_ids: mergedImageIds,
              count: mergedImageIds.length,
              thumbnail: thumbnail || existingAlbum.thumbnail,
              tags: [
                'nsfw', 
                'moderated', 
                albumCategory.categoryId, // ✅ Ensure category ID is in tags
                ...albumCategory.category.keywords.map((k: string) => k.toLowerCase().replace(/\s+/g, '_'))
              ],
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingAlbum.id);

          if (updateError) {
            console.error('❌ Error updating categorized album:', updateError);
          } else {
            console.log(`✅ Updated categorized album: ${albumName} (${mergedImageIds.length} images)`);
          }
        }
      } else {
        // Create new album
        const newAlbum = {
          id: generateUUID(),
          user_id: userId,
          name: albumName, // ✅ Base name without count
          image_ids: albumCategory.imageIds,
          tags: [
            'nsfw', 
            'moderated', 
            albumCategory.categoryId, // ✅ Include category ID for future matching
            ...albumCategory.category.keywords.map((k: string) => k.toLowerCase().replace(/\s+/g, '_'))
          ],
          thumbnail: thumbnail,
          count: albumCategory.imageIds.length,
          is_locked: true,
          is_all_photos_album: false,
          is_moderated_album: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log(`🔒 Creating moderated album in database:`, {
          name: albumName,
          count: newAlbum.count,
          is_moderated_album: newAlbum.is_moderated_album,
          tags: newAlbum.tags
        });

        const { error: insertError } = await supabase
          .from('albums')
          .insert([newAlbum]);

        if (insertError) {
          console.error('❌ Error creating categorized album:', insertError);
        } else {
          console.log(`✅ Successfully created moderated album: ${albumName}`);
        }
      }

    } catch (error) {
      console.error('❌ createOrUpdateCategorizedAlbum: Error:', error);
    }
  }

  /**
   * Insert detailed moderated image records with AWS Rekognition results
   */
  private static async insertDetailedModeratedImages(
    userId: string, 
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: ModerationResult }
  ): Promise<void> {
    try {
      // Prepare detailed moderated image records with proper schema
      const moderatedImageRecords = nsfwImages.map((image: any) => {
        const moderationResult = moderationResults[image.id];
        
        return {
          id: generateUUID(),
          user_id: userId,
          image_id: image.id,
          folder_id: image.folderId || 'unknown',
          is_nsfw: true,
          moderation_labels: moderationResult ? {
            confidence_score: moderationResult.confidence_score || 0,
            labels: moderationResult.moderation_labels || [],
            aws_response: moderationResult
          } : {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      // Insert new moderated image records
      const { error: insertError } = await supabase
        .from('moderated_images')
        .upsert(moderatedImageRecords, { 
          onConflict: 'user_id,image_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('❌ Error inserting detailed moderated images:', insertError);
      } else {
        console.log(`✅ Inserted/updated ${moderatedImageRecords.length} detailed moderated image records`);
      }

    } catch (error) {
      console.error('❌ insertDetailedModeratedImages: Error:', error);
    }
  }

  /**
   * Update moderated_folders table to track which folders have been scanned
   */
  static async updateModeratedFolders(folderIds: string[], folderNames: { [folderId: string]: string }): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('🔒 updateModeratedFolders: User not authenticated, skipping');
        return;
      }

      const moderatedFolderRecords = folderIds.map((folderId: string) => ({
        id: generateUUID(),
        user_id: user.id,
        folder_id: folderId,
        folder_name: folderNames[folderId] || 'Unknown Folder',
        last_scanned_at: new Date().toISOString(),
        status: 'scanned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Upsert folder records
      const { error: insertError } = await supabase
        .from('moderated_folders')
        .upsert(moderatedFolderRecords, { 
          onConflict: 'user_id,folder_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        console.error('❌ Error updating moderated folders:', insertError);
      } else {
        console.log(`✅ Updated ${moderatedFolderRecords.length} moderated folder records`);
      }

    } catch (error) {
      console.error('❌ updateModeratedFolders: Error:', error);
    }
  }

  // ✅ FIXED: Deduplicate tags properly
  private static generateEnhancedTags(category: AlbumCategory, existingTags?: string[]): string[] {
    const baseTags = ['nsfw', 'moderated', category.categoryId];
    const keywordTags = category.category.keywords.map((k: string) => 
      k.toLowerCase().replace(/\s+/g, '_')
    );
    
    // Preserve existing custom tags that aren't in our base set
    const preservedTags = existingTags?.filter(tag => 
      !baseTags.includes(tag) && 
      !keywordTags.includes(tag) &&
      !tag.startsWith('category_')
    ) || [];
    
    // ✅ FIXED: Use Set to remove duplicates
    const allTags = [...baseTags, ...keywordTags, ...preservedTags];
    const uniqueTags = Array.from(new Set(allTags));
    
    console.log(`🏷️ Generated unique tags for ${category.name}:`, uniqueTags);
    return uniqueTags;
  }
}