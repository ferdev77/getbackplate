import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);

const orgId = "864f494d-2f5f-4d2e-9e3a-965220e4e0f7";

async function simulate() {
  // Step 1: fetch employees
  const { data: employees, error: empErr } = await admin
    .from("employees")
    .select(`id, user_id, first_name, last_name`)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  console.log("\n=== EMPLOYEES FROM DB ===");
  for (const e of employees ?? []) {
    console.log(`  - ${e.first_name} ${e.last_name} | user_id: ${e.user_id || 'NULL'}`);
  }
  if (empErr) console.log("employees error:", empErr);

  // Step 2: Build validEmployeeUserIds (NEW logic - no last_name filter)
  const validEmployeeUserIds = new Set(
    (employees ?? [])
      .filter((e: any) => e.user_id)
      .map((e: any) => e.user_id)
  );
  console.log("\nvalidEmployeeUserIds:", [...validEmployeeUserIds]);

  // Step 3: fetch memberships
  const { data: memberships, error: memErr } = await admin
    .rpc("get_company_users", { lookup_organization_id: orgId })
    .limit(100);

  console.log("\n=== MEMBERSHIPS FROM get_company_users ===");
  for (const m of memberships ?? []) {
    const isEmployee = validEmployeeUserIds.has(m.user_id);
    console.log(`  - [${isEmployee ? 'EMPLOYEE → EXCLUDED' : 'USER → SHOWN'}] ${m.full_name} | ${m.email} | user_id: ${m.user_id}`);
  }
  if (memErr) console.log("memberships error:", memErr);
  
  // Step 4: show what users would render
  const mappedUsers = (memberships ?? []).filter((row: any) => !validEmployeeUserIds.has(row.user_id));
  console.log("\n=== WHAT USERS PAGE SHOULD SHOW ===");
  for (const u of mappedUsers) {
    console.log(`  - ${u.full_name} | ${u.email}`);
  }
}

simulate();
