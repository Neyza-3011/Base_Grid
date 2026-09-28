-- ==============================================================================
-- Migration 005: Interventions (P1.4)
-- Operational intervention management: Customer -> Location -> Asset -> Intervention -> Technician
-- ==============================================================================

CREATE TABLE IF NOT EXISTS interventions (
  id VARCHAR(255) PRIMARY KEY,
  "companyId" VARCHAR(255) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "customerId" VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  "locationId" VARCHAR(255) NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  "assetId" VARCHAR(255) REFERENCES assets(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  problem TEXT,
  priority VARCHAR(50) NOT NULL DEFAULT 'media',
  status VARCHAR(50) NOT NULL DEFAULT 'nuovo',
  "scheduledStart" TIMESTAMP WITH TIME ZONE,
  "scheduledEnd" TIMESTAMP WITH TIME ZONE,
  "technicianId" VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  "estimatedHours" NUMERIC(6, 2),
  "actualHours" NUMERIC(6, 2),
  notes TEXT,
  "createdBy" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "updatedBy" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for performance and tenant isolation
CREATE INDEX IF NOT EXISTS idx_interventions_company_id ON interventions("companyId");
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);
CREATE INDEX IF NOT EXISTS idx_interventions_technician_id ON interventions("technicianId");
CREATE INDEX IF NOT EXISTS idx_interventions_customer_id ON interventions("customerId");
CREATE INDEX IF NOT EXISTS idx_interventions_location_id ON interventions("locationId");
CREATE INDEX IF NOT EXISTS idx_interventions_scheduled_start ON interventions("scheduledStart");
