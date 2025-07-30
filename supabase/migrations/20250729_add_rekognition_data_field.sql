-- Add full rekognition data field to virtual_image table
-- This migration adds a dedicated field for complete AWS Rekognition response data
-- while maintaining backwards compatibility with existing metadata field

BEGIN;

-- Add the new rekognition_data field as JSONB for better querying and indexing
ALTER TABLE virtual_image 
ADD COLUMN rekognition_data JSONB DEFAULT NULL;

-- Create indexes for common rekognition data queries
CREATE INDEX IF NOT EXISTS idx_virtual_image_rekognition_moderation 
ON virtual_image USING GIN ((rekognition_data->'ModerationLabels'));

CREATE INDEX IF NOT EXISTS idx_virtual_image_rekognition_labels 
ON virtual_image USING GIN ((rekognition_data->'Labels'));

CREATE INDEX IF NOT EXISTS idx_virtual_image_rekognition_faces 
ON virtual_image USING GIN ((rekognition_data->'FaceDetails'));

-- Add a comment to document the field
COMMENT ON COLUMN virtual_image.rekognition_data IS 
'Complete AWS Rekognition response data including Labels, ModerationLabels, FaceDetails, ImageProperties, TextDetections, etc.';

COMMIT;
