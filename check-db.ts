import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: "web/.env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Checking tables...");
  const branches = await supabase.from("branches").select("id, sort_order").limit(1);
  console.log("Branches sort_order:", branches.error ? branches.error.message : "Exists");

  const depts = await supabase.from("organization_departments").select("id, sort_order").limit(1);
  console.log("Organization Departments sort_order:", depts.error ? depts.error.message : "Exists");

  const pos = await supabase.from("department_positions").select("id, sort_order").limit(1);
  console.log("Department Positions sort_order:", pos.error ? pos.error.message : "Exists");
}

main();
