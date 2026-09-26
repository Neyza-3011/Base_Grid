-- ==============================================================================
-- Migration 001: Initial Canonical Schema
-- Bounded contexts: Companies (Tenants), Users, Reports, Auth Tokens
-- Idempotent & non-destructive: Safe for fresh DBs and existing production DBs
-- ==============================================================================

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  "vatNumber" VARCHAR(255),
  address TEXT,
  "defaultHourlyRate" NUMERIC,
  "reportFooterNotes" TEXT,
  "stripeSubscriptionStatus" VARCHAR(255),
  "maxUsers" INTEGER,
  "featurePdfExport" BOOLEAN,
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "updatedAt" TIMESTAMP WITH TIME ZONE
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  "fullName" VARCHAR(255) NOT NULL,
  role VARCHAR(50),
  "companyId" VARCHAR(255) REFERENCES companies(id) ON DELETE CASCADE,
  "companyName" VARCHAR(255),
  "passwordHash" TEXT,
  salt TEXT,
  "isActive" BOOLEAN DEFAULT true,
  provider VARCHAR(50),
  "emailConfirmed" BOOLEAN DEFAULT false,
  "phoneNumber" VARCHAR(255),
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "authVersion" INTEGER NOT NULL DEFAULT 0
);

-- 3. Reports Table
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) REFERENCES companies(id) ON DELETE CASCADE,
  date VARCHAR(255),
  time VARCHAR(255),
  "workHours" NUMERIC DEFAULT 0,
  "travelHours" NUMERIC DEFAULT 0,
  status VARCHAR(50) DEFAULT 'submitted',
  client JSONB,
  technician JSONB,
  "materialsUsed" JSONB,
  notes TEXT,
  "signatureBase64" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE
);

-- 4. Auth Tokens Table
CREATE TABLE IF NOT EXISTS auth_tokens (
  id VARCHAR(255) PRIMARY KEY,
  "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL,
  consumed BOOLEAN DEFAULT false,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "consumedAt" TIMESTAMP WITH TIME ZONE
);

-- Safe non-destructive column additions for existing databases
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "vatNumber" VARCHAR(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "defaultHourlyRate" NUMERIC;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "reportFooterNotes" TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" VARCHAR(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "maxUsers" INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "featurePdfExport" BOOLEAN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "companyId" VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "companyName" VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailConfirmed" BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS "companyId" VARCHAR(255);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS date VARCHAR(255);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS time VARCHAR(255);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "workHours" NUMERIC DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "travelHours" NUMERIC DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'submitted';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS client JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS technician JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "materialsUsed" JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "signatureBase64" TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "userId" VARCHAR(255);
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "tokenHash" VARCHAR(255);
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS consumed BOOLEAN DEFAULT false;
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP WITH TIME ZONE;

-- Safe non-destructive foreign keys and unique constraints for existing databases
DO $$
DECLARE
  v_deltype TEXT;
BEGIN
  -- 1. users("companyId") -> companies(id) ON DELETE CASCADE
  SELECT c.confdeltype::text INTO v_deltype
  FROM pg_constraint c
  JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attname = 'companyId'
  JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attname = 'id'
  WHERE c.conrelid = 'users'::regclass 
    AND c.confrelid = 'companies'::regclass
    AND c.contype = 'f'
    AND c.conkey = ARRAY[a1.attnum]
    AND c.confkey = ARRAY[a2.attnum]
  LIMIT 1;

  IF v_deltype IS NULL THEN
    ALTER TABLE users 
      ADD CONSTRAINT fk_users_company 
      FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
  ELSIF v_deltype <> 'c' THEN
    RAISE EXCEPTION 'Foreign key on users("companyId") -> companies(id) exists with non-CASCADE delete action (%). Manual migration required.', v_deltype;
  END IF;

  -- 2. reports("companyId") -> companies(id) ON DELETE CASCADE
  v_deltype := NULL;
  SELECT c.confdeltype::text INTO v_deltype
  FROM pg_constraint c
  JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attname = 'companyId'
  JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attname = 'id'
  WHERE c.conrelid = 'reports'::regclass 
    AND c.confrelid = 'companies'::regclass
    AND c.contype = 'f'
    AND c.conkey = ARRAY[a1.attnum]
    AND c.confkey = ARRAY[a2.attnum]
  LIMIT 1;

  IF v_deltype IS NULL THEN
    ALTER TABLE reports 
      ADD CONSTRAINT fk_reports_company 
      FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
  ELSIF v_deltype <> 'c' THEN
    RAISE EXCEPTION 'Foreign key on reports("companyId") -> companies(id) exists with non-CASCADE delete action (%). Manual migration required.', v_deltype;
  END IF;

  -- 3. auth_tokens("userId") -> users(id) ON DELETE CASCADE
  v_deltype := NULL;
  SELECT c.confdeltype::text INTO v_deltype
  FROM pg_constraint c
  JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attname = 'userId'
  JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attname = 'id'
  WHERE c.conrelid = 'auth_tokens'::regclass 
    AND c.confrelid = 'users'::regclass
    AND c.contype = 'f'
    AND c.conkey = ARRAY[a1.attnum]
    AND c.confkey = ARRAY[a2.attnum]
  LIMIT 1;

  IF v_deltype IS NULL THEN
    ALTER TABLE auth_tokens 
      ADD CONSTRAINT fk_auth_tokens_user 
      FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  ELSIF v_deltype <> 'c' THEN
    RAISE EXCEPTION 'Foreign key on auth_tokens("userId") -> users(id) exists with non-CASCADE delete action (%). Manual migration required.', v_deltype;
  END IF;

  -- 4. UNIQUE users(email)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'email'
    WHERE c.conrelid = 'users'::regclass 
      AND c.contype = 'u' 
      AND c.conkey = ARRAY[a.attnum]
  ) THEN
    ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
  END IF;

  -- 5. UNIQUE auth_tokens("tokenHash")
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'tokenHash'
    WHERE c.conrelid = 'auth_tokens'::regclass 
      AND c.contype = 'u' 
      AND c.conkey = ARRAY[a.attnum]
  ) THEN
    ALTER TABLE auth_tokens ADD CONSTRAINT uq_auth_tokens_token_hash UNIQUE ("tokenHash");
  END IF;
END $$;

-- Indices (users.email and auth_tokens.tokenHash already indexed via UNIQUE)
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users("companyId");
CREATE INDEX IF NOT EXISTS idx_reports_company_id ON reports("companyId");
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens("userId", type);
