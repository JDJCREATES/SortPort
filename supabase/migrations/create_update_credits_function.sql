-- Create function to safely update user credits
CREATE OR REPLACE FUNCTION update_user_credits(
  p_user_id UUID,
  credit_change INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  current_credits INTEGER;
  new_credits INTEGER;
BEGIN
  -- Get current credits with row lock
  SELECT balance INTO current_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if user exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Calculate new credits
  new_credits := current_credits + credit_change;

  -- Prevent negative credits
  IF new_credits < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient credits',
      'current_credits', current_credits,
      'requested_change', credit_change
    );
  END IF;

  -- Update credits
  UPDATE user_credits
  SET 
    balance = new_credits,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Return success result
  RETURN json_build_object(
    'success', true,
    'previous_credits', current_credits,
    'credit_change', credit_change,
    'new_credits', new_credits
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Handle any errors
    RETURN json_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_credits(UUID, INTEGER) TO authenticated;

-- Create function for getting user image stats
CREATE OR REPLACE FUNCTION get_user_image_stats(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  total_count INTEGER;
  embedding_count INTEGER;
  vision_count INTEGER;
  album_count INTEGER;
  avg_nsfw DOUBLE PRECISION;
BEGIN
  -- Get image statistics
  SELECT 
    COUNT(*),
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END),
    COUNT(CASE WHEN vision_sorted = true THEN 1 END),
    COUNT(DISTINCT virtualalbum),
    AVG(nsfwscore)
  INTO 
    total_count,
    embedding_count,
    vision_count,
    album_count,
    avg_nsfw
  FROM virtual_image
  WHERE user_id = p_user_id;

  -- Return stats as JSON
  RETURN json_build_object(
    'total', COALESCE(total_count, 0),
    'withEmbeddings', COALESCE(embedding_count, 0),
    'withVisionAnalysis', COALESCE(vision_count, 0),
    'albums', COALESCE(album_count, 0),
    'averageNsfwScore', COALESCE(avg_nsfw, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Return empty stats on error
    RETURN json_build_object(
      'total', 0,
      'withEmbeddings', 0,
      'withVisionAnalysis', 0,
      'albums', 0,
      'averageNsfwScore', 0
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_image_stats(UUID) TO authenticated;

-- Create function for vector similarity search
CREATE OR REPLACE FUNCTION vector_similarity_search(
  query_embedding vector(384),
  p_user_id UUID,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.5,
  max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  originalPath TEXT,
  originalName TEXT,
  hash TEXT,
  thumbnail TEXT,
  virtualName TEXT,
  virtualTags TEXT[],
  virtualAlbum TEXT,
  virtual_description TEXT,
  nsfwScore DOUBLE PRECISION,
  isFlagged BOOLEAN,
  caption TEXT,
  visionSummary TEXT,
  vision_sorted BOOLEAN,
  metadata JSONB,
  embedding vector(384),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  sortOrder INTEGER,
  similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vi.id,
    vi.user_id,
    vi.originalpath,
    vi.originalname,
    vi.hash,
    vi.thumbnail,
    vi.virtualname,
    vi.virtualtags,
    vi.virtualalbum,
    vi.virtual_description,
    vi.nsfwscore,
    vi.isflagged,
    vi.caption,
    vi.visionsummary,
    vi.vision_sorted,
    vi.metadata,
    vi.embedding,
    vi.created_at,
    vi.updated_at,
    vi.sortorder,
    (1 - (vi.embedding <-> query_embedding)) AS similarity
  FROM virtual_image vi
  WHERE 
    vi.user_id = p_user_id
    AND vi.embedding IS NOT NULL
    AND (1 - (vi.embedding <-> query_embedding)) >= similarity_threshold
  ORDER BY vi.embedding <-> query_embedding
  LIMIT max_results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION vector_similarity_search(vector(384), UUID, DOUBLE PRECISION, INTEGER) TO authenticated;