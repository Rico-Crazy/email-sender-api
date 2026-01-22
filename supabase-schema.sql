-- Supabase SQL Schema for Email History
-- Run this in the Supabase SQL Editor (https://app.supabase.com)

-- Create the email_history table
CREATE TABLE IF NOT EXISTS email_history (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_count INTEGER NOT NULL DEFAULT 1,
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_history_email ON email_history(email);

-- Create index on sent_count for filtering duplicates
CREATE INDEX IF NOT EXISTS idx_email_history_sent_count ON email_history(sent_count);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE email_history ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (since we're using service role key)
CREATE POLICY "Allow all operations" ON email_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON email_history TO authenticated;
GRANT ALL ON email_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE email_history_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE email_history_id_seq TO service_role;
