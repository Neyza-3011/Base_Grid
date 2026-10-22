-- ==============================================================================
-- Migration 009: Reports Materials Verification Status (P1.7 Hardening)
-- Adds explicit "materialsStatus" to reports: 'used' | 'none' | 'unverified'
-- Safe, idempotent & non-destructive for existing production and fresh DBs.
-- Historical records have NULL "materialsStatus", treated as unverified.
-- ==============================================================================

-- 1. Add nullable "materialsStatus" column to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "materialsStatus" VARCHAR(50);

-- 2. Create index for query performance on materialsStatus
CREATE INDEX IF NOT EXISTS idx_reports_materials_status ON reports("materialsStatus");

-- 3. Add CHECK constraint enforcing valid materials status values when present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'chk_reports_materials_status'
      AND t.relname = 'reports'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT chk_reports_materials_status
      CHECK ("materialsStatus" IS NULL OR "materialsStatus" IN ('used', 'none', 'unverified'));
  END IF;
END $$;
