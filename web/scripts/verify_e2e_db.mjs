import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.E2E_ORG_ID;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ORG_ID) {
  console.error("Missing SUPABASE_URL, SERVICE_ROLE_KEY, or E2E_ORG_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function verify() {
  console.log(`Verifying organization ID: ${ORG_ID}`);

  // 1. Check Organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", ORG_ID)
    .single();

  if (orgError) {
    console.error("Organization NOT FOUND:", orgError.message);
  } else {
    console.log("Organization FOUND:", org.name);
  }

  // 2. Check Departments
  const { data: depts, error: deptsError } = await supabase
    .from("departments")
    .select("id, name")
    .eq("organization_id", ORG_ID);

  console.log("\nDepartments:");
  if (deptsError) console.error(deptsError.message);
  else depts.forEach(d => console.log(`- ${d.name} (${d.id})`));

  // 3. Check Positions
  const { data: positions, error: positionsError } = await supabase
    .from("department_positions")
    .select("id, department_id, name")
    .eq("organization_id", ORG_ID);

  console.log("\nPositions:");
  if (positionsError) console.error(positionsError.message);
  else positions.forEach(p => console.log(`- ${p.name} (Dept: ${p.department_id})`));

  // 4. Check Employees and Users
  const emails = [
    process.env.E2E_COMPANY_EMAIL,
    process.env.E2E_EMP1_EMAIL,
    process.env.E2E_EMP2_EMAIL,
    process.env.E2E_EMP3_EMAIL,
    process.env.E2E_EMP4_EMAIL
  ];

  console.log("\nUsers and Profiles:");
  for (const email of emails) {
    const { data: user, error: userError } = await supabase
      .from("organization_user_profiles")
      .select("user_id, email, first_name, last_name, is_employee, branch_id, department_id, role_code")
      .eq("organization_id", ORG_ID)
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      console.error(`Error fetching ${email}:`, userError.message);
    } else if (!user) {
      console.log(`- [MISSING] ${email}`);
    } else {
      console.log(`- [FOUND] ${email}: ID=${user.user_id}, Name=${user.first_name} ${user.last_name}, Role=${user.role_code}, Dept=${user.department_id}`);
    }
  }
}

verify().catch(console.error);
