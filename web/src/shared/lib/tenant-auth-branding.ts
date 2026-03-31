import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { resolveCanonicalAppUrl } from "@/shared/lib/app-url";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OrganizationIdentity = {
  id: string;
  name: string;
  slug: string | null;
};

function normalizeHint(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

async function findOrganizationByHint(hint: string): Promise<OrganizationIdentity | null> {
  const admin = createSupabaseAdminClient();

  if (UUID_PATTERN.test(hint)) {
    const { data: byId } = await admin
      .from("organizations")
      .select("id, name, slug")
      .eq("id", hint)
      .maybeSingle();

    if (byId?.id) {
      return byId;
    }
  }

  const { data: bySlug } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", hint)
    .maybeSingle();

  if (bySlug?.id) {
    return bySlug;
  }

  if (!UUID_PATTERN.test(hint)) {
    const { data: byIdFallback } = await admin
      .from("organizations")
      .select("id, name, slug")
      .eq("id", hint)
      .maybeSingle();

    if (byIdFallback?.id) {
      return byIdFallback;
    }
  }

  return null;
}

export async function resolveOrganizationIdFromAuthHint(hint: string | null | undefined) {
  const normalized = normalizeHint(hint);
  if (!normalized) return null;

  const organization = await findOrganizationByHint(normalized);
  return organization?.id ?? null;
}

export async function resolveTenantAuthBrandingByHint(hint: string | null | undefined) {
  const normalized = normalizeHint(hint);
  if (!normalized) return null;

  const organization = await findOrganizationByHint(normalized);
  if (!organization?.id) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const [{ data: moduleRows }, { data: settings }] = await Promise.all([
    admin
      .from("organization_modules")
      .select("module_catalog!inner(code)")
      .eq("organization_id", organization.id)
      .eq("is_enabled", true),
    admin
      .from("organization_settings")
      .select("company_logo_url, company_logo_dark_url")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  const customBrandingEnabled = (moduleRows ?? []).some((row) => {
    const catalog = row.module_catalog as unknown as { code?: string | null } | null;
    return catalog?.code === "custom_branding";
  });

  if (!customBrandingEnabled) {
    return null;
  }

  return {
    organizationId: organization.id,
    organizationHint: organization.slug || organization.id,
    companyName: organization.name ?? "Empresa",
    logoUrl: settings?.company_logo_url ?? "",
    logoDarkUrl: settings?.company_logo_dark_url ?? "",
  };
}

export async function resolvePublicOrganizationHintById(organizationId: string) {
  const normalized = normalizeHint(organizationId);
  if (!normalized) return "";

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("id, slug")
    .eq("id", normalized)
    .maybeSingle();

  return data?.slug || data?.id || normalized;
}

export async function buildTenantAuthUrls(params: {
  appUrl?: string;
  organizationId: string;
  includeRecovery?: boolean;
}) {
  const appBase = resolveCanonicalAppUrl(params.appUrl);
  const hint = await resolvePublicOrganizationHintById(params.organizationId);
  const encodedHint = encodeURIComponent(hint);

  return {
    loginUrl: `${appBase}/auth/login?org=${encodedHint}`,
    recoveryUrl: params.includeRecovery
      ? `${appBase}/auth/forgot-password?org=${encodedHint}`
      : null,
    organizationHint: hint,
  };
}
