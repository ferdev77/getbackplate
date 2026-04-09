import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { resolveCanonicalAppUrl } from "@/shared/lib/app-url";

export const DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET = "cname.vercel-dns.com";

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export type CustomDomainStatus = "pending_dns" | "verifying_ssl" | "active" | "error" | "disabled";

export function normalizeRequestHost(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return raw.split(":")[0] ?? null;
}

export function normalizeCustomDomainInput(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;

  let host = raw;
  if (host.startsWith("http://") || host.startsWith("https://")) {
    try {
      host = new URL(host).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  host = host.replace(/\.$/, "");
  if (!DOMAIN_PATTERN.test(host)) {
    return null;
  }

  return host;
}

export function isReservedPlatformHost(host: string | null | undefined) {
  const normalized = normalizeRequestHost(host);
  if (!normalized) return true;

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (normalized.endsWith(".vercel.app")) {
    return true;
  }

  const canonicalHost = normalizeRequestHost(
    (() => {
      try {
        return new URL(resolveCanonicalAppUrl(null)).hostname;
      } catch {
        return null;
      }
    })(),
  );

  return Boolean(canonicalHost && canonicalHost === normalized);
}

export async function getActiveDomainByOrganizationId(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organization_domains")
    .select("domain")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("is_primary", true)
    .maybeSingle();

  return normalizeRequestHost(data?.domain ?? null);
}

export async function resolveOrganizationIdFromActiveDomain(host: string | null | undefined) {
  const normalizedHost = normalizeRequestHost(host);
  if (!normalizedHost || isReservedPlatformHost(normalizedHost)) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organization_domains")
    .select("organization_id")
    .eq("domain", normalizedHost)
    .eq("status", "active")
    .maybeSingle();

  return data?.organization_id ?? null;
}

export async function resolveTenantAppUrlByOrganizationId(params: {
  organizationId: string;
  fallbackAppUrl?: string | null;
}) {
  const activeDomain = await getActiveDomainByOrganizationId(params.organizationId);
  if (activeDomain) {
    return `https://${activeDomain}`;
  }

  return resolveCanonicalAppUrl(params.fallbackAppUrl);
}
