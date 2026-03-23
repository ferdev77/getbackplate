import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // Custom query to get policies for 'employees' table
  let results;
  try {
    results = await admin.rpc('get_policies', { table_name: 'employees' });
  } catch (err) {
    results = { data: null, error: err };
  }
  
  if (results.data) {
     console.log('Employees Policies from RPC:', results.data);
   } else {
     let policiesResult;
     try {
       policiesResult = await admin.from('pg_policies').select('*').eq('tablename', 'employees');
     } catch {
       policiesResult = { data: null };
     }
     console.log('Employees pg_policies:', policiesResult.data);
  }
}
run();
