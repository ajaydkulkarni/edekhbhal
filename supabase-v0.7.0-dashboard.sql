-- eDekhbhal v0.7.0 — Supervisor Dashboard / mobile foreground presence
-- Safe, additive migration. No existing tables are changed.

CREATE TABLE IF NOT EXISTS user_presence (
  organization_id TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  active_since_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS user_presence_org_last_seen_idx
  ON user_presence (organization_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS user_presence_user_idx
  ON user_presence (user_id);

COMMENT ON TABLE user_presence IS
  'Operational foreground presence for USER-role mobile workers. Heartbeats are telemetry and are intentionally not written to AuditLog.';
