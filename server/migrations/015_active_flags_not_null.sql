-- ==============================================================================
-- Migration 015: Enforce non-null active flags for users, customers and locations
-- Preserve the application's existing effective behavior: NULL is mapped to
-- inactive by the PostgreSQL adapter, so legacy NULL values are normalized to false.
-- ==============================================================================
UPDATE users SET "isActive" = false WHERE "isActive" IS NULL;
UPDATE customers SET "isActive" = false WHERE "isActive" IS NULL;
UPDATE locations SET "isActive" = false WHERE "isActive" IS NULL;

ALTER TABLE users ALTER COLUMN "isActive" SET DEFAULT true;
ALTER TABLE users ALTER COLUMN "isActive" SET NOT NULL;

ALTER TABLE customers ALTER COLUMN "isActive" SET DEFAULT true;
ALTER TABLE customers ALTER COLUMN "isActive" SET NOT NULL;

ALTER TABLE locations ALTER COLUMN "isActive" SET DEFAULT true;
ALTER TABLE locations ALTER COLUMN "isActive" SET NOT NULL;
