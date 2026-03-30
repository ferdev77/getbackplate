import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent } from "@/shared/lib/audit";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const token = requestUrl.searchParams.get("token");
  const email = requestUrl.searchParams.get("email");
  const type = requestUrl.searchParams.get("type");
  const org = requestUrl.searchParams.get("org");
  const next = requestUrl.searchParams.get("next") ?? (type === "recovery" ? "/auth/change-password?reason=recovery" : "/");

  const supabase = await createSupabaseServerClient();
  let authErrorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authErrorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "recovery" | "invite" | "email",
    });
    authErrorMessage = error?.message ?? null;
  } else if (token && (type === "recovery" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({
      token,
      email: email ?? "",
      type,
    });
    authErrorMessage = error?.message ?? null;
  }

  if (authErrorMessage) {
    const redirectOnError = new URL("/auth/forgot-password", requestUrl.origin);
    redirectOnError.searchParams.set(
      "error",
      "El enlace de recuperacion expiro o no es valido. Solicita uno nuevo.",
    );
    if (org) {
      redirectOnError.searchParams.set("org", org);
    }

    return NextResponse.redirect(redirectOnError);
  }

  if (org) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const admin = createSupabaseAdminClient();
      const { data: invitation } = await admin
        .from("organization_invitations")
        .select("id, organization_id, email, first_login_completed_at")
        .eq("organization_id", org)
        .eq("source", "superadmin")
        .eq("role_code", "company_admin")
        .contains("metadata", { mode: "superadmin_invite" })
        .ilike("email", user.email)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (invitation && !invitation.first_login_completed_at) {
        const firstLoginAt = new Date().toISOString();
        const { error: markError } = await admin
          .from("organization_invitations")
          .update({
            first_login_completed_at: firstLoginAt,
            first_login_user_id: user.id,
          })
          .eq("id", invitation.id)
          .is("first_login_completed_at", null);

        if (!markError) {
          await logAuditEvent({
            action: "organization.invited_admin.first_login",
            entityType: "organization_invitation",
            entityId: invitation.id,
            organizationId: invitation.organization_id,
            eventDomain: "superadmin",
            outcome: "success",
            severity: "medium",
            metadata: {
              invited_email: invitation.email,
              first_login_user_id: user.id,
              first_login_completed_at: firstLoginAt,
            },
          });
        }
      }
    }
  }

  const redirectUrl = new URL(next, requestUrl.origin);
  if (org && !redirectUrl.searchParams.has("org") && redirectUrl.pathname.startsWith("/app/")) {
    redirectUrl.searchParams.set("org", org);
  }

  return NextResponse.redirect(redirectUrl);
}
