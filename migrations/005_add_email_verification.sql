ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users (email_verification_token)
  WHERE email_verification_token IS NOT NULL;
