import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export type TenantEmailBranding = {
  isCustom: boolean;
  companyName: string;
  logoUrl: string | null;
};

export function getDefaultEmailBranding(): TenantEmailBranding {
  return {
    isCustom: false,
    companyName: "GetBackplate",
    logoUrl: null,
  };
}

export async function getTenantEmailBranding(organizationId: string): Promise<TenantEmailBranding> {
  const admin = createSupabaseAdminClient();

  const [{ data: orgData }, { data: settingsData }, { data: moduleEnabled }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    admin
      .from("organization_settings")
      .select("company_logo_url")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
  ]);

  const isCustom = Boolean(moduleEnabled);
  const companyName = isCustom
    ? (typeof orgData?.name === "string" && orgData.name.trim() ? orgData.name.trim() : "Empresa")
    : "GetBackplate";
  const logoUrl =
    isCustom && typeof settingsData?.company_logo_url === "string" && settingsData.company_logo_url.trim()
      ? settingsData.company_logo_url.trim()
      : null;

  return {
    isCustom,
    companyName,
    logoUrl,
  };
}
