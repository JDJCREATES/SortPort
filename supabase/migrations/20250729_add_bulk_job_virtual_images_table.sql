-- Add relationship table between bulk jobs and virtual images
-- This migration fixes the path-based matching issue by using database IDs

BEGIN;

-- Create junction table to track which virtual images belong to which bulk jobs
CREATE TABLE IF NOT EXISTS public.bulk_job_virtual_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    virtual_image_id UUID NOT NULL,
    s3_key TEXT, -- Store the original S3 key for reference
    upload_order INTEGER, -- Track the order images were uploaded
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Foreign key constraints
    CONSTRAINT fk_bulk_job_virtual_images_job_id 
        FOREIGN KEY (job_id) REFERENCES nsfw_bulk_jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_bulk_job_virtual_images_virtual_image_id 
        FOREIGN KEY (virtual_image_id) REFERENCES virtual_image(id) ON DELETE CASCADE,
    
    -- Ensure unique combination
    CONSTRAINT unique_job_virtual_image 
        UNIQUE (job_id, virtual_image_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bulk_job_virtual_images_job_id 
    ON public.bulk_job_virtual_images(job_id);

CREATE INDEX IF NOT EXISTS idx_bulk_job_virtual_images_virtual_image_id 
    ON public.bulk_job_virtual_images(virtual_image_id);

CREATE INDEX IF NOT EXISTS idx_bulk_job_virtual_images_s3_key 
    ON public.bulk_job_virtual_images(s3_key);

-- Add comments for documentation
COMMENT ON TABLE public.bulk_job_virtual_images IS 
'Junction table linking bulk NSFW processing jobs to virtual images by database IDs instead of unreliable file paths';

COMMENT ON COLUMN public.bulk_job_virtual_images.job_id IS 
'References the bulk job ID from nsfw_bulk_jobs table';

COMMENT ON COLUMN public.bulk_job_virtual_images.virtual_image_id IS 
'References the virtual image ID from virtual_image table';

COMMENT ON COLUMN public.bulk_job_virtual_images.s3_key IS 
'Original S3 key for reference, but NOT used for matching';

COMMENT ON COLUMN public.bulk_job_virtual_images.upload_order IS 
'Order in which the image was uploaded in the batch for correlation with AWS results';

-- Enable RLS (Row Level Security)
ALTER TABLE public.bulk_job_virtual_images ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on bulk_job_virtual_images" 
    ON public.bulk_job_virtual_images
    FOR ALL USING (auth.role() = 'service_role');

-- Allow users to access their own job-image relationships
CREATE POLICY "Users can access their own bulk job virtual images" 
    ON public.bulk_job_virtual_images
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM nsfw_bulk_jobs 
            WHERE nsfw_bulk_jobs.id = bulk_job_virtual_images.job_id 
            AND nsfw_bulk_jobs.user_id = auth.uid()
        )
    );

-- ================================================================================
-- AUTO-CLEANUP MECHANISMS
-- ================================================================================

-- Function to clean up orphaned job-virtual image relationships
CREATE OR REPLACE FUNCTION cleanup_orphaned_bulk_job_virtual_images()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER := 0;
    rows_affected INTEGER;
BEGIN
    -- Delete relationships where the job no longer exists
    DELETE FROM bulk_job_virtual_images 
    WHERE job_id NOT IN (SELECT id FROM nsfw_bulk_jobs);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete relationships where the virtual image no longer exists
    DELETE FROM bulk_job_virtual_images 
    WHERE virtual_image_id NOT IN (SELECT id FROM virtual_image);
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    deleted_count := deleted_count + rows_affected;
    
    -- Delete relationships for jobs older than 30 days that are completed/failed
    DELETE FROM bulk_job_virtual_images 
    WHERE job_id IN (
        SELECT id FROM nsfw_bulk_jobs 
        WHERE status IN ('completed', 'failed') 
        AND created_at < NOW() - INTERVAL '30 days'
    );
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    deleted_count := deleted_count + rows_affected;
    
    RETURN deleted_count;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_orphaned_bulk_job_virtual_images() TO service_role;

-- Create automatic cleanup job using pg_cron (if available)
-- This will run daily at 2 AM to clean up orphaned records
-- Note: pg_cron extension must be enabled for this to work
DO $$
BEGIN
    -- Check if pg_cron extension exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Schedule daily cleanup
        PERFORM cron.schedule(
            'cleanup-bulk-job-virtual-images',
            '0 2 * * *', -- Daily at 2 AM
            'SELECT cleanup_orphaned_bulk_job_virtual_images();'
        );
        
        RAISE NOTICE 'Scheduled daily cleanup job for bulk_job_virtual_images';
    ELSE
        RAISE NOTICE 'pg_cron extension not available - manual cleanup required';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not schedule cleanup job: %', SQLERRM;
END;
$$;

-- Trigger to automatically clean up when jobs are deleted
CREATE OR REPLACE FUNCTION trigger_cleanup_bulk_job_virtual_images()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete relationships for the deleted job
    DELETE FROM bulk_job_virtual_images WHERE job_id = OLD.id;
    RETURN OLD;
END;
$$;

-- Create trigger on nsfw_bulk_jobs deletion
DROP TRIGGER IF EXISTS trigger_nsfw_bulk_jobs_delete_cleanup ON nsfw_bulk_jobs;
CREATE TRIGGER trigger_nsfw_bulk_jobs_delete_cleanup
    AFTER DELETE ON nsfw_bulk_jobs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cleanup_bulk_job_virtual_images();

-- Trigger to automatically clean up when virtual images are deleted
CREATE OR REPLACE FUNCTION trigger_cleanup_virtual_image_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete relationships for the deleted virtual image
    DELETE FROM bulk_job_virtual_images WHERE virtual_image_id = OLD.id;
    RETURN OLD;
END;
$$;

-- Create trigger on virtual_image deletion
DROP TRIGGER IF EXISTS trigger_virtual_image_delete_cleanup ON virtual_image;
CREATE TRIGGER trigger_virtual_image_delete_cleanup
    AFTER DELETE ON virtual_image
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cleanup_virtual_image_relationships();

-- Add comments for maintenance documentation
COMMENT ON FUNCTION cleanup_orphaned_bulk_job_virtual_images() IS 
'Cleans up orphaned records in bulk_job_virtual_images table. Run manually or via scheduled job.';

COMMENT ON FUNCTION trigger_cleanup_bulk_job_virtual_images() IS 
'Trigger function to automatically clean up job relationships when jobs are deleted.';

COMMENT ON FUNCTION trigger_cleanup_virtual_image_relationships() IS 
'Trigger function to automatically clean up job relationships when virtual images are deleted.';

COMMIT;
