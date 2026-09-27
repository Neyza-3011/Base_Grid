-- ==============================================================================
-- Migration 002: Team & Onboarding
-- Extends user roles for full product role set.
-- Adds invite_tokens table for secure team member invitations.
-- Idempotent & non-destructive.
-- ==============================================================================

-- 1. Extend user roles
-- Drop existing CHECK constraint on role if it exists, then add updated one.
-- The existing schema uses VARCHAR(50) with no CHECK, so we add one now.
DO $$
BEGIN
  -- Drop any existing role check constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND conname = 'chk_users_role'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT chk_users_role;
  END IF;

  -- Add role CHECK constraint with full product role set
  ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (
    role IN (
      'superadmin',
      'owner',
      'admin',
      'responsabile_tecnico',
      'dispatcher',
      'technician',
      'amministrazione',
      'commerciale',
      'cliente'
    )
  );
END $$;

-- 2. Invite Tokens table for secure team member invitations
CREATE TABLE IF NOT EXISTS invite_tokens (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "invitedEmail" VARCHAR(255) NOT NULL,
  "tokenHash" VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  "fullName" VARCHAR(255) NOT NULL,
  "phoneNumber" VARCHAR(255),
  "invitedBy" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consumed BOOLEAN DEFAULT false,
  revoked BOOLEAN DEFAULT false,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "consumedAt" TIMESTAMP WITH TIME ZONE
);

-- Safe non-destructive column additions for existing invite_tokens
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "companyId" VARCHAR(255);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "invitedEmail" VARCHAR(255);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "tokenHash" VARCHAR(255);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(255);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "invitedBy" VARCHAR(255);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS consumed BOOLEAN DEFAULT false;
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT false;
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP WITH TIME ZONE;

-- 3. Indices for invite_tokens
CREATE INDEX IF NOT EXISTS idx_invite_tokens_company_id ON invite_tokens("companyId");
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON invite_tokens("invitedEmail");
-- tokenHash already indexed via UNIQUE constraint

-- 4. Safe non-destructive FK for invite_tokens
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- invite_tokens("companyId") -> companies(id)
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'invite_tokens'::regclass
      AND c.confrelid = 'companies'::regclass
      AND c.contype = 'f'
  ) INTO v_exists;

  IF NOT v_exists THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT fk_invite_tokens_company
      FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- invite_tokens("invitedBy") -> users(id)
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'invite_tokens'::regclass
      AND c.confrelid = 'users'::regclass
      AND c.contype = 'f'
  ) INTO v_exists;

  IF NOT v_exists THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT fk_invite_tokens_inviter
      FOREIGN KEY ("invitedBy") REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
