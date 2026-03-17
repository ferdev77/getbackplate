import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data, error } = await supabase
    .from('employees')
    .update({ last_name: '' })
    .eq('organization_id', '864f494d-2f5f-4d2e-9e3a-965220e4e0f7')
    .eq('last_name', '-');
    
  console.log('Fixed:', data || error);
}
fix();
