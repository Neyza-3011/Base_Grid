-- Persist user profile avatars as validated, bounded PNG/JPEG data URLs.
-- Application validation checks MIME, byte signature, dimensions and decodability.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "avatarDataUrl" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_avatar_data_url_length_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_avatar_data_url_length_check
      CHECK ("avatarDataUrl" IS NULL OR length("avatarDataUrl") <= 350000);
  END IF;
END $$;
