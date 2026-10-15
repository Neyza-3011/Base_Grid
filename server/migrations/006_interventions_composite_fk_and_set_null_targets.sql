-- ==============================================================================
-- Migration 006: Strengthen interventions FK constraints
-- Replaces simple inline FKs from migration 005 with composite, tenant-isolated
-- foreign keys. Uses ON DELETE SET NULL (<column>) syntax (PostgreSQL >= 15).
-- ==============================================================================

-- 1. Ensure composite unique constraints on referenced tables
--    (idempotent: no-op if already created by earlier migrations)
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

-- 2. Drop old simple inline FKs created by migration 005 (CREATE TABLE ... REFERENCES)
--    PostgreSQL auto-generates constraint names as <table>_<column>_fkey for inline references.
--    Each DROP is guarded by IF EXISTS to be idempotent.

-- 2a. Drop simple FK: interventions."customerId" -> customers(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_customerId_fkey'
  ) THEN
    ALTER TABLE interventions DROP CONSTRAINT "interventions_customerId_fkey";
  END IF;
END $$;

-- 2b. Drop simple FK: interventions."locationId" -> locations(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_locationId_fkey'
  ) THEN
    ALTER TABLE interventions DROP CONSTRAINT "interventions_locationId_fkey";
  END IF;
END $$;

-- 2c. Drop simple FK: interventions."assetId" -> assets(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_assetId_fkey'
  ) THEN
    ALTER TABLE interventions DROP CONSTRAINT "interventions_assetId_fkey";
  END IF;
END $$;

-- 2d. Drop simple FK: interventions."technicianId" -> users(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_technicianId_fkey'
  ) THEN
    ALTER TABLE interventions DROP CONSTRAINT "interventions_technicianId_fkey";
  END IF;
END $$;

-- 2e. Drop simple FK: interventions."createdBy" -> users(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_createdBy_fkey'
  ) THEN
    ALTER TABLE interventions DROP CONSTRAINT "interventions_createdBy_fkey";
  END IF;
END $$;

-- 2f. Drop simple FK: interventions."updatedBy" -> users(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_updatedBy_fkey'
  ) THEN
    ALTER TABLE interventions DROP CONSTRAINT "interventions_updatedBy_fkey";
  END IF;
END $$;

-- 3. Add composite Foreign Keys enforcing strict multi-tenant relational integrity

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
--     ON DELETE SET NULL ("assetId") — only nullifies assetId, preserving customerId/locationId/companyId
--     Requires PostgreSQL >= 15
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
--     ON DELETE SET NULL ("technicianId") — only nullifies technicianId, preserving companyId
--     Requires PostgreSQL >= 15
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

-- 3e. Creator belongs to the same Tenant
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

-- 3f. Updater belongs to the same Tenant
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

-- 4. Additional indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_interventions_asset_id ON interventions("assetId");
CREATE INDEX IF NOT EXISTS idx_interventions_pagination ON interventions("createdAt" DESC, id DESC);
