import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "../src/infrastructure/email/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECIPIENT = process.env.BRANDING_TEST_RECIPIENT || "fer@cardinal.com";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function buildBrandedEmailSubject(baseSubject: string, brandName: string) {
  const base = String(baseSubject ?? "").trim();
  const prefix = `[${brandName}]`;
  if (!base) return prefix;
  if (base.startsWith(prefix)) return base;
  return `${prefix} ${base}`;
}

async function main() {
  const supabaseUrl = requireEnv(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv(SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const moduleRows = await supabase
    .from("organization_modules")
    .select("organization_id,module_catalog!inner(code)")
    .eq("module_catalog.code", "custom_branding")
    .eq("is_enabled", true);

  if (moduleRows.error) throw new Error(moduleRows.error.message);
  const brandedOrgIds = [...new Set((moduleRows.data ?? []).map((row) => row.organization_id))];
  if (!brandedOrgIds.length) {
    throw new Error("No organization found with custom_branding enabled");
  }

  const org = await supabase
    .from("organizations")
    .select("id,name,slug")
    .eq("id", brandedOrgIds[0])
    .single();
  if (org.error) throw new Error(org.error.message);

  const brandedName = (org.data.name || "Empresa").trim() || "Empresa";

  const brandedSubject = buildBrandedEmailSubject("Prueba branding email", brandedName);
  const brandedResult = await sendTransactionalEmail({
    to: RECIPIENT,
    subject: `${brandedSubject} [TEST]`,
    html: `<p>Prueba de branding activo para <strong>${brandedName}</strong>.</p>`,
    text: `Prueba de branding activo para ${brandedName}.`,
    senderName: brandedName,
  });

  const fallbackSubject = buildBrandedEmailSubject("Prueba branding email", "GetBackplate");
  const fallbackResult = await sendTransactionalEmail({
    to: RECIPIENT,
    subject: `${fallbackSubject} [TEST]`,
    html: "<p>Prueba de fallback sin custom branding.</p>",
    text: "Prueba de fallback sin custom branding.",
    senderName: "GetBackplate",
  });

  console.log(
    JSON.stringify(
      {
        recipient: RECIPIENT,
        brandedOrg: org.data,
        brandedPreview: {
          senderName: brandedName,
          subject: `${brandedSubject} [TEST]`,
          result: brandedResult,
        },
        fallbackPreview: {
          senderName: "GetBackplate",
          subject: `${fallbackSubject} [TEST]`,
          result: fallbackResult,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("verify-branding-email-send failed:", error.message);
  process.exit(1);
});
