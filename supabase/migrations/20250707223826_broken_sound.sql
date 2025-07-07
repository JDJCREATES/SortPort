/*
  # Add NSFW Moderation Tables

  1. New Tables
    - `moderated_folders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `folder_id` (text, device folder ID)
      - `folder_name` (text, device folder name)
      - `last_scanned_at` (timestamp)
      - `status` (text, scanning status)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `moderated_images`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `image_id` (text, MediaLibrary image ID)
      - `folder_id` (text, references moderated_folders.folder_id)
      - `is_nsfw` (boolean, true if NSFW detected)
      - `moderation_labels` (jsonb, Rekognition labels)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Schema Changes
    - Add `is_moderated_album` column to albums table

  3. Security
    - Enable RLS on both tables
    - Add policies for users to manage their own data

  4. Indexes
    - Add indexes for performance
*/

-- Create moderated_folders table
CREATE TABLE IF NOT EXISTS moderated_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  folder_id text NOT NULL,
  folder_name text NOT NULL,
  last_scanned_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'scanning', 'scanned', 'error')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create moderated_images table
CREATE TABLE IF NOT EXISTS moderated_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  image_id text NOT NULL,
  folder_id text NOT NULL,
  is_nsfw boolean DEFAULT false,
  moderation_labels jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add is_moderated_album column to albums table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'albums' AND column_name = 'is_moderated_album'
  ) THEN
    ALTER TABLE albums ADD COLUMN is_moderated_album boolean DEFAULT false;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE moderated_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderated_images ENABLE ROW LEVEL SECURITY;

-- Moderated folders policies
CREATE POLICY "Users can read own moderated folders"
  ON moderated_folders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own moderated folders"
  ON moderated_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own moderated folders"
  ON moderated_folders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own moderated folders"
  ON moderated_folders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Moderated images policies
CREATE POLICY "Users can read own moderated images"
  ON moderated_images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own moderated images"
  ON moderated_images
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own moderated images"
  ON moderated_images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own moderated images"
  ON moderated_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS moderated_folders_user_id_idx ON moderated_folders(user_id);
CREATE INDEX IF NOT EXISTS moderated_folders_folder_id_idx ON moderated_folders(folder_id);
CREATE INDEX IF NOT EXISTS moderated_folders_status_idx ON moderated_folders(status);

CREATE INDEX IF NOT EXISTS moderated_images_user_id_idx ON moderated_images(user_id);
CREATE INDEX IF NOT EXISTS moderated_images_folder_id_idx ON moderated_images(folder_id);
CREATE INDEX IF NOT EXISTS moderated_images_image_id_idx ON moderated_images(image_id);
CREATE INDEX IF NOT EXISTS moderated_images_is_nsfw_idx ON moderated_images(is_nsfw);

-- Create unique constraint to prevent duplicate folder entries per user
CREATE UNIQUE INDEX IF NOT EXISTS moderated_folders_user_folder_unique 
ON moderated_folders(user_id, folder_id);

-- Create unique constraint to prevent duplicate image entries
CREATE UNIQUE INDEX IF NOT EXISTS moderated_images_user_image_unique 
ON moderated_images(user_id, image_id);

-- Create trigger for moderated_folders updated_at
DROP TRIGGER IF EXISTS update_moderated_folders_updated_at ON moderated_folders;
CREATE TRIGGER update_moderated_folders_updated_at
  BEFORE UPDATE ON moderated_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for moderated_images updated_at
DROP TRIGGER IF EXISTS update_moderated_images_updated_at ON moderated_images;
CREATE TRIGGER update_moderated_images_updated_at
  BEFORE UPDATE ON moderated_images
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();