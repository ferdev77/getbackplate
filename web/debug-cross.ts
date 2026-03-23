/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);

const orgId = "864f494d-2f5f-4d2e-9e3a-965220e4e0f7";

async function check() {
  // Get all employees
  const { data: employees } = await admin
    .from("employees")
    .select("id, first_name, last_name, user_id, email")
    .eq("organization_id", orgId);
  
  console.log("\n=== EMPLOYEES ===");
  for (const e of employees ?? []) {
    console.log(`  [${e.last_name}] ${e.first_name} ${e.last_name} | user_id: ${e.user_id || 'null'}`);
  }

  const employeeUserIds = new Set(
    (employees ?? [])
      .filter((e: any) => e.last_name !== "-" && e.user_id)
      .map((e: any) => e.user_id)
  );
  console.log("\nEmployee user_ids:", [...employeeUserIds]);

  // Get all members
  const { data: members, error } = await admin
    .rpc("get_company_users", { lookup_organization_id: orgId });
    
  console.log("\n=== MEMBERSHIPS (get_company_users) ===");
  for (const m of members ?? []) {
    const isEmployee = employeeUserIds.has(m.user_id);
    console.log(`  ${isEmployee ? '[EMPLOYEE]' : '[USER]'} ${m.full_name} | ${m.email} | user_id: ${m.user_id}`);
  }

  if (error) console.log("Error:", error);
}
check();
