-- ==============================================================================
-- Migration 008: Reports Intervention Company Check (P1.6 Referential Integrity)
-- Enforces that a report linked to an intervention MUST have a non-null companyId.
-- Prevents PostgreSQL MATCH SIMPLE composite FK bypass where interventionId is set
-- but companyId is NULL.
-- Compatible with all PostgreSQL versions.
-- Idempotent & non-destructive: Safe for fresh DBs and existing production DBs.
-- ==============================================================================

-- 1. Add CHECK constraint ensuring reports linked to an intervention have companyId NOT NULL.
--    - If interventionId is NULL: ("interventionId" IS NULL) is TRUE, preserving full
--      backward compatibility for legacy reports that lack intervention linkage.
--    - If interventionId is NOT NULL: ("interventionId" IS NULL) is FALSE, strictly requiring
--      ("companyId" IS NOT NULL) to be TRUE, preventing MATCH SIMPLE composite FK bypass.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'chk_reports_intervention_company_not_null'
      AND t.relname = 'reports'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT chk_reports_intervention_company_not_null
      CHECK ("interventionId" IS NULL OR "companyId" IS NOT NULL);
  END IF;
END $$;
