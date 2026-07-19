CREATE OR REPLACE FUNCTION public.provision_intuit_sso_organization(
  p_user_id UUID,
  p_company_name TEXT,
  p_slug_base TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id UUID;
  v_role_id UUID;
  v_slug TEXT;
  v_attempt INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'user_already_has_organization';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE code = 'company_admin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'company_admin_role_missing';
  END IF;

  FOR v_attempt IN 0..4 LOOP
    v_slug := CASE
      WHEN v_attempt = 0 THEN p_slug_base
      ELSE p_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
    END;
    BEGIN
      INSERT INTO public.organizations (
        name,
        slug,
        created_by,
        billing_onboarding_required,
        billing_activation_status
      ) VALUES (
        p_company_name,
        v_slug,
        p_user_id,
        true,
        'pending'
      ) RETURNING id INTO v_organization_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_organization_id := NULL;
    END;
  END LOOP;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_slug_unavailable';
  END IF;

  INSERT INTO public.organization_modules (organization_id, module_id, is_enabled, enabled_at)
  SELECT v_organization_id, id, true, now()
  FROM public.module_catalog
  WHERE is_core = true
  ON CONFLICT (organization_id, module_id) DO NOTHING;

  INSERT INTO public.memberships (organization_id, user_id, role_id, status)
  VALUES (v_organization_id, p_user_id, v_role_id, 'active');

  RETURN v_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_intuit_sso_organization(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_intuit_sso_organization(UUID, TEXT, TEXT) TO service_role;
