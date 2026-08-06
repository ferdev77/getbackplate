ALTER TABLE public.organization_google_oauth_identities
  ADD COLUMN IF NOT EXISTS credential_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE public.organization_google_oauth_identities
    ADD CONSTRAINT organization_google_oauth_identities_credential_version_check
    CHECK (credential_version > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
