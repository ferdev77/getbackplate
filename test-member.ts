import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orgs } = await supabase.from("organizations").select("*").eq("name", "Las Primas");
  const org = orgs?.[0];
  if (!org) {
    console.log("Org 'Las Primas' not found");
    return;
  }
  console.log("Org ID:", org.id);

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("*, auth_users:user_id(email)")
    .eq("organization_id", org.id);

  if (error) {
    console.error("Error fetching memberships", error);
  } else {
    console.log("Memberships for Las Primas:", JSON.stringify(memberships, null, 2));
  }
}

main();
