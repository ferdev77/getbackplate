import "server-only";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { logAuthEvent } from "@/shared/lib/audit";
import { AUDIT_REASON_CODES } from "@/shared/lib/audit-taxonomy";
import {
  getActiveOrganizationIdFromCookie,
  setActiveOrganizationIdCookie,
} from "@/shared/lib/tenant-selection";
import { isEmailMfaRequired, createEmailMfaChallenge } from "@/modules/auth/mfa.service";

type AuthProvider = "password" | "google";

export type PostLoginRoutingParams = {
  userId: string;
  email: string | null;
  organizationIdHint: string | null;
  companyDashboardPath: string;
  provider: AuthProvider;
};

/**
 * Shared post-authentication routing: superadmin bypass, active-membership
 * lookup, multi-org selection, and the company_admin email-MFA gate. Used by
 * both password login and OAuth (Google) login so the two flows can never
 * drift into different access rules.
 *
 * Returns the path to redirect to; throws PostLoginRoutingError with a
 * user-facing message on any failure so callers can render it consistently.
 */
export async function resolvePostLoginRedirect(
  params: PostLoginRoutingParams,
): Promise<string> {
  const { userId, email, organizationIdHint, companyDashboardPath, provider } = params;
  const admin = createSupabaseAdminClient();

  const { data: superadminRow } = await admin
    .from("superadmin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (superadminRow?.user_id) {
    await logAuthEvent({
      action: "login.success",
      outcome: "success",
      severity: "low",
      metadata: { landing: "/superadmin/dashboard", provider, role: "superadmin" },
    });
    return "/superadmin/dashboard";
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("memberships")
    .select("role_id, organization_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipsError) {
    await logAuthEvent({
      action: "login.failed",
      outcome: "error",
      severity: "high",
      reasonCode: AUDIT_REASON_CODES.MEMBERSHIPS_QUERY_FAILED,
      metadata: { provider },
    });
    throw new PostLoginRoutingError("Your account access could not be loaded. Please try again.");
  }

  const roleIds = [...new Set((memberships ?? []).map((row) => row.role_id))];

  if (!roleIds.length) {
    await logAuthEvent({
      action: "login.failed",
      outcome: "denied",
      severity: "medium",
      reasonCode: AUDIT_REASON_CODES.NO_ACTIVE_MEMBERSHIPS,
      metadata: { provider },
    });
    throw new PostLoginRoutingError("Your account does not have assigned access. Contact an administrator.");
  }

  const { data: roles, error: rolesError } = await admin
    .from("roles")
    .select("id, code")
    .in("id", roleIds);

  if (rolesError) {
    await logAuthEvent({
      action: "login.failed",
      outcome: "error",
      severity: "high",
      reasonCode: AUDIT_REASON_CODES.ROLES_QUERY_FAILED,
      metadata: { provider },
    });
    throw new PostLoginRoutingError("Your account role could not be loaded. Please try again.");
  }

  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const membershipContexts = (memberships ?? []).map((row) => ({
    organizationId: row.organization_id,
    roleCode: roleCodeById.get(row.role_id) ?? "",
  }));
  const organizations = [...new Set(membershipContexts.map((row) => row.organizationId))];

  const preferredOrganizationId = await getActiveOrganizationIdFromCookie();
  const hintMatchesMembership = Boolean(
    organizationIdHint && organizations.includes(organizationIdHint),
  );
  const hasPreferredOrganization = Boolean(
    preferredOrganizationId && organizations.includes(preferredOrganizationId),
  );

  if (organizations.length > 1 && !hintMatchesMembership && !hasPreferredOrganization) {
    await logAuthEvent({
      action: "login.success",
      outcome: "success",
      severity: "low",
      metadata: { landing: "/auth/select-organization", provider },
    });
    return "/auth/select-organization";
  }

  const resolvedOrganizationId =
    (hintMatchesMembership
      ? organizationIdHint
      : (hasPreferredOrganization ? preferredOrganizationId : organizations[0])) ?? null;

  if (resolvedOrganizationId) {
    await setActiveOrganizationIdCookie(resolvedOrganizationId);
  }

  const roleCodesInResolvedOrganization = new Set(
    membershipContexts
      .filter((row) => row.organizationId === resolvedOrganizationId)
      .map((row) => row.roleCode),
  );

  if (roleCodesInResolvedOrganization.has("company_admin")) {
    if (resolvedOrganizationId) {
      const mfaRequired = await isEmailMfaRequired({
        organizationId: resolvedOrganizationId,
        userId,
      });

      if (mfaRequired) {
        const challenge = await createEmailMfaChallenge({
          userId,
          organizationId: resolvedOrganizationId,
          email: email ?? "",
        });

        if (!challenge.ok) {
          await logAuthEvent({
            action: "login.mfa_challenge_failed",
            outcome: "error",
            organizationId: resolvedOrganizationId,
            severity: "high",
            metadata: { error: challenge.error, provider },
          });
          throw new PostLoginRoutingError(challenge.error);
        }

        await logAuthEvent({
          action: "login.mfa_challenge_sent",
          outcome: "success",
          organizationId: resolvedOrganizationId,
          severity: "low",
          metadata: { provider },
        });

        return `/auth/verify-mfa?next=${encodeURIComponent(companyDashboardPath)}`;
      }
    }

    await logAuthEvent({
      action: "login.success",
      outcome: "success",
      organizationId: resolvedOrganizationId,
      severity: "low",
      metadata: { landing: companyDashboardPath, provider },
    });
    return companyDashboardPath;
  }

  if (roleCodesInResolvedOrganization.has("employee")) {
    await logAuthEvent({
      action: "login.success",
      outcome: "success",
      organizationId: resolvedOrganizationId,
      severity: "low",
      metadata: { landing: "/portal/home", provider },
    });
    return "/portal/home";
  }

  await logAuthEvent({
    action: "login.success",
    outcome: "success",
    organizationId: resolvedOrganizationId,
    severity: "low",
    metadata: { landing: companyDashboardPath, provider, reason: "fallback_role_routing" },
  });
  return companyDashboardPath;
}

export class PostLoginRoutingError extends Error {}
