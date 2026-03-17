import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc("get_company_users", {
    org_id: "864f494d-2f5f-4d2e-9e3a-965220e4e0f7"
  }).catch(e => ({ error: e, data: null }));
  console.log("Normal call:", data ? "Success" : error);

  // Instead of querying functions directly (which we can't do via PostgREST),
  // we could use a raw query if we had a direct postgres connection.
  // Wait, service_role can query postgres schema via an RPC if one exists, but we know it doesn't.
  // Is there any existing function to list functions?
  
  // Let's call the function with NO parameters to see what error PGRST gives
  const { error: e2 } = await supabase.rpc("get_company_users");
  console.log("No params:", e2);
}

main();
