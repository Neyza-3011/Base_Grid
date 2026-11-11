-- Migration 017: persist the minimum operational company profile.
-- P0-ACCOUNT-SETUP: additive defaults keep existing tenants readable; incomplete profiles remain gated until completed.
-- Additive defaults keep existing tenants readable; incomplete profiles remain gated until completed.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "contactEmail" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "contactPhone" VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "serviceArea" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "serviceCategories" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS locale VARCHAR(20) NOT NULL DEFAULT 'it-IT',
  ADD COLUMN IF NOT EXISTS "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Rome';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'companies'::regclass
      AND conname = 'companies_service_categories_array'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_service_categories_array
      CHECK (jsonb_typeof("serviceCategories") = 'array');
  END IF;
END $$;
