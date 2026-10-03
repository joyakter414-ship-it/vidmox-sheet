-- VidMox Sheet - D1 schema
-- Users: one table for admin / project managers (pm) / clients.
-- Passwords are stored as PBKDF2-SHA256 hashes (never plain text).
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role        TEXT    NOT NULL CHECK (role IN ('admin', 'pm', 'client')),
  name        TEXT    NOT NULL DEFAULT '',
  email       TEXT    UNIQUE COLLATE NOCASE,
  phone       TEXT    UNIQUE,
  pass_hash   TEXT    NOT NULL,
  pass_salt   TEXT    NOT NULL,
  pm_id       INTEGER REFERENCES users(id) ON DELETE SET NULL, -- clients only: owning PM
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_pm   ON users(pm_id);

-- Login sessions (token stored as SHA-256 hash).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
