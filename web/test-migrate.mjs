import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/pikachu/Downloads/saasresto/web/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Run migration SQL statements to Supabase using service role REST API
const sqls = [
  `ALTER TABLE public.employee_contracts ADD COLUMN IF NOT EXISTS signer_name text`,
  `ALTER TABLE public.employee_contracts ADD COLUMN IF NOT EXISTS branch_id uuid`,
  `CREATE UNIQUE INDEX IF NOT EXISTS employee_contracts_emp_org_uk ON public.employee_contracts (employee_id, organization_id)`,
];

for (const sql of sqls) {
  try {
    const resp = await fetch(`${supabaseUrl}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await resp.text();
    console.log(`[${resp.status}] ${sql.substring(0, 60)}`);
    if (resp.status !== 200) console.log('  Response:', text.substring(0, 200));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
