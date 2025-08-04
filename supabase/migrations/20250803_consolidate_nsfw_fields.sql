-- Consolidate NSFW fields and set up proper table linking
-- Remove is_nsfw f        -- Insert or update moderated_images record
        INSERT INTO moderated_images (
            id,
            user_id,
            image_id,
            is_nsfw,
            moderation_labels,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            NEW.user_id,
            NEW.id,
            is_nsfw_detected,
            moderation_data,
            NOW(),
            NOW()
        )hould use isflagged instead)
-- Set up triggers to sync moderated_images with virtual_image

-- Step 1: Remove is_nsfw column from virtual_image (if it exists)
ALTER TABLE virtual_image 
DROP COLUMN IF EXISTS is_nsfw;

-- Drop the index as well
DROP INDEX IF EXISTS idx_virtual_image_is_nsfw;

-- Step 2: Ensure isflagged column exists and is properly set up
ALTER TABLE virtual_image 
ADD COLUMN IF NOT EXISTS isflagged BOOLEAN DEFAULT false;

-- Add index for isflagged for better query performance
CREATE INDEX IF NOT EXISTS idx_virtual_image_isflagged 
ON virtual_image (isflagged);

-- Add index for nsfw_score for filtering
CREATE INDEX IF NOT EXISTS idx_virtual_image_nsfw_score 
ON virtual_image (nsfw_score);

-- Step 3: Create function to sync moderated_images with virtual_image
CREATE OR REPLACE FUNCTION sync_moderation_to_virtual_image()
RETURNS TRIGGER AS $$
BEGIN
    -- Update virtual_image when moderated_images is updated
    UPDATE virtual_image 
    SET 
        isflagged = NEW.is_nsfw,
        nsfw_score = CASE 
            WHEN NEW.moderation_labels IS NOT NULL AND jsonb_array_length(NEW.moderation_labels) > 0 
            THEN COALESCE(
                (NEW.moderation_labels->>0->>'confidence')::numeric,
                CASE WHEN NEW.is_nsfw THEN 0.8 ELSE 0.2 END
            )
            ELSE CASE WHEN NEW.is_nsfw THEN 0.8 ELSE 0.2 END
        END,
        updated_at = NOW()
    WHERE id = NEW.image_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to automatically sync moderated_images changes to virtual_image
DROP TRIGGER IF EXISTS trigger_sync_moderation_to_virtual_image ON moderated_images;
CREATE TRIGGER trigger_sync_moderation_to_virtual_image
    AFTER INSERT OR UPDATE ON moderated_images
    FOR EACH ROW
    EXECUTE FUNCTION sync_moderation_to_virtual_image();

-- Step 5: Create function to sync rekognition_data changes to moderated_images
CREATE OR REPLACE FUNCTION sync_rekognition_to_moderated_images()
RETURNS TRIGGER AS $$
DECLARE
    moderation_data jsonb;
    is_nsfw_detected boolean;
    confidence_score numeric;
BEGIN
    -- Extract moderation data from rekognition_data
    IF NEW.rekognition_data IS NOT NULL AND 
       NEW.rekognition_data ? 'ModerationLabels' THEN
        
        moderation_data := NEW.rekognition_data->'ModerationLabels';
        
        -- Determine if content is NSFW based on high-confidence labels
        SELECT EXISTS(
            SELECT 1 FROM jsonb_array_elements(moderation_data) AS label
            WHERE (label->>'Confidence')::numeric > 80
            AND label->>'Name' IN ('Explicit Nudity', 'Suggestive', 'Sexual Activity')
        ) INTO is_nsfw_detected;
        
        -- Get highest confidence score
        SELECT COALESCE(MAX((label->>'Confidence')::numeric), 0)
        FROM jsonb_array_elements(moderation_data) AS label
        INTO confidence_score;
        
        -- Insert or update moderated_images record
        INSERT INTO moderated_images (
            id,
            user_id,
            image_id,
            folder_id,
            is_nsfw,
            moderation_labels,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            NEW.user_id,
            NEW.id,
            COALESCE(NEW.folder_id, 'unknown'), -- Use COALESCE for missing folder_id
            is_nsfw_detected,
            moderation_data,
            NOW(),
            NOW()
        )
        ON CONFLICT (image_id) DO UPDATE SET
            is_nsfw = is_nsfw_detected,
            moderation_labels = moderation_data,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to sync virtual_image rekognition_data to moderated_images
DROP TRIGGER IF EXISTS trigger_sync_rekognition_to_moderated_images ON virtual_image;
CREATE TRIGGER trigger_sync_rekognition_to_moderated_images
    AFTER UPDATE OF rekognition_data ON virtual_image
    FOR EACH ROW
    WHEN (NEW.rekognition_data IS DISTINCT FROM OLD.rekognition_data)
    EXECUTE FUNCTION sync_rekognition_to_moderated_images();

-- Step 7: Add unique constraint on moderated_images.image_id if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'moderated_images_image_id_unique'
        AND table_name = 'moderated_images'
    ) THEN
        ALTER TABLE moderated_images 
        ADD CONSTRAINT moderated_images_image_id_unique UNIQUE (image_id);
    END IF;
END $$;

-- Step 8: Create helpful indexes for the new sync operations
CREATE INDEX IF NOT EXISTS idx_moderated_images_image_id 
ON moderated_images (image_id);

CREATE INDEX IF NOT EXISTS idx_virtual_image_rekognition_data 
ON virtual_image USING gin (rekognition_data);

-- Step 9: Add helpful comments
COMMENT ON COLUMN virtual_image.isflagged IS 'NSFW flag synced from moderated_images.is_nsfw';
COMMENT ON COLUMN virtual_image.nsfw_score IS 'NSFW confidence score derived from rekognition_data or moderated_images';
COMMENT ON FUNCTION sync_moderation_to_virtual_image() IS 'Syncs moderated_images changes to virtual_image isflagged and nsfw_score';
COMMENT ON FUNCTION sync_rekognition_to_moderated_images() IS 'Syncs virtual_image rekognition_data to moderated_images table';
