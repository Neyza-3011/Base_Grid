-- P0-ROLE: separate trusted platform authority from tenant-scoped role.
-- Safe for existing installations: existing superadmin accounts are explicitly backfilled.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "platformRole" VARCHAR(32);

UPDATE users
SET "platformRole" = 'ceo'
WHERE id = 'usr-superadmin-001'
  AND role = 'superadmin'
  AND ("platformRole" IS NULL OR "platformRole" = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_platform_role_allowed'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_platform_role_allowed
      CHECK ("platformRole" IS NULL OR "platformRole" = 'ceo');
  END IF;
END $$;
