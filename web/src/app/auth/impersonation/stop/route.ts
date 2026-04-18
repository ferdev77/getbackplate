import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  clearSuperadminImpersonationCookie,
  resolveActiveSuperadminImpersonationSession,
  revokeSuperadminImpersonationSession,
} from "@/shared/lib/impersonation";
import { clearActiveOrganizationIdCookie } from "@/shared/lib/tenant-selection";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await clearSuperadminImpersonationCookie();
    await clearActiveOrganizationIdCookie();
    return NextResponse.redirect(new URL("/auth/login", requestUrl.origin));
  }

  const active = await resolveActiveSuperadminImpersonationSession(user.id);
  if (active) {
    await revokeSuperadminImpersonationSession({
      sessionId: active.id,
      superadminUserId: user.id,
    });

    await logAuditEvent({
      action: "organization.impersonation.stop",
      entityType: "superadmin_impersonation_session",
      entityId: active.id,
      organizationId: active.organizationId,
      eventDomain: "superadmin",
      outcome: "success",
      severity: "high",
    });
  }

  await clearSuperadminImpersonationCookie();
  await clearActiveOrganizationIdCookie();

  return NextResponse.redirect(
    new URL(
      "/superadmin/organizations?status=success&message=" +
        encodeURIComponent("Sesión de impersonación finalizada"),
      requestUrl.origin,
    ),
  );
}
