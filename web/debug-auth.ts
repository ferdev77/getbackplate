import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const orgId = "864f494d-2f5f-4d2e-9e3a-965220e4e0f7"; // Las Primas

async function check() {
  // Test with service role (bypasses RLS) - should show all
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: adminData, error: adminError } = await admin
    .from("employees")
    .select("id, first_name, last_name, user_id")
    .eq("organization_id", orgId);
  
  console.log("All employees (admin/no RLS):", adminData?.length, adminData || adminError);
  
  // Now try with anon key (subject to RLS)
  const anon = createClient(supabaseUrl, anonKey);
  const { data: anonData, error: anonError } = await anon
    .from("employees")
    .select("id, first_name, last_name, user_id")
    .eq("organization_id", orgId);
    
  console.log("Employees (anon key):", anonData?.length, anonData || anonError);
  
  // Check what users exist in memberships for this org
  const { data: members, error: memberError } = await admin
    .rpc("get_company_users", { lookup_organization_id: orgId });
    
  console.log("Members:", members?.length, members || memberError);
}
check();
