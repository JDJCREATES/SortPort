import { supabase } from '../supabase';
import { NsfwAlbumNaming } from '../moderation/nsfwAlbumNaming';
import { generateUUID } from '../helpers/uuid';

/**
 * Called Through AlbumUtils after bulk moderation is completed
 * Updated to use virtual_image table instead of moderated_images
 * -- May be handled or called through langchain soon!
 */


interface ModerationResult {
  confidence_score: number;
  moderation_labels: any[];
  isflagged?: boolean;
  nsfw_score?: number;
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

      // ✅ FIXED: Skip redundant virtual_image updates since virtual-image-bridge already handles them
      // AWS Rekognition data: Handled by virtual-image-bridge from bulk-nsfw-status
      // ML Kit data: Already stored during initial batch upload via virtual-image-bridge  
      // await this.insertDetailedModeratedImages(user.id, nsfwImages, moderationResults);
      console.log(`✅ Skipping virtual_image updates - handled by virtual-image-bridge`);

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
   * Insert detailed moderated image records into virtual_image table
   */
  private static async insertDetailedModeratedImages(
    userId: string, 
    nsfwImages: any[], 
    moderationResults: { [imageId: string]: ModerationResult }
  ): Promise<void> {
    try {
      let successCount = 0;
      let errorCount = 0;

      // Update existing virtual_image records with NSFW moderation data
      for (const image of nsfwImages) {
        const moderationResult = moderationResults[image.id];
        
        const updateData = {
          isflagged: true,
          nsfw_score: moderationResult?.confidence_score || 0.9,
          rekognition_data: moderationResult ? {
            confidence_score: moderationResult.confidence_score || 0,
            labels: moderationResult.moderation_labels || [],
            aws_response: moderationResult
          } : null,
          updated_at: new Date().toISOString(),
        };

        // Try multiple approaches to find the virtual_image record
        let updateSuccess = false;

        // Approach 1: Try direct UUID match (in case ID is already a UUID)
        try {
          const { data: directMatch, error: directError } = await supabase
            .from('virtual_image')
            .update(updateData)
            .eq('user_id', userId)
            .eq('id', image.id)
            .select('id');

          if (!directError && directMatch && directMatch.length > 0) {
            console.log(`✅ Direct UUID match for ${image.id}`);
            updateSuccess = true;
            successCount++;
          }
        } catch (directErr) {
          // UUID format error expected for device IDs, continue to next approach
        }

        // Approach 2: Search by original_path containing the device ID
        if (!updateSuccess) {
          const { data: pathMatches, error: pathError } = await supabase
            .from('virtual_image')
            .select('id')
            .eq('user_id', userId)
            .ilike('original_path', `%${image.id}%`);

          if (!pathError && pathMatches && pathMatches.length > 0) {
            for (const match of pathMatches) {
              const { error: updateError } = await supabase
                .from('virtual_image')
                .update(updateData)
                .eq('id', match.id);

              if (!updateError) {
                console.log(`✅ Path match update for device ID ${image.id} -> virtual ID ${match.id}`);
                updateSuccess = true;
                successCount++;
                break;
              }
            }
          }
        }

        // Approach 3: Search by hash field if it contains the device ID
        if (!updateSuccess) {
          const { data: hashMatches, error: hashError } = await supabase
            .from('virtual_image')
            .select('id')
            .eq('user_id', userId)
            .eq('hash', image.id);

          if (!hashError && hashMatches && hashMatches.length > 0) {
            for (const match of hashMatches) {
              const { error: updateError } = await supabase
                .from('virtual_image')
                .update(updateData)
                .eq('id', match.id);

              if (!updateError) {
                console.log(`✅ Hash match update for device ID ${image.id} -> virtual ID ${match.id}`);
                updateSuccess = true;
                successCount++;
                break;
              }
            }
          }
        }

        if (!updateSuccess) {
          console.warn(`⚠️ Could not find virtual_image record for device ID ${image.id}`);
          errorCount++;
        }
      }

      console.log(`✅ Virtual image update completed: ${successCount} successful, ${errorCount} failed out of ${nsfwImages.length} total`);

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