-- ==============================================================================
-- Migration 005: Interventions (P1.4)
-- Operational intervention management: Customer -> Location -> Asset -> Intervention -> Technician
-- Enforces strict relational consistency and tenant isolation at database level
-- ==============================================================================

-- 1. Ensure composite unique constraints on referenced tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_customers_id_company'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT uq_customers_id_company UNIQUE (id, "companyId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_locations_id_customer_company'
  ) THEN
    ALTER TABLE locations ADD CONSTRAINT uq_locations_id_customer_company UNIQUE (id, "customerId", "companyId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_assets_id_customer_location_company'
  ) THEN
    ALTER TABLE assets ADD CONSTRAINT uq_assets_id_customer_location_company UNIQUE (id, "customerId", "locationId", "companyId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_id_company'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT uq_users_id_company UNIQUE (id, "companyId");
  END IF;
END $$;

-- 2. Create interventions table
CREATE TABLE IF NOT EXISTS interventions (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "customerId" VARCHAR(255) NOT NULL,
  "locationId" VARCHAR(255) NOT NULL,
  "assetId" VARCHAR(255),
  description TEXT NOT NULL,
  problem TEXT,
  priority VARCHAR(50) NOT NULL DEFAULT 'media',
  status VARCHAR(50) NOT NULL DEFAULT 'nuovo',
  "scheduledStart" TIMESTAMP WITH TIME ZONE,
  "scheduledEnd" TIMESTAMP WITH TIME ZONE,
  "technicianId" VARCHAR(255),
  "estimatedHours" NUMERIC(6, 2),
  "actualHours" NUMERIC(6, 2),
  notes TEXT,
  "createdBy" VARCHAR(255) NOT NULL,
  "updatedBy" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 3. Composite Foreign Keys enforcing strict multi-tenant relational integrity:
-- 3a. Customer belongs to the same tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interventions_customer_tenant_consistency'
  ) THEN
    ALTER TABLE interventions
      ADD CONSTRAINT fk_interventions_customer_tenant_consistency
      FOREIGN KEY ("customerId", "companyId")
      REFERENCES customers (id, "companyId") ON DELETE RESTRICT;
  END IF;
END $$;

-- 3b. Location belongs to the same Customer AND the same Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interventions_location_customer_tenant_consistency'
  ) THEN
    ALTER TABLE interventions
      ADD CONSTRAINT fk_interventions_location_customer_tenant_consistency
      FOREIGN KEY ("locationId", "customerId", "companyId")
      REFERENCES locations (id, "customerId", "companyId") ON DELETE RESTRICT;
  END IF;
END $$;

-- 3c. Asset belongs to the same Customer, Location AND Tenant (nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interventions_asset_hierarchy_consistency'
  ) THEN
    ALTER TABLE interventions
      ADD CONSTRAINT fk_interventions_asset_hierarchy_consistency
      FOREIGN KEY ("assetId", "customerId", "locationId", "companyId")
      REFERENCES assets (id, "customerId", "locationId", "companyId") ON DELETE SET NULL ("assetId");
  END IF;
END $$;

-- 3d. Technician belongs to the same Tenant (nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interventions_technician_tenant_consistency'
  ) THEN
    ALTER TABLE interventions
      ADD CONSTRAINT fk_interventions_technician_tenant_consistency
      FOREIGN KEY ("technicianId", "companyId")
      REFERENCES users (id, "companyId") ON DELETE SET NULL ("technicianId");
  END IF;
END $$;

-- 3e. Creator and Updater belong to the same Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interventions_createdby_tenant_consistency'
  ) THEN
    ALTER TABLE interventions
      ADD CONSTRAINT fk_interventions_createdby_tenant_consistency
      FOREIGN KEY ("createdBy", "companyId")
      REFERENCES users (id, "companyId") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interventions_updatedby_tenant_consistency'
  ) THEN
    ALTER TABLE interventions
      ADD CONSTRAINT fk_interventions_updatedby_tenant_consistency
      FOREIGN KEY ("updatedBy", "companyId")
      REFERENCES users (id, "companyId") ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Indexes for performance, fast filters, and cursor pagination
CREATE INDEX IF NOT EXISTS idx_interventions_company_id ON interventions("companyId");
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);
CREATE INDEX IF NOT EXISTS idx_interventions_technician_id ON interventions("technicianId");
CREATE INDEX IF NOT EXISTS idx_interventions_customer_id ON interventions("customerId");
CREATE INDEX IF NOT EXISTS idx_interventions_location_id ON interventions("locationId");
CREATE INDEX IF NOT EXISTS idx_interventions_asset_id ON interventions("assetId");
CREATE INDEX IF NOT EXISTS idx_interventions_scheduled_start ON interventions("scheduledStart");
CREATE INDEX IF NOT EXISTS idx_interventions_pagination ON interventions("createdAt" DESC, id DESC);
