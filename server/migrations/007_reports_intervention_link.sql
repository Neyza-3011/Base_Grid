-- ==============================================================================
-- Migration 007: Link Reports to Interventions (P1.6)
-- Adds nullable "interventionId" to reports with composite tenant isolation FK
-- Compatible with all PostgreSQL versions (uses ON DELETE RESTRICT)
-- Idempotent & non-destructive: Safe for fresh DBs and existing production DBs
-- ==============================================================================

-- 1. Ensure composite unique constraint on interventions (id, "companyId")
--    Required target for the composite foreign key from reports.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_interventions_id_company'
  ) THEN
    ALTER TABLE interventions ADD CONSTRAINT uq_interventions_id_company UNIQUE (id, "companyId");
  END IF;
END $$;

-- 2. Add nullable "interventionId" column to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "interventionId" VARCHAR(255);

-- 3. Create index for query performance on interventionId
CREATE INDEX IF NOT EXISTS idx_reports_intervention_id ON reports("interventionId");

-- 4. Add composite Foreign Key enforcing strict multi-tenant relational integrity
--    A report with an interventionId can ONLY reference an intervention belonging to the same company.
--    Uses ON DELETE RESTRICT: Prevents accidental deletion of interventions with associated reports,
--    guaranteeing zero orphaned records while remaining 100% compatible with all PostgreSQL versions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_reports_intervention_tenant_consistency'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT fk_reports_intervention_tenant_consistency
      FOREIGN KEY ("interventionId", "companyId")
      REFERENCES interventions (id, "companyId") ON DELETE RESTRICT;
  END IF;
END $$;
