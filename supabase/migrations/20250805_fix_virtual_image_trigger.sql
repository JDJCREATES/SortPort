-- Migration: Fix virtual_image trigger that references non-existent folder_id
-- Date: 2025-08-05
-- Purpose: Remove problematic trigger that tries to sync to moderated_images with folder_id

-- Drop the problematic trigger and function
DROP TRIGGER IF EXISTS trigger_sync_rekognition_to_moderated_images ON virtual_image;
DROP FUNCTION IF EXISTS sync_rekognition_to_moderated_images();

-- Note: The virtual-image-bridge should handle virtual_image updates directly
-- The moderated_images table will be populated by bulk-nsfw-status function
-- No automatic syncing is needed between virtual_image and moderated_images
