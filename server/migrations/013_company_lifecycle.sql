-- P0-CEO-CONSOLE: reversible tenant suspension state.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_companies_is_active
  ON companies ("isActive");
