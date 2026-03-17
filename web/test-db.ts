import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data: orgs } = await supabase.from('organizations').select('id, name').ilike('name', '%prima%').limit(1);
  const orgId = orgs?.[0]?.id;
  console.log('Org ID for Las Primas:', orgId);
  
  if (orgId) {
    const { data: emps } = await supabase.from('employees').select('id, first_name, last_name, organization_id, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5);
    console.log('Employees in Las Primas:', emps);
    const { data: mems } = await supabase.from('memberships').select('id, user_id, organization_id, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5);
    console.log('Memberships in Las Primas:', mems);
  } else {
    console.log('Orgs found:', orgs);
  }
}
run();
