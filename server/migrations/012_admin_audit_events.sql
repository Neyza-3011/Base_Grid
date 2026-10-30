-- P0-CEO-CONSOLE: durable, append-only platform administration audit trail.
-- Metadata must be an object and must not contain credentials, tokens, or personal secrets.
CREATE TABLE IF NOT EXISTS admin_audit_events (
  id VARCHAR(255) PRIMARY KEY,
  "actorUserId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(100) NOT NULL,
  "targetType" VARCHAR(50) NOT NULL CHECK ("targetType" IN ('company', 'user', 'platform')),
  "targetId" VARCHAR(255) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created_at
  ON admin_audit_events ("createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_target
  ON admin_audit_events ("targetType", "targetId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor
  ON admin_audit_events ("actorUserId", "createdAt" DESC);
