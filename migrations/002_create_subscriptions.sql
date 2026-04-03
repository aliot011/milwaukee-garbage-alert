CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  laddr TEXT NOT NULL,
  sdir TEXT,
  sname TEXT NOT NULL,
  stype TEXT NOT NULL,
  faddr TEXT NOT NULL,
  status TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  consent_checked BOOLEAN NOT NULL DEFAULT FALSE,
  consent_source_url TEXT NOT NULL,
  consent_submitted_at TIMESTAMP NOT NULL,
  consent_confirmed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE (user_id, laddr, sdir, sname, stype, faddr)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_verified
  ON subscriptions (status, verified);

CREATE INDEX IF NOT EXISTS idx_subscriptions_faddr
  ON subscriptions (faddr);
