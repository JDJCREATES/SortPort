-- Migration: Add Spatial Coordinate Fields to virtual_image Table
-- This migration adds enhanced spatial data collection fields for ML Kit object detection,
-- face analysis, text recognition, and composition analysis.
-- Date: August 12, 2025
-- Purpose: Support client-side ML Kit spatial data enhancements

-- Add object coordinates field
-- Stores array of detected objects with bounding boxes, categories, and confidence scores
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS object_coordinates JSONB;

COMMENT ON COLUMN public.virtual_image.object_coordinates IS 
'Array of detected objects with spatial coordinates: [{label: string, confidence: number, boundingBox: {top, left, width, height}, category: string, trackingId?: number}]';

-- Add face coordinates field  
-- Stores array of detected faces with detailed spatial and expression data
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS face_coordinates JSONB;

COMMENT ON COLUMN public.virtual_image.face_coordinates IS 
'Array of detected faces with spatial coordinates and analysis: [{boundingBox: {top, left, width, height}, landmarks?: array, emotions: array, headPose?: {yaw, roll}, eyeState?: {leftOpen, rightOpen}, expressions?: {smiling}}]';

-- Add text regions field
-- Stores array of detected text blocks with spatial boundaries
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS text_regions JSONB;

COMMENT ON COLUMN public.virtual_image.text_regions IS 
'Array of detected text regions with spatial coordinates: [{text: string, boundingBox: {top, left, width, height}, confidence: number, language?: string}]';

-- Add composition analysis field
-- Stores comprehensive image composition and visual analysis data
ALTER TABLE public.virtual_image 
ADD COLUMN IF NOT EXISTS composition_analysis JSONB;

COMMENT ON COLUMN public.virtual_image.composition_analysis IS 
'Image composition analysis including: {dominantColors: array, spatialLayout: {topObjects, centerObjects, bottomObjects, leftObjects, rightObjects}, visualBalance: number, ruleOfThirds: boolean, symmetry: number}';

-- Create indexes for efficient spatial queries
CREATE INDEX IF NOT EXISTS idx_virtual_image_object_coordinates 
ON public.virtual_image USING GIN (object_coordinates) 
WHERE object_coordinates IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_face_coordinates 
ON public.virtual_image USING GIN (face_coordinates) 
WHERE face_coordinates IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_text_regions 
ON public.virtual_image USING GIN (text_regions) 
WHERE text_regions IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_composition 
ON public.virtual_image USING GIN (composition_analysis) 
WHERE composition_analysis IS NOT NULL;

-- Add helpful functions for spatial queries
CREATE OR REPLACE FUNCTION public.extract_object_labels(object_coords JSONB)
RETURNS TEXT[] AS $$
BEGIN
    IF object_coords IS NULL THEN
        RETURN ARRAY[]::TEXT[];
    END IF;
    
    RETURN ARRAY(
        SELECT jsonb_array_elements(object_coords) ->> 'label'
        WHERE jsonb_array_elements(object_coords) ->> 'label' IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.extract_object_labels(JSONB) IS 
'Extract array of object labels from object_coordinates JSONB field';

CREATE OR REPLACE FUNCTION public.count_faces_in_coordinates(face_coords JSONB)
RETURNS INTEGER AS $$
BEGIN
    IF face_coords IS NULL THEN
        RETURN 0;
    END IF;
    
    RETURN jsonb_array_length(face_coords);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.count_faces_in_coordinates(JSONB) IS 
'Count number of faces from face_coordinates JSONB field';

CREATE OR REPLACE FUNCTION public.has_text_in_regions(text_regions JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    IF text_regions IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN jsonb_array_length(text_regions) > 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.has_text_in_regions(JSONB) IS 
'Check if image has readable text from text_regions JSONB field';

-- Update RLS policies if they exist (inherit from existing table policies)
-- Note: This assumes RLS policies already exist on virtual_image table

-- Performance optimization: Create partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_virtual_image_has_objects 
ON public.virtual_image (user_id) 
WHERE object_coordinates IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_has_faces 
ON public.virtual_image (user_id) 
WHERE face_coordinates IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_image_has_text_spatial 
ON public.virtual_image (user_id) 
WHERE text_regions IS NOT NULL;

-- Add migration metadata
INSERT INTO public.schema_migrations (version, description, applied_at) 
VALUES (
    '005_virtual_image_spatial_coordinates',
    'Add spatial coordinate fields for enhanced ML Kit object detection, face analysis, text recognition, and composition analysis',
    NOW()
) ON CONFLICT (version) DO NOTHING;
