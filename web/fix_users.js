const { Client } = require('pg');

const sql = `
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
  JOIN roles r ON r.id = m.role_id
  WHERE m.organization_id = lookup_organization_id
    /* Exclude anyone with the 'employee' role. Employees belong exclusively to the Employees page. */
    AND r.code != 'employee'
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_company_users TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_users TO service_role;
`;

const client = new Client({ connectionString: 'postgresql://postgres.mfhyemwypuzsqjqxtbjf:dy.7nci4Mfbfv%2Bv@aws-0-us-west-2.pooler.supabase.com:5432/postgres' });
client.connect().then(async () => {
  await client.query(sql);
  console.log('SUCCESS');
  process.exit(0);
}).catch(e => {
  console.error('ERROR executing SQL:', e);
  process.exit(1);
});
