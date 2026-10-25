-- ==============================================================================
-- Migration 010: Enforce tenant consistency for report customer and location links
-- Additive and fail-closed: reject existing inconsistent rows before adding FKs.
-- Requires PostgreSQL 15+, consistent with migration 006's column-list SET NULL.
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM reports r
    WHERE r."customerId" IS NOT NULL
      AND (
        r."companyId" IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = r."customerId" AND c."companyId" = r."companyId"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Migration 010 blocked: reports contain customerId/companyId tenant mismatches. Resolve these rows before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reports r
    WHERE r."locationId" IS NOT NULL
      AND (
        r."customerId" IS NULL
        OR r."companyId" IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM locations l
          WHERE l.id = r."locationId"
            AND l."customerId" = r."customerId"
            AND l."companyId" = r."companyId"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Migration 010 blocked: reports contain locationId/customerId/companyId mismatches. Resolve these rows before retrying.';
  END IF;
END $$;

-- Composite targets are established by migrations 003 and 004.
-- Keep legacy nullable links nullable, but prevent MATCH SIMPLE from bypassing
-- tenant checks when a customer or location reference is present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'reports'::regclass
      AND c.conname = 'chk_reports_customer_requires_company'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT chk_reports_customer_requires_company
      CHECK ("customerId" IS NULL OR "companyId" IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'reports'::regclass
      AND c.conname = 'chk_reports_location_requires_customer_company'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT chk_reports_location_requires_customer_company
      CHECK ("locationId" IS NULL OR ("customerId" IS NOT NULL AND "companyId" IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'reports'::regclass
      AND c.conname = 'fk_reports_customer_tenant_consistency'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT fk_reports_customer_tenant_consistency
      FOREIGN KEY ("customerId", "companyId")
      REFERENCES customers (id, "companyId")
      ON DELETE SET NULL ("customerId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'reports'::regclass
      AND c.conname = 'fk_reports_location_customer_tenant_consistency'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT fk_reports_location_customer_tenant_consistency
      FOREIGN KEY ("locationId", "customerId", "companyId")
      REFERENCES locations (id, "customerId", "companyId")
      ON DELETE SET NULL ("locationId");
  END IF;
END $$;
