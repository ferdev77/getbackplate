import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export const SUPERADMIN_IMPERSONATION_COOKIE = "gb_superadmin_impersonation";
export const SUPERADMIN_IMPERSONATION_MAX_AGE = 60 * 30;

type ImpersonationSessionRow = {
  id: string;
  organization_id: string;
  superadmin_user_id: string;
  reason: string | null;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

export async function setSuperadminImpersonationCookie(sessionId: string) {
  const store = await cookies();
  store.set(SUPERADMIN_IMPERSONATION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPERADMIN_IMPERSONATION_MAX_AGE,
  });
}

export async function clearSuperadminImpersonationCookie() {
  const store = await cookies();
  store.delete(SUPERADMIN_IMPERSONATION_COOKIE);
}

async function getSuperadminImpersonationCookieValue() {
  const store = await cookies();
  return store.get(SUPERADMIN_IMPERSONATION_COOKIE)?.value?.trim() ?? null;
}

function isSessionExpired(expiresAt: string) {
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || expiresMs <= Date.now();
}

export async function createSuperadminImpersonationSession(input: {
  superadminUserId: string;
  organizationId: string;
  reason?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SUPERADMIN_IMPERSONATION_MAX_AGE * 1000).toISOString();

  const { error } = await supabase.from("superadmin_impersonation_sessions").insert({
    id: sessionId,
    superadmin_user_id: input.superadminUserId,
    organization_id: input.organizationId,
    reason: input.reason ?? null,
    expires_at: expiresAt,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, sessionId, expiresAt };
}

export async function revokeSuperadminImpersonationSession(input: {
  sessionId: string;
  superadminUserId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("superadmin_impersonation_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.sessionId)
    .eq("superadmin_user_id", input.superadminUserId)
    .is("revoked_at", null);

  return { ok: !error, error: error?.message ?? null };
}

export async function resolveActiveSuperadminImpersonationSession(superadminUserId: string) {
  const sessionId = await getSuperadminImpersonationCookieValue();
  if (!sessionId) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("superadmin_impersonation_sessions")
    .select("id, organization_id, superadmin_user_id, reason, expires_at, created_at, revoked_at")
    .eq("id", sessionId)
    .eq("superadmin_user_id", superadminUserId)
    .maybeSingle<ImpersonationSessionRow>();

  if (error || !data || data.revoked_at || isSessionExpired(data.expires_at)) {
    await clearSuperadminImpersonationCookie();
    return null;
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    superadminUserId: data.superadmin_user_id,
    reason: data.reason,
    expiresAt: data.expires_at,
    createdAt: data.created_at,
  };
}
