import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name")
    .ilike("name", "%primas%")
    .single();

  if (!orgData) return;

  const { data: emps, error } = await supabase.from("employees").select("id, first_name, last_name, status").eq("organization_id", orgData.id);
  console.log("Employees error:", error);
  console.log("Employees count:", emps?.length);
  console.log("Employees:", emps);
}

main();
