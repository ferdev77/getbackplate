CREATE TABLE IF NOT EXISTS public.external_auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('intuit')),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_at_link TEXT,
  email_verified_at TIMESTAMPTZ,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (provider, issuer, subject),
  UNIQUE (provider, user_id)
);

CREATE TABLE IF NOT EXISTS public.external_auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('intuit')),
  mode TEXT NOT NULL CHECK (mode IN ('login', 'link')),
  state_hash TEXT NOT NULL UNIQUE,
  browser_hash TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/app/dashboard',
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'processing', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_auth_attempts_expires_idx
  ON public.external_auth_attempts (expires_at);

ALTER TABLE public.external_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_auth_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.external_auth_identities FROM anon, authenticated;
REVOKE ALL ON public.external_auth_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_external_auth_attempt(
  p_provider TEXT,
  p_state_hash TEXT,
  p_browser_hash TEXT
)
RETURNS SETOF public.external_auth_attempts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.external_auth_attempts
  SET status = 'processing', consumed_at = now(), updated_at = now()
  WHERE provider = p_provider
    AND state_hash = p_state_hash
    AND browser_hash = p_browser_hash
    AND status = 'started'
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.consume_external_auth_attempt(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_external_auth_attempt(TEXT, TEXT, TEXT) TO service_role;
