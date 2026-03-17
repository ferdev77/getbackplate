import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // Custom query to get policies for 'employees' table
  const { data, error } = await admin.rpc('get_policies', { table_name: 'employees' }).catch(() => ({data: null, error: null}));
  if (data) {
     console.log('Employees Policies from RPC:', data);
  } else {
     const { data: policies } = await admin.from('pg_policies').select('*').eq('tablename', 'employees').catch(() => ({data: null}));
     console.log('Employees pg_policies:', policies);
  }
}
run();
