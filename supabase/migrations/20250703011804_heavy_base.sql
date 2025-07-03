/*
  # Add All Photos Album Support

  1. Schema Changes
    - Add `is_all_photos_album` column to albums table
    - This identifies the special "All Photos" album that aggregates all photos

  2. Indexes
    - Add index for efficient querying of the all photos album
*/

-- Add column to identify the special "All Photos" album
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'albums' AND column_name = 'is_all_photos_album'
  ) THEN
    ALTER TABLE albums ADD COLUMN is_all_photos_album boolean DEFAULT false;
  END IF;
END $$;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS albums_is_all_photos_idx ON albums(is_all_photos_album) WHERE is_all_photos_album = true;

-- Ensure only one "All Photos" album per user
CREATE UNIQUE INDEX IF NOT EXISTS albums_user_all_photos_unique 
ON albums(user_id) 
WHERE is_all_photos_album = true;