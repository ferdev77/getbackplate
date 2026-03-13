-- RPC to get company users safely without exposing all users or using Admin API listUsers.
CREATE OR REPLACE FUNCTION get_company_users(lookup_organization_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role_id uuid,
  branch_id uuid,
  status text,
  created_at timestamptz,
  email text,
  full_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    m.id,
    m.user_id,
    m.role_id,
    m.branch_id,
    m.status,
    m.created_at,
    u.email::text,
    (u.raw_user_meta_data->>'full_name')::text as full_name
  FROM memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = lookup_organization_id
  ORDER BY m.created_at DESC;
$$;

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION get_company_users TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_users TO service_role;
