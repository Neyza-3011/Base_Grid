-- ==============================================================================
-- Migration 004: Assets / Site Equipment
-- Adds tenant-scoped equipment installed at customer locations
-- Relational Flow: Customer -> Location -> Asset (strictly tenant-isolated)
-- ==============================================================================

-- 1. Ensure composite unique constraint on locations for foreign key reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_locations_id_customer_company'
  ) THEN
    ALTER TABLE locations ADD CONSTRAINT uq_locations_id_customer_company UNIQUE (id, "customerId", "companyId");
  END IF;
END $$;

-- 2. Create assets table
CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "customerId" VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  "locationId" VARCHAR(255) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  "assetType" VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  "serialNumber" VARCHAR(255),
  "installationDate" VARCHAR(50),
  "warrantyEndDate" VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'operativo',
  notes TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 3. Indexes for fast tenant-scoped queries & filters
CREATE INDEX IF NOT EXISTS idx_assets_company_id ON assets("companyId");
CREATE INDEX IF NOT EXISTS idx_assets_customer_id ON assets("customerId");
CREATE INDEX IF NOT EXISTS idx_assets_location_id ON assets("locationId");
CREATE INDEX IF NOT EXISTS idx_assets_asset_type ON assets("assetType");
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_is_active ON assets("isActive");

-- 4. Composite Foreign Key enforcing relational consistency:
-- An asset's (locationId, customerId, companyId) MUST match the location's (id, customerId, companyId).
-- This physically prevents assigning a location belonging to another customer or tenant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_assets_tenant_location_consistency'
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT fk_assets_tenant_location_consistency
      FOREIGN KEY ("locationId", "customerId", "companyId")
      REFERENCES locations (id, "customerId", "companyId") ON DELETE RESTRICT;
  END IF;
END $$;
