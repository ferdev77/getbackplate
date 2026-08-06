CREATE TABLE IF NOT EXISTS public.organization_google_oauth_configs (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT NOT NULL,
  client_secret_iv TEXT NOT NULL,
  client_secret_tag TEXT NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  tested_version INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'failed', 'disabled')),
  tested_at TIMESTAMPTZ,
  tested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_failure_code TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_google_oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_at_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, issuer, subject),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_google_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credential_version INTEGER NOT NULL CHECK (credential_version > 0),
  mode TEXT NOT NULL CHECK (mode IN ('login', 'test')),
  state_hash TEXT NOT NULL UNIQUE,
  browser_hash TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  target_host TEXT,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_track TEXT NOT NULL DEFAULT 'platform' CHECK (billing_track IN ('platform', 'integration')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'processing', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_google_oauth_attempts_expires_idx
  ON public.organization_google_oauth_attempts (expires_at);

ALTER TABLE public.organization_google_oauth_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_google_oauth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_google_oauth_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organization_google_oauth_configs FROM anon, authenticated;
REVOKE ALL ON public.organization_google_oauth_identities FROM anon, authenticated;
REVOKE ALL ON public.organization_google_oauth_attempts FROM anon, authenticated;
GRANT ALL ON public.organization_google_oauth_configs TO service_role;
GRANT ALL ON public.organization_google_oauth_identities TO service_role;
GRANT ALL ON public.organization_google_oauth_attempts TO service_role;

DROP POLICY IF EXISTS organization_google_oauth_configs_service_role ON public.organization_google_oauth_configs;
CREATE POLICY organization_google_oauth_configs_service_role
  ON public.organization_google_oauth_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS organization_google_oauth_identities_service_role ON public.organization_google_oauth_identities;
CREATE POLICY organization_google_oauth_identities_service_role
  ON public.organization_google_oauth_identities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS organization_google_oauth_attempts_service_role ON public.organization_google_oauth_attempts;
CREATE POLICY organization_google_oauth_attempts_service_role
  ON public.organization_google_oauth_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_organization_google_oauth_attempt(
  p_state_hash TEXT,
  p_browser_hash TEXT
)
RETURNS SETOF public.organization_google_oauth_attempts
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.organization_google_oauth_attempts
  SET status = 'processing', consumed_at = now(), updated_at = now()
  WHERE state_hash = p_state_hash
    AND browser_hash = p_browser_hash
    AND status = 'started'
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.consume_organization_google_oauth_attempt(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_organization_google_oauth_attempt(TEXT, TEXT)
  TO service_role;
