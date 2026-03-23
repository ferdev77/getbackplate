import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/pikachu/Downloads/saasresto/web/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use service role to run raw SQL via Postgres REST endpoint
const sqls = [
  `alter table public.employee_contracts add column if not exists signer_name text`,
  `alter table public.employee_contracts add column if not exists branch_id uuid`,
  `create unique index if not exists employee_contracts_emp_org_uk on public.employee_contracts (employee_id, organization_id)`
];

for (const sql of sqls) {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Profile': 'public',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  console.log(`SQL: ${sql.substring(0, 50)} | Status: ${res.status}`);
}
