import { env } from "@/shared/lib/env";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function buildRecoveryBridgeUrl(params: {
  appUrl: string;
  actionLink: string;
  organizationIdHint?: string | null;
}) {
  const payload = toBase64Url(params.actionLink);
  const target = new URL("/auth/recovery-link", params.appUrl);
  target.searchParams.set("k", payload);
  if (params.organizationIdHint) {
    target.searchParams.set("org", params.organizationIdHint);
  }
  return target.toString();
}

export function parseAndValidateRecoveryActionLink(payload: string | null | undefined): string | null {
  const encoded = String(payload ?? "").trim();
  if (!encoded) {
    return null;
  }

  const decoded = fromBase64Url(encoded);
  if (!decoded) {
    return null;
  }

  let target: URL;
  let supabaseBase: URL;

  try {
    target = new URL(decoded);
    supabaseBase = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    return null;
  }

  if (target.origin !== supabaseBase.origin) {
    return null;
  }

  if (target.pathname !== "/auth/v1/verify") {
    return null;
  }

  const type = target.searchParams.get("type");
  if (type !== "recovery") {
    return null;
  }

  const hasToken = target.searchParams.has("token") || target.searchParams.has("token_hash");
  if (!hasToken) {
    return null;
  }

  return target.toString();
}
