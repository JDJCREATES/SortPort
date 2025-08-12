-- Migration: Add Additional ML Kit Analysis Fields to virtual_image Table
-- This migration adds missing fields that are currently only stored in metadata
-- Date: August 12, 2025
-- Purpose: Extract useful data from metadata into dedicated searchable fields

-- Add detailed quality analysis fields
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS contrast_score DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS exposure_score DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS saturation_score DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS sharpness_score DOUBLE PRECISION;

COMMENT ON COLUMN public.virtual_image.contrast_score IS 
'AI-calculated contrast score (0.0-1.0) from ML Kit quality analysis';

COMMENT ON COLUMN public.virtual_image.exposure_score IS 
'AI-calculated exposure score (0.0-1.0) from ML Kit quality analysis';

COMMENT ON COLUMN public.virtual_image.saturation_score IS 
'AI-calculated saturation score (0.0-1.0) from ML Kit quality analysis';

COMMENT ON COLUMN public.virtual_image.sharpness_score IS 
'AI-calculated sharpness score (0.0-1.0) from ML Kit quality analysis';

-- Add ML Kit processing metadata fields
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_processing_time INTEGER;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_confidence_overall DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_confidence_face DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_confidence_object DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_confidence_text DOUBLE PRECISION;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_analysis_date TIMESTAMPTZ;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_mapping_version TEXT;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS mlkit_device_platform TEXT;

COMMENT ON COLUMN public.virtual_image.mlkit_processing_time IS 
'ML Kit processing time in milliseconds';

COMMENT ON COLUMN public.virtual_image.mlkit_confidence_overall IS 
'Overall ML Kit analysis confidence score (0.0-1.0)';

COMMENT ON COLUMN public.virtual_image.mlkit_confidence_face IS 
'Face detection confidence score (0.0-1.0)';

COMMENT ON COLUMN public.virtual_image.mlkit_confidence_object IS 
'Object detection confidence score (0.0-1.0)';

COMMENT ON COLUMN public.virtual_image.mlkit_confidence_text IS 
'Text recognition confidence score (0.0-1.0)';

COMMENT ON COLUMN public.virtual_image.mlkit_analysis_date IS 
'Timestamp when ML Kit analysis was performed';

COMMENT ON COLUMN public.virtual_image.mlkit_mapping_version IS 
'Version of ML Kit mapper used for analysis';

COMMENT ON COLUMN public.virtual_image.mlkit_device_platform IS 
'Device platform where ML Kit analysis was performed (react-native, web, etc.)';

-- Add face analysis enhancement fields
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS face_landmarks JSONB;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS face_head_poses JSONB;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS face_eye_states JSONB;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS face_expressions JSONB;

COMMENT ON COLUMN public.virtual_image.face_landmarks IS 
'Array of face landmark coordinates for all detected faces';

COMMENT ON COLUMN public.virtual_image.face_head_poses IS 
'Array of head pose data (yaw, roll) for all detected faces';

COMMENT ON COLUMN public.virtual_image.face_eye_states IS 
'Array of eye state data (leftOpen, rightOpen) for all detected faces';

COMMENT ON COLUMN public.virtual_image.face_expressions IS 
'Array of facial expression data (smiling, etc.) for all detected faces';

-- Add scene analysis enhancement fields
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS scene_setting JSONB;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS scene_weather TEXT;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS scene_time_of_day TEXT;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS scene_environment TEXT;

COMMENT ON COLUMN public.virtual_image.scene_setting IS 
'Array of scene settings detected (nature, residential, culinary, etc.)';

COMMENT ON COLUMN public.virtual_image.scene_weather IS 
'Detected weather conditions in the image';

COMMENT ON COLUMN public.virtual_image.scene_time_of_day IS 
'Detected time of day (morning, afternoon, evening, night)';

COMMENT ON COLUMN public.virtual_image.scene_environment IS 
'Detected environment type (indoor, outdoor, unknown)';

-- Add text analysis enhancement fields
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS text_full_content TEXT;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS text_languages JSONB;

ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS text_block_count INTEGER;

COMMENT ON COLUMN public.virtual_image.text_full_content IS 
'Complete extracted text content from the image';

COMMENT ON COLUMN public.virtual_image.text_languages IS 
'Array of detected languages in the text';

COMMENT ON COLUMN public.virtual_image.text_block_count IS 
'Number of text blocks detected in the image';

-- Create indexes for enhanced querying
CREATE INDEX IF NOT EXISTS idx_virtual_image_quality_scores 
ON public.virtual_image (quality_score, aesthetic_score, brightness_score) 
WHERE quality_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_mlkit_confidence 
ON public.virtual_image (mlkit_confidence_overall) 
WHERE mlkit_confidence_overall IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_scene_environment 
ON public.virtual_image (scene_environment, scene_time_of_day) 
WHERE scene_environment IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_text_content 
ON public.virtual_image USING GIN (to_tsvector('english', text_full_content)) 
WHERE text_full_content IS NOT NULL;

-- Add helpful utility functions
CREATE OR REPLACE FUNCTION public.get_image_quality_category(
    quality_score DOUBLE PRECISION,
    aesthetic_score DOUBLE PRECISION
) RETURNS TEXT AS $$
BEGIN
    IF quality_score IS NULL THEN
        RETURN 'unknown';
    END IF;
    
    IF quality_score >= 0.8 AND aesthetic_score >= 0.8 THEN
        RETURN 'excellent';
    ELSIF quality_score >= 0.7 AND aesthetic_score >= 0.7 THEN
        RETURN 'high';
    ELSIF quality_score >= 0.6 AND aesthetic_score >= 0.6 THEN
        RETURN 'good';
    ELSIF quality_score >= 0.5 THEN
        RETURN 'fair';
    ELSE
        RETURN 'poor';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_image_quality_category(DOUBLE PRECISION, DOUBLE PRECISION) IS 
'Categorize image quality based on quality and aesthetic scores';

-- Add migration metadata
INSERT INTO public.schema_migrations (version, description, applied_at) 
VALUES (
    '006_virtual_image_enhanced_mlkit_fields',
    'Add comprehensive ML Kit analysis fields extracted from metadata including quality scores, processing info, face analysis, scene data, and text content',
    NOW()
) ON CONFLICT (version) DO NOTHING;
