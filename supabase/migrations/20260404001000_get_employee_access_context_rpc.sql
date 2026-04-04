-- ============================================================
-- RPC: get_employee_access_context
-- Consolida validaciones base del portal empleado en 1 round-trip
-- (membership activo + role + branch) para reducir latencia
-- en layout/pages del portal.
-- ============================================================

CREATE OR REPLACE FUNCTION get_employee_access_context(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS TABLE (
  has_membership BOOLEAN,
  role_code TEXT,
  branch_id UUID,
  membership_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (m.id IS NOT NULL) AS has_membership,
    COALESCE(r.code, '') AS role_code,
    m.branch_id AS branch_id,
    m.id AS membership_id
  FROM organizations o
  LEFT JOIN memberships m
    ON m.organization_id = o.id
   AND m.user_id = p_user_id
   AND m.status = 'active'
  LEFT JOIN roles r
    ON r.id = m.role_id
  WHERE o.id = p_organization_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_employee_access_context(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_employee_access_context(UUID, UUID) TO authenticated;
