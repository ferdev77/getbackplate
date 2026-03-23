import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  // We need to login as 'adminprimas@s.com' first
  const supabase = createClient(supabaseUrl, anonKey);
  
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: "adminprimas@s.com",
    password: "password123!" // Assuming this is their password based on previous setups or we can reset/use admin token
  });
  
  if (authErr) {
    console.error("Login failed:", authErr);
    // Let's use service key to create an access token for him?
    // Wait, let's just use the server code.
  } else {
    console.log("Logged in!");
    const { data: employees, error } = await supabase
      .from("employees")
      .select("id, first_name")
      .eq("organization_id", "864f494d-2f5f-4d2e-9e3a-965220e4e0f7");
      
    console.log("Employees as adminprimas:", employees, error);
  }
}

main();
