/*
  # Create albums and sort sessions tables

  1. New Tables
    - `albums`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `name` (text)
      - `image_ids` (text array)
      - `tags` (text array)
      - `thumbnail` (text, optional)
      - `count` (integer)
      - `is_locked` (boolean, default false)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `sort_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `prompt` (text)
      - `results` (jsonb)
      - `processing_time` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for users to manage their own data

  3. Indexes
    - Add indexes for performance
*/

-- Create albums table
CREATE TABLE IF NOT EXISTS albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  image_ids text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  thumbnail text,
  count integer DEFAULT 0,
  is_locked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sort_sessions table
CREATE TABLE IF NOT EXISTS sort_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  prompt text NOT NULL,
  results jsonb NOT NULL DEFAULT '{}',
  processing_time integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE sort_sessions ENABLE ROW LEVEL SECURITY;

-- Albums policies
CREATE POLICY "Users can read own albums"
  ON albums
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own albums"
  ON albums
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own albums"
  ON albums
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own albums"
  ON albums
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Sort sessions policies
CREATE POLICY "Users can read own sort sessions"
  ON sort_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sort sessions"
  ON sort_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS albums_user_id_idx ON albums(user_id);
CREATE INDEX IF NOT EXISTS albums_created_at_idx ON albums(created_at DESC);
CREATE INDEX IF NOT EXISTS albums_tags_idx ON albums USING GIN(tags);

CREATE INDEX IF NOT EXISTS sort_sessions_user_id_idx ON sort_sessions(user_id);
CREATE INDEX IF NOT EXISTS sort_sessions_created_at_idx ON sort_sessions(created_at DESC);

-- Create trigger for albums updated_at
DROP TRIGGER IF EXISTS update_albums_updated_at ON albums;
CREATE TRIGGER update_albums_updated_at
  BEFORE UPDATE ON albums
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();