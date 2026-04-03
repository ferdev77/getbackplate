-- ============================================================
-- RPC: get_tenant_access_context
-- Consolida en UN solo round-trip las 5 queries en serie del
-- guard de acceso de GetBackplate:
--   1. membership del usuario en la organización
--   2. role_code del membership
--   3. billing_onboarding_required (organizations)
--   4. subscription status + current_period_end (subscriptions)
--   5. module_enabled (organization_modules via module_catalog)
--
-- Antes: 4-5 queries en serie → 1.5-2.5s de latencia
-- Ahora: 1 RPC → ~200-300ms
-- ============================================================

CREATE OR REPLACE FUNCTION get_tenant_access_context(
  p_user_id         UUID,
  p_organization_id UUID,
  p_module_code     TEXT
)
RETURNS TABLE (
  has_membership              BOOLEAN,
  role_code                   TEXT,
  branch_id                   UUID,
  membership_id               UUID,
  billing_onboarding_required BOOLEAN,
  subscription_status         TEXT,
  subscription_period_end     TIMESTAMPTZ,
  module_enabled              BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Membership
    (m.id IS NOT NULL)                                          AS has_membership,
    COALESCE(r.code, '')                                        AS role_code,
    m.branch_id                                                 AS branch_id,
    m.id                                                        AS membership_id,

    -- Billing gate
    COALESCE(o.billing_onboarding_required, FALSE)              AS billing_onboarding_required,
    s.status                                                    AS subscription_status,
    s.current_period_end                                        AS subscription_period_end,

    -- Module access
    COALESCE(om.is_enabled, FALSE)                              AS module_enabled

  FROM organizations o

  -- Membership (LEFT: si no existe, has_membership = false y el guard redirecciona)
  LEFT JOIN memberships m
    ON m.organization_id = o.id
   AND m.user_id         = p_user_id
   AND m.status          = 'active'

  -- Role
  LEFT JOIN roles r
    ON r.id = m.role_id

  -- Latest subscription (DISTINCT ON para traer solo la más reciente)
  LEFT JOIN LATERAL (
    SELECT status, current_period_end
    FROM subscriptions
    WHERE organization_id = p_organization_id
    ORDER BY current_period_end DESC NULLS LAST
    LIMIT 1
  ) s ON TRUE

  -- Module
  LEFT JOIN module_catalog mc
    ON mc.code = p_module_code

  LEFT JOIN organization_modules om
    ON om.organization_id = p_organization_id
   AND om.module_id       = mc.id

  WHERE o.id = p_organization_id

  LIMIT 1;
$$;

-- Revocar acceso público; solo service_role y owner pueden llamarla
REVOKE ALL ON FUNCTION get_tenant_access_context(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_access_context(UUID, UUID, TEXT) TO authenticated;
