import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Get all RLS policies for the employees table
  const { data, error } = await supabase
    .from("pg_policies")
    .select("*")
    .eq("tablename", "employees");
  
  console.log("Policies:", JSON.stringify(data, null, 2) || error);
}
check();
