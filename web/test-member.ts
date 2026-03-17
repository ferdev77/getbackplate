import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const orgId = "864f494d-2f5f-4d2e-9e3a-965220e4e0f7";
  const { data: org, error: orgError } = await supabase.from("organizations").select("*").eq("id", orgId).single();
  if (orgError) {
    console.log("Org not found by ID", orgError);
    return;
  }
  console.log("Org found:", org.name);

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("*")
    .eq("organization_id", orgId);

  if (error) {
    console.error("Error fetching memberships", error);
  } else {
    console.log("Memberships for Org:", JSON.stringify(memberships, null, 2));
  }
}

main();
