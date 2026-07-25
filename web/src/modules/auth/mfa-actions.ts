"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { getCurrentUser } from "@/modules/memberships/queries";
import { getActiveOrganizationIdWithFallback, setActiveOrganizationIdCookie } from "@/shared/lib/tenant-selection";
import { markMfaVerifiedForUser } from "@/shared/lib/mfa-verification";
import { createEmailMfaChallenge, verifyEmailMfaChallenge } from "@/modules/auth/mfa.service";

function buildVerifyMfaPath(options?: { error?: string; next?: string; notice?: string }) {
  const search = new URLSearchParams();
  if (options?.error) search.set("error", options.error);
  if (options?.notice) search.set("notice", options.notice);
  if (options?.next) search.set("next", options.next);
  const query = search.toString();
  return query ? `/auth/verify-mfa?${query}` : "/auth/verify-mfa";
}

function safeNextPath(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/app/dashboard";
}

export async function verifyMfaCodeAction(formData: FormData) {
  try {
    const code = String(formData.get("code") ?? "").trim();
    const next = safeNextPath(formData.get("next"));

    const user = await getCurrentUser();
    const organizationId = await getActiveOrganizationIdWithFallback();

    if (!user || !organizationId) {
      redirect("/auth/login");
    }

    await setActiveOrganizationIdCookie(organizationId);

    if (!/^\d{6}$/.test(code)) {
      redirect(buildVerifyMfaPath({ error: "Enter the 6-digit code.", next }));
    }

    const result = await verifyEmailMfaChallenge({
      userId: user.id,
      organizationId,
      code,
    });

    if (!result.ok) {
      redirect(buildVerifyMfaPath({ error: result.error, next }));
    }

    await markMfaVerifiedForUser(user.id);
    redirect(next);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(buildVerifyMfaPath({ error: "An unexpected error occurred. Please try again." }));
  }
}

export async function resendMfaCodeAction(): Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }> {
  try {
    const user = await getCurrentUser();
    const organizationId = await getActiveOrganizationIdWithFallback();

    if (!user || !organizationId) {
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }

    await setActiveOrganizationIdCookie(organizationId);

    const result = await createEmailMfaChallenge({
      userId: user.id,
      organizationId,
      email: user.email ?? "",
    });

    if (!result.ok) {
      return result;
    }

    return { ok: true, retryAfterSeconds: 45 };
  } catch {
    return { ok: false, error: "An unexpected error occurred. Please try again." };
  }
}
