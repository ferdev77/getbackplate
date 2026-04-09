import { DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET, type CustomDomainStatus } from "@/shared/lib/custom-domains";

type VercelDomainCheck = {
  status: CustomDomainStatus;
  verificationError: string | null;
  dnsTarget: string;
};

function getVercelConfig() {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || null;

  return {
    token: token || null,
    projectId: projectId || null,
    teamId,
  };
}

function vercelApiUrl(path: string, teamId: string | null) {
  const base = `https://api.vercel.com${path}`;
  if (!teamId) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}teamId=${encodeURIComponent(teamId)}`;
}

async function callVercelApi(path: string, init: RequestInit = {}) {
  const { token, teamId } = getVercelConfig();
  if (!token) {
    throw new Error("VERCEL_API_TOKEN is not configured");
  }

  const response = await fetch(vercelApiUrl(path, teamId), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const message =
      typeof payload?.error === "object" && payload?.error
        ? String((payload.error as { message?: string }).message ?? "Error Vercel")
        : String(payload?.error ?? "Error Vercel");
    throw new Error(message);
  }

  return payload ?? {};
}

function mapVercelDomainStatus(payload: Record<string, unknown>): VercelDomainCheck {
  const verification = Array.isArray(payload.verification)
    ? (payload.verification as Array<Record<string, unknown>>)
    : [];
  const verificationError = verification.find((item) => item.reason)
    ? String(verification.find((item) => item.reason)?.reason ?? "")
    : null;

  const cnameRecord = verification.find((item) => String(item.type ?? "").toUpperCase() === "CNAME");
  const dnsTarget = String(cnameRecord?.value ?? DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET);
  const verified = Boolean(payload.verified);
  const misconfigured = Boolean(payload.misconfigured);
  const hasSsl =
    Boolean(payload.validCertificate) ||
    Boolean((payload as { certificate?: { valid?: boolean } }).certificate?.valid);

  if (verified && hasSsl) {
    return {
      status: "active",
      verificationError: null,
      dnsTarget,
    };
  }

  if (verified && !hasSsl) {
    return {
      status: "verifying_ssl",
      verificationError: null,
      dnsTarget,
    };
  }

  if (misconfigured || verificationError) {
    return {
      status: "error",
      verificationError: verificationError || "Dominio mal configurado en DNS",
      dnsTarget,
    };
  }

  return {
    status: "pending_dns",
    verificationError: null,
    dnsTarget,
  };
}

export async function registerDomainInVercel(domain: string): Promise<VercelDomainCheck> {
  const { projectId, token } = getVercelConfig();
  if (!token || !projectId) {
    return {
      status: "pending_dns",
      verificationError: null,
      dnsTarget: DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET,
    };
  }

  await callVercelApi(`/v10/projects/${projectId}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });

  return inspectDomainInVercel(domain);
}

export async function inspectDomainInVercel(domain: string): Promise<VercelDomainCheck> {
  const { projectId, token } = getVercelConfig();
  if (!token || !projectId) {
    return {
      status: "pending_dns",
      verificationError: null,
      dnsTarget: DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET,
    };
  }

  const payload = await callVercelApi(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`);
  return mapVercelDomainStatus(payload);
}

export async function removeDomainFromVercel(domain: string) {
  const { projectId, token } = getVercelConfig();
  if (!token || !projectId) {
    return;
  }

  await callVercelApi(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`, {
    method: "DELETE",
  });
}
