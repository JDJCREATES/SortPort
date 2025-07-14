-- Simple storage policy for development
-- Run this in your Supabase SQL editor

-- Allow authenticated users to do everything in nsfw-temp-processing bucket
CREATE POLICY "Allow authenticated users full access to nsfw-temp-processing" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'nsfw-temp-processing')
WITH CHECK (bucket_id = 'nsfw-temp-processing');

-- Allow service role full access for cleanup
CREATE POLICY "Allow service role full access to nsfw-temp-processing" ON storage.objects
FOR ALL TO service_role
USING (bucket_id = 'nsfw-temp-processing')
WITH CHECK (bucket_id = 'nsfw-temp-processing');
