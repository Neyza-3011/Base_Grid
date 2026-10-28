-- P0-ROLE: separate trusted platform authority from tenant-scoped role.
-- Safe for existing installations: existing superadmin accounts are explicitly backfilled.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "platformRole" VARCHAR(32);

-- Revoke any legacy CEO flag from identities other than the explicitly trusted CEO email.
UPDATE users
SET "platformRole" = NULL
WHERE "platformRole" = 'ceo'
  AND lower(btrim(email)) <> 'jack.cardinali15@gmail.com';

-- Backfill only the trusted master identity when both ID and email match.
UPDATE users
SET "platformRole" = 'ceo'
WHERE id = 'usr-superadmin-001'
  AND lower(btrim(email)) = 'jack.cardinali15@gmail.com'
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
