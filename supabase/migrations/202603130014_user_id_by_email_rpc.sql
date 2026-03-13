-- RPC to securely get a user ID by email
-- This avoids O(N) searching via the Admin API
CREATE OR REPLACE FUNCTION get_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lookup_email LIMIT 1;
$$;

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION get_user_id_by_email TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_id_by_email TO service_role;
