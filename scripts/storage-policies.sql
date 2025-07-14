-- Storage policies for nsfw-temp-processing bucket
-- Run these in your Supabase SQL editor

-- 1. Allow authenticated users to upload images for processing
CREATE POLICY "Allow authenticated users to upload images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nsfw-temp-processing' AND
  auth.uid()::text = (storage.foldername(name))[2]  -- Path contains user ID
);

-- 2. Allow authenticated users to read their own uploaded images
CREATE POLICY "Allow users to read their own images" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'nsfw-temp-processing' AND
  auth.uid()::text = (storage.foldername(name))[2]  -- Path contains user ID
);

-- 3. Allow authenticated users to delete their own images (cleanup)
CREATE POLICY "Allow users to delete their own images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'nsfw-temp-processing' AND
  auth.uid()::text = (storage.foldername(name))[2]  -- Path contains user ID
);

-- 4. Allow service role to manage all files (for cleanup)
CREATE POLICY "Allow service role full access" ON storage.objects
FOR ALL TO service_role
USING (bucket_id = 'nsfw-temp-processing');

-- 5. Enable RLS on the storage.objects table (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
