-- Add missing has_text field to virtual_image table
-- This migration adds the has_text boolean field for ML Kit text detection results

BEGIN;

-- Add has_text field for text detection results
ALTER TABLE virtual_image 
ADD COLUMN has_text BOOLEAN DEFAULT NULL;

-- Create index for text-based queries
CREATE INDEX IF NOT EXISTS idx_virtual_image_has_text 
ON virtual_image(has_text) WHERE has_text IS NOT NULL;

-- Add comment to document the field
COMMENT ON COLUMN virtual_image.has_text IS 
'Boolean indicating whether ML Kit detected any readable text in the image';

COMMIT;
