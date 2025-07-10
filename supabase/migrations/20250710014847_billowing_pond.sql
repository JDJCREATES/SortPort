/*
  # Credit System Implementation

  1. New Tables
    - `user_credits`
      - `user_id` (uuid, foreign key to auth.users)
      - `balance` (integer, default 0)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `credit_transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `type` (text, e.g., 'purchase', 'ai_sort', 'nsfw_process', 'query')
      - `amount` (integer, positive for additions, negative for deductions)
      - `description` (text)
      - `metadata` (jsonb, for additional data)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for users to access their own data
    - Add policies for service role to manage credits

  3. Functions
    - Function to safely deduct credits with atomic operations
    - Function to add credits from purchases
    - Function to get user credit balance
*/

-- Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create credit_transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('purchase', 'ai_sort', 'nsfw_process', 'query', 'refund', 'bonus')),
  amount integer NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_credits
CREATE POLICY "Users can view own credits"
  ON user_credits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credits"
  ON user_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credits"
  ON user_credits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all credits"
  ON user_credits
  FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for credit_transactions
CREATE POLICY "Users can view own transactions"
  ON credit_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON credit_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all transactions"
  ON credit_transactions
  FOR ALL
  TO service_role
  USING (true);

-- Function to safely deduct credits
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
  transaction_id uuid;
BEGIN
  -- Check if user exists and get current balance
  SELECT balance INTO current_balance
  FROM user_credits
  WHERE user_id = p_user_id;
  
  -- If user doesn't exist in credits table, create with 0 balance
  IF current_balance IS NULL THEN
    INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    current_balance := 0;
  END IF;
  
  -- Check if user has sufficient credits
  IF current_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'current_balance', current_balance,
      'required', p_amount
    );
  END IF;
  
  -- Calculate new balance
  new_balance := current_balance - p_amount;
  
  -- Update user credits atomically
  UPDATE user_credits
  SET balance = new_balance,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Record transaction
  INSERT INTO credit_transactions (user_id, type, amount, description, metadata)
  VALUES (p_user_id, p_type, -p_amount, p_description, p_metadata)
  RETURNING id INTO transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', current_balance,
    'new_balance', new_balance,
    'transaction_id', transaction_id
  );
END;
$$;

-- Function to add credits
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
  transaction_id uuid;
BEGIN
  -- Get current balance or create user credits record
  SELECT balance INTO current_balance
  FROM user_credits
  WHERE user_id = p_user_id;
  
  -- If user doesn't exist in credits table, create with 0 balance
  IF current_balance IS NULL THEN
    INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    current_balance := 0;
  END IF;
  
  -- Calculate new balance
  new_balance := current_balance + p_amount;
  
  -- Update user credits
  UPDATE user_credits
  SET balance = new_balance,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Record transaction
  INSERT INTO credit_transactions (user_id, type, amount, description, metadata)
  VALUES (p_user_id, p_type, p_amount, p_description, p_metadata)
  RETURNING id INTO transaction_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', current_balance,
    'new_balance', new_balance,
    'transaction_id', transaction_id
  );
END;
$$;

-- Function to get user credit balance
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_balance integer;
BEGIN
  SELECT balance INTO user_balance
  FROM user_credits
  WHERE user_id = p_user_id;
  
  -- If user doesn't exist, create with 0 balance
  IF user_balance IS NULL THEN
    INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    user_balance := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'balance', user_balance,
    'user_id', p_user_id
  );
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);

-- Create updated_at trigger for user_credits
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();