import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { canReadDocumentInTenant } from "./src/shared/lib/document-access";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, organization_id, access_scope, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Latest documents:", JSON.stringify(documents, null, 2));
}
run().catch(console.error);
