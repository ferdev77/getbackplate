import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { resolveCanonicalAppUrl } from "@/shared/lib/app-url";

export const DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET = "cname.vercel-dns.com";
const DOMAIN_CACHE_TTL_MS = 60_000;
const DOMAIN_NEGATIVE_CACHE_TTL_MS = 15_000;

type CachedOrganizationResolution = {
  organizationId: string | null;
  expiresAt: number;
};

type CachedPrimaryDomainResolution = {
  domain: string | null;
  expiresAt: number;
};

const organizationIdByDomainCache = new Map<string, CachedOrganizationResolution>();
const primaryDomainByOrganizationCache = new Map<string, CachedPrimaryDomainResolution>();

export function invalidateCustomDomainCaches(params?: {
  organizationId?: string | null;
  domain?: string | null;
}) {
  const organizationId = params?.organizationId ? String(params.organizationId) : "";
  const domain = normalizeRequestHost(params?.domain ?? null);

  if (!organizationId && !domain) {
    organizationIdByDomainCache.clear();
    primaryDomainByOrganizationCache.clear();
    return;
  }

  if (organizationId) {
    primaryDomainByOrganizationCache.delete(organizationId);

    for (const [cachedDomain, entry] of organizationIdByDomainCache) {
      if (entry.organizationId === organizationId) {
        organizationIdByDomainCache.delete(cachedDomain);
      }
    }
  }

  if (domain) {
    organizationIdByDomainCache.delete(domain);
  }
}

function readFromCache<T extends { expiresAt: number }>(cache: Map<string, T>, key: string) {
  const current = cache.get(key);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return current;
}

function cacheTtlMsForValue(value: string | null) {
  return value ? DOMAIN_CACHE_TTL_MS : DOMAIN_NEGATIVE_CACHE_TTL_MS;
}

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
  const cached = readFromCache(primaryDomainByOrganizationCache, organizationId);
  if (cached) {
    return cached.domain;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organization_domains")
    .select("domain")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("is_primary", true)
    .maybeSingle();

  const normalized = normalizeRequestHost(data?.domain ?? null);
  primaryDomainByOrganizationCache.set(organizationId, {
    domain: normalized,
    expiresAt: Date.now() + cacheTtlMsForValue(normalized),
  });
  return normalized;
}

export async function resolveOrganizationIdFromActiveDomain(host: string | null | undefined) {
  const normalizedHost = normalizeRequestHost(host);
  if (!normalizedHost || isReservedPlatformHost(normalizedHost)) {
    return null;
  }

  const cached = readFromCache(organizationIdByDomainCache, normalizedHost);
  if (cached) {
    return cached.organizationId;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organization_domains")
    .select("organization_id")
    .eq("domain", normalizedHost)
    .in("status", ["active", "verifying_ssl"])
    .maybeSingle();

  const organizationId = data?.organization_id ?? null;
  organizationIdByDomainCache.set(normalizedHost, {
    organizationId,
    expiresAt: Date.now() + cacheTtlMsForValue(organizationId),
  });
  return organizationId;
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
