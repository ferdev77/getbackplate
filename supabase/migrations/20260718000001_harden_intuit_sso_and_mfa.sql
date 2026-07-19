REVOKE ALL ON FUNCTION public.consume_external_auth_attempt(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_external_auth_attempt(TEXT, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.provision_intuit_sso_organization(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_intuit_sso_organization(UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.verify_email_mfa_challenge(
  p_user_id UUID,
  p_organization_id UUID,
  p_code_hash TEXT
)
RETURNS TABLE(result TEXT, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.company_mfa_challenges%ROWTYPE;
  v_attempts INTEGER;
BEGIN
  SELECT *
  INTO v_challenge
  FROM public.company_mfa_challenges
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing'::TEXT, 0;
    RETURN;
  END IF;

  IF v_challenge.expires_at < now() THEN
    RETURN QUERY SELECT 'expired'::TEXT, v_challenge.attempts;
    RETURN;
  END IF;

  IF v_challenge.attempts >= 5 THEN
    RETURN QUERY SELECT 'max_attempts'::TEXT, v_challenge.attempts;
    RETURN;
  END IF;

  IF v_challenge.code_hash <> p_code_hash THEN
    UPDATE public.company_mfa_challenges
    SET attempts = company_mfa_challenges.attempts + 1
    WHERE id = v_challenge.id
    RETURNING company_mfa_challenges.attempts INTO v_attempts;

    RETURN QUERY SELECT 'incorrect'::TEXT, v_attempts;
    RETURN;
  END IF;

  UPDATE public.company_mfa_challenges
  SET consumed_at = now()
  WHERE id = v_challenge.id;

  RETURN QUERY SELECT 'verified'::TEXT, v_challenge.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_email_mfa_challenge(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_email_mfa_challenge(UUID, UUID, TEXT)
  TO service_role;
