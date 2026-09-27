-- ==============================================================================
-- Migration 003: Customers and Locations
-- Adds tenant-scoped customers and locations (sedi/cantieri)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "displayName" VARCHAR(255) NOT NULL,
  "legalName" VARCHAR(255),
  "vatNumber" VARCHAR(255),
  "taxCode" VARCHAR(255),
  email VARCHAR(255),
  "phoneNumber" VARCHAR(255),
  pec VARCHAR(255),
  notes TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers("companyId");

CREATE TABLE IF NOT EXISTS locations (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "customerId" VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(255) NOT NULL,
  province VARCHAR(255),
  "postalCode" VARCHAR(50),
  notes TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_company_id ON locations("companyId");
CREATE INDEX IF NOT EXISTS idx_locations_customer_id ON locations("customerId");

-- Composite FK for tenant consistency on locations
ALTER TABLE locations 
  ADD CONSTRAINT fk_locations_tenant_consistency 
  FOREIGN KEY ("customerId", "companyId") 
  REFERENCES customers (id, "companyId") ON DELETE RESTRICT;

-- We need a UNIQUE constraint on customers (id, "companyId") to support the composite FK
ALTER TABLE customers ADD CONSTRAINT uq_customers_id_company UNIQUE (id, "companyId");

-- Update reports to reference customers and locations (nullable for backward compatibility)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "customerId" VARCHAR(255) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS "locationId" VARCHAR(255) REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_customer_id ON reports("customerId");
CREATE INDEX IF NOT EXISTS idx_reports_location_id ON reports("locationId");
