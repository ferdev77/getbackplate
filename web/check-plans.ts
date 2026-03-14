import { createSupabaseAdminClient } from "./src/infrastructure/supabase/client/admin.ts";

async function checkPlans() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from('plans').select('*');
  console.log(JSON.stringify(data, null, 2));
}

checkPlans();
