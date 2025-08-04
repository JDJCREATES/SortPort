-- Add is_nsfw column to virtual_image table
-- This column is required for NSFW detection results from AWS Rekognition

ALTER TABLE virtual_image 
ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN DEFAULT false;

-- Add index for performance on NSFW queries
CREATE INDEX IF NOT EXISTS idx_virtual_image_is_nsfw 
ON virtual_image (is_nsfw);

-- Add comment for documentation
COMMENT ON COLUMN virtual_image.is_nsfw IS 'Indicates if image contains NSFW content detected by AWS Rekognition';
