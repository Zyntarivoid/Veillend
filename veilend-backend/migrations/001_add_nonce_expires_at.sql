-- Add nonce_expires_at column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nonce_expires_at TIMESTAMP WITH TIME ZONE;
