-- Company branding metadata used by generated PDFs.
-- The application validates PNG/JPEG signatures, dimensions, and payload size before persistence.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "logoDataUrl" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_logo_data_url_length_check'
      AND conrelid = 'companies'::regclass
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_logo_data_url_length_check
      CHECK ("logoDataUrl" IS NULL OR length("logoDataUrl") <= 350000);
  END IF;
END $$;
