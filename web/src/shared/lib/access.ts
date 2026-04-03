import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import {
  getCurrentUser,
  getCurrentUserMemberships,
  isCurrentUserSuperadmin,
  resolvePreferredMembership,
} from "@/modules/memberships/queries";
import type { MembershipContext } from "@/modules/memberships/queries";
import { logAccessDeniedEvent, logModuleAccessDeniedEvent } from "@/shared/lib/audit";
import { AUDIT_REASON_CODES } from "@/shared/lib/audit-taxonomy";
import {
  getActiveOrganizationIdFromCookie,
} from "@/shared/lib/tenant-selection";
import { resolveActiveSuperadminImpersonationSession } from "@/shared/lib/impersonation";
import { markInvitedAdminFirstLoginIfNeeded } from "@/shared/lib/invited-admin-first-login";
import { getBillingGateForOrganization } from "@/modules/billing/services/billing-gate.service";

export const MODULE_DISABLED_COPY = "Este modulo no esta incluido en tu plan actual.";

function userMustChangePassword(user: { user_metadata?: unknown } | null | undefined) {
  if (!user || typeof user.user_metadata !== "object" || !user.user_metadata) return false;
  return Boolean((user.user_metadata as Record<string, unknown>).force_password_change);
}

type TenantModuleApiAccessResult =
  | {
      ok: true;
      tenant: MembershipContext;
      userId: string;
    }
  | {
      ok: false;
      status: 401 | 402 | 403 | 409;
      error: string;
      reasonCode: string;
    };

async function resolveTenantFromCookie(options?: {
  roleCodes?: string[];
  userId?: string;
  isSuperadmin?: boolean;
}) {
  const memberships = await getCurrentUserMemberships();
  const filteredMemberships = options?.roleCodes?.length
    ? memberships.filter((row) => options.roleCodes?.includes(row.roleCode))
    : memberships;

  const preferredOrganizationId = await getActiveOrganizationIdFromCookie();
  const resolved = resolvePreferredMembership(filteredMemberships, preferredOrganizationId);

  if (!resolved.selected && !resolved.requiresSelection && options?.isSuperadmin && options.userId) {
    const impersonation = await resolveActiveSuperadminImpersonationSession(options.userId);
    if (impersonation) {
      const syntheticTenant = {
        membershipId: `impersonation:${impersonation.id}`,
        organizationId: impersonation.organizationId,
        roleId: "impersonation",
        branchId: null,
        roleCode: "company_admin",
        createdAt: impersonation.createdAt,
      };

      const roleAllowed = !options.roleCodes?.length || options.roleCodes.includes("company_admin");
      if (roleAllowed) {
        return {
          memberships,
          filteredMemberships,
          preferredOrganizationId,
          selected: syntheticTenant,
          requiresSelection: false,
          impersonation,
        };
      }
    }
  }

  return {
    memberships,
    filteredMemberships,
    preferredOrganizationId,
    selected: resolved.selected,
    requiresSelection: resolved.requiresSelection,
    impersonation: null,
  };
}

const isTenantModuleEnabled = cache(async function isTenantModuleEnabled(organizationId: string, moduleCode: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_module_enabled", {
    org_id: organizationId,
    module_code: moduleCode,
  });

  return {
    enabled: Boolean(data),
    hasError: Boolean(error),
  };
});

export async function isModuleEnabledForOrganization(organizationId: string, moduleCode: string) {
  const moduleAccess = await isTenantModuleEnabled(organizationId, moduleCode);
  return moduleAccess.enabled;
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    await logAccessDeniedEvent({
      area: "auth",
      reasonCode: AUDIT_REASON_CODES.MISSING_AUTH_SESSION,
      pathHint: "protected_route_or_action",
    });
    redirect("/auth/login");
  }

  return user;
}

export async function requireSuperadmin() {
  await requireAuthenticatedUser();

  const allowed = await isCurrentUserSuperadmin();

  if (!allowed) {
    await logAccessDeniedEvent({
      area: "superadmin",
      reasonCode: AUDIT_REASON_CODES.MISSING_SUPERADMIN_ROLE,
      requiredRole: "superadmin",
      pathHint: "/superadmin/*",
    });
    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Tu usuario no tiene permisos de superadmin"),
    );
  }
}

export async function assertSuperadminApi() {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401 as const, error: "No autenticado" };
  }
  const isSuperadmin = await isCurrentUserSuperadmin();
  if (!isSuperadmin) {
    return { ok: false, status: 403 as const, error: "No autorizado" };
  }
  return { ok: true, userId: user.id };
}

export async function requireTenantContext() {
  const user = await requireAuthenticatedUser();

  if (userMustChangePassword(user)) {
    redirect("/auth/change-password?reason=first_login");
  }

  const isSuperadmin = await isCurrentUserSuperadmin();

  const tenantContext = await resolveTenantFromCookie({
    userId: user.id,
    isSuperadmin,
  });

  if (tenantContext.requiresSelection) {
    redirect("/auth/select-organization");
  }

  const tenant = tenantContext.selected;

  if (!tenant) {
    if (isSuperadmin) {
      redirect("/superadmin/dashboard");
    }

    await logAccessDeniedEvent({
      area: "company",
      reasonCode: AUDIT_REASON_CODES.MISSING_ACTIVE_MEMBERSHIP,
      requiredRole: "company_admin|manager|employee",
      pathHint: "/app/* or /portal/*",
    });

    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Tu usuario no tiene acceso asignado a una empresa"),
    );
  }

  return tenant;
}

export async function requireTenantModule(moduleCode: string) {
  // Fast path: get user and preferred org first (these are cached within the request).
  const user = await requireAuthenticatedUser();
  const isSuperadmin = await isCurrentUserSuperadmin();

  if (userMustChangePassword(user)) {
    redirect("/auth/change-password?reason=first_login");
  }

  const preferredOrganizationId = await getActiveOrganizationIdFromCookie();

  // If we don't yet have a preferred organization, fall back to the slower path
  // which resolves it from memberships (handles org selection, impersonation, etc.)
  if (!preferredOrganizationId) {
    return requireTenantModuleFallback(user, moduleCode);
  }

  // Single RPC replaces: getCurrentUserMemberships() + isTenantModuleEnabled() +
  // getBillingGateForOrganization() — 3+ round-trips become 1.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_tenant_access_context", {
    p_user_id: user.id,
    p_organization_id: preferredOrganizationId,
    p_module_code: moduleCode,
  });

  const ctx = Array.isArray(data) ? data[0] : data;

  if (error || !ctx) {
    // RPC failed — fall back to the safe individual-query path
    console.warn("[access] get_tenant_access_context RPC error, falling back", error?.message);
    return requireTenantModuleFallback(user, moduleCode);
  }

  if (!ctx.has_membership) {
    if (isSuperadmin) {
      const impersonation = await resolveActiveSuperadminImpersonationSession(user.id);
      if (impersonation?.organizationId === preferredOrganizationId) {
        if (!ctx.module_enabled) {
          await logModuleAccessDeniedEvent({
            organizationId: preferredOrganizationId,
            branchId: null,
            moduleCode,
            pathHint: "/app/*",
            reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
          });
          redirect("/app/dashboard?status=error&message=" + encodeURIComponent(MODULE_DISABLED_COPY));
        }

        return {
          membershipId: `impersonation:${impersonation.id}`,
          organizationId: preferredOrganizationId,
          roleId: "impersonation",
          branchId: null,
          roleCode: "company_admin",
          createdAt: impersonation.createdAt,
        } satisfies import("@/modules/memberships/queries").MembershipContext;
      }

      redirect("/superadmin/dashboard");
    }
    await logAccessDeniedEvent({
      area: "company",
      reasonCode: AUDIT_REASON_CODES.MISSING_ACTIVE_MEMBERSHIP,
      requiredRole: "company_admin|manager|employee",
      pathHint: "/app/*",
    });
    redirect("/auth/login?error=" + encodeURIComponent("Tu usuario no tiene acceso asignado a una empresa"));
  }

  if (!ctx.module_enabled) {
    await logModuleAccessDeniedEvent({
      organizationId: preferredOrganizationId,
      branchId: ctx.branch_id ?? null,
      moduleCode,
      pathHint: "/app/*",
      reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
    });
    redirect("/app/dashboard?status=error&message=" + encodeURIComponent(MODULE_DISABLED_COPY));
  }

  // Return a MembershipContext-compatible object
  return {
    membershipId: ctx.membership_id as string,
    organizationId: preferredOrganizationId,
    roleId: "",           // not needed downstream, RPC omits it to reduce payload
    branchId: ctx.branch_id ?? null,
    roleCode: ctx.role_code ?? "",
    createdAt: new Date().toISOString(),
  } satisfies import("@/modules/memberships/queries").MembershipContext;
}

/** Fallback for requireTenantModule when no preferred org is in the cookie (rare path). */
async function requireTenantModuleFallback(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  moduleCode: string,
) {
  const isSuperadmin = await isCurrentUserSuperadmin();
  const tenantContext = await resolveTenantFromCookie({ userId: user.id, isSuperadmin });

  if (tenantContext.requiresSelection) {
    redirect("/auth/select-organization");
  }

  const tenant = tenantContext.selected;

  if (!tenant) {
    if (isSuperadmin) redirect("/superadmin/dashboard");
    await logAccessDeniedEvent({
      area: "company",
      reasonCode: AUDIT_REASON_CODES.MISSING_ACTIVE_MEMBERSHIP,
      requiredRole: "company_admin|manager|employee",
      pathHint: "/app/*",
    });
    redirect("/auth/login?error=" + encodeURIComponent("Tu usuario no tiene acceso asignado a una empresa"));
  }

  const moduleAccess = await isTenantModuleEnabled(tenant.organizationId, moduleCode);
  if (moduleAccess.hasError || !moduleAccess.enabled) {
    await logModuleAccessDeniedEvent({
      organizationId: tenant.organizationId,
      branchId: tenant.branchId,
      moduleCode,
      pathHint: "/app/*",
      reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
    });
    redirect("/app/dashboard?status=error&message=" + encodeURIComponent(MODULE_DISABLED_COPY));
  }

  return tenant;
}

export async function requireEmployeeModule(moduleCode: string) {
  const tenant = await requireEmployeeAccess();
  const moduleAccess = await isTenantModuleEnabled(tenant.organizationId, moduleCode);

  if (moduleAccess.hasError || !moduleAccess.enabled) {
    await logModuleAccessDeniedEvent({
      organizationId: tenant.organizationId,
      branchId: tenant.branchId,
      moduleCode,
      pathHint: "/portal/*",
      reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
    });
    redirect(
      "/portal/home?status=error&message=" +
        encodeURIComponent(MODULE_DISABLED_COPY),
    );
  }

  return tenant;
}

export async function assertTenantModuleApi(
  moduleCode: string,
  options?: { allowBillingBypass?: boolean },
): Promise<TenantModuleApiAccessResult> {
  const user = await getCurrentUser();

  if (!user) {
    await logAccessDeniedEvent({
      area: "auth",
      reasonCode: AUDIT_REASON_CODES.MISSING_AUTH_SESSION,
      pathHint: "/api/*",
    });

    return {
      ok: false,
      status: 401,
      error: "No autenticado",
      reasonCode: AUDIT_REASON_CODES.MISSING_AUTH_SESSION,
    };
  }

  if (userMustChangePassword(user)) {
    return {
      ok: false,
      status: 409,
      error: "password_change_required",
      reasonCode: AUDIT_REASON_CODES.MISSING_AUTH_SESSION,
    };
  }

  const isSuperadmin = await isCurrentUserSuperadmin();
  const tenantContext = await resolveTenantFromCookie({
    userId: user.id,
    isSuperadmin,
  });

  if (tenantContext.requiresSelection) {
    return {
      ok: false,
      status: 409,
      error: "organization_selection_required",
      reasonCode: AUDIT_REASON_CODES.MISSING_ACTIVE_MEMBERSHIP,
    };
  }

  const tenant = tenantContext.selected;

  if (!tenant) {
    await logAccessDeniedEvent({
      area: "company",
      reasonCode: AUDIT_REASON_CODES.MISSING_ACTIVE_MEMBERSHIP,
      requiredRole: "company_admin|manager|employee",
      pathHint: "/api/*",
    });

    return {
      ok: false,
      status: 403,
      error: "Sin tenant activo",
      reasonCode: AUDIT_REASON_CODES.MISSING_ACTIVE_MEMBERSHIP,
    };
  }

  if (!options?.allowBillingBypass) {
    const supabase = await createSupabaseServerClient();
    const billingGate = await getBillingGateForOrganization({
      supabase,
      organizationId: tenant.organizationId,
    });

    if (billingGate.isBlocked) {
      await logAccessDeniedEvent({
        area: "company",
        reasonCode: AUDIT_REASON_CODES.BILLING_REQUIRED_FOR_TENANT,
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        requiredRole: "company_admin|manager",
        pathHint: "/api/company/*",
      });

      return {
        ok: false,
        status: 402,
        error: "billing_required_for_tenant",
        reasonCode: AUDIT_REASON_CODES.BILLING_REQUIRED_FOR_TENANT,
      };
    }
  }

  const moduleAccess = await isTenantModuleEnabled(tenant.organizationId, moduleCode);

  if (moduleAccess.hasError || !moduleAccess.enabled) {
    await logModuleAccessDeniedEvent({
      organizationId: tenant.organizationId,
      branchId: tenant.branchId,
      moduleCode,
      pathHint: "/api/*",
      reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
    });

    return {
      ok: false,
      status: 403,
      error: "module_disabled_for_tenant",
      reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
    };
  }

  return {
    ok: true,
    tenant,
    userId: user.id,
  };
}

export async function assertCompanyManagerModuleApi(
  moduleCode: string,
  options?: { allowBillingBypass?: boolean },
) {
  const moduleAccess = await assertTenantModuleApi(moduleCode, {
    allowBillingBypass: options?.allowBillingBypass,
  });

  if (!moduleAccess.ok) {
    return moduleAccess;
  }

  if (
    moduleAccess.tenant.roleCode !== "company_admin" &&
    moduleAccess.tenant.roleCode !== "manager"
  ) {
    await logAccessDeniedEvent({
      area: "company",
      reasonCode: AUDIT_REASON_CODES.MISSING_COMPANY_ROLE,
      organizationId: moduleAccess.tenant.organizationId,
      branchId: moduleAccess.tenant.branchId,
      requiredRole: "company_admin|manager",
      pathHint: "/api/company/*",
    });

    return {
      ok: false as const,
      status: 403 as const,
      error: "Sin permisos de gestion",
      reasonCode: AUDIT_REASON_CODES.MISSING_COMPANY_ROLE,
    };
  }

  return moduleAccess;
}

export async function requireCompanyAccess() {
  const user = await requireAuthenticatedUser();

  if (userMustChangePassword(user)) {
    redirect("/auth/change-password?reason=first_login");
  }

  const isSuperadmin = await isCurrentUserSuperadmin();
  const context = await resolveTenantFromCookie({
    roleCodes: ["company_admin", "manager"],
    userId: user.id,
    isSuperadmin,
  });

  if (context.requiresSelection) {
    redirect("/auth/select-organization?mode=company");
  }

  const companyMembership = context.selected;

  if (!companyMembership) {
    const fallbackMembership = context.memberships[0];
    await logAccessDeniedEvent({
      area: "company",
      reasonCode: AUDIT_REASON_CODES.MISSING_COMPANY_ROLE,
      organizationId: fallbackMembership?.organizationId ?? null,
      branchId: fallbackMembership?.branchId ?? null,
      requiredRole: "company_admin|manager",
      pathHint: "/app/*",
    });
    redirect(
      "/portal/home?status=error&message=" +
        encodeURIComponent("Tu usuario no tiene acceso al panel de empresa"),
    );
  }

  await markInvitedAdminFirstLoginIfNeeded({
    organizationId: companyMembership.organizationId,
    userId: user.id,
    email: user.email,
  });

  return companyMembership;
}

export async function requireEmployeeAccess() {
  const user = await requireAuthenticatedUser();

  if (userMustChangePassword(user)) {
    redirect("/auth/change-password?reason=first_login");
  }

  const isSuperadmin = await isCurrentUserSuperadmin();
  const context = await resolveTenantFromCookie({
    roleCodes: ["employee"],
    userId: user.id,
    isSuperadmin,
  });

  if (context.requiresSelection) {
    redirect("/auth/select-organization?mode=employee");
  }

  const employeeMembership = context.selected;

  if (!employeeMembership) {
    const fallbackMembership = context.memberships[0];
    await logAccessDeniedEvent({
      area: "employee",
      reasonCode: AUDIT_REASON_CODES.MISSING_EMPLOYEE_ROLE,
      organizationId: fallbackMembership?.organizationId ?? null,
      branchId: fallbackMembership?.branchId ?? null,
      requiredRole: "employee",
      pathHint: "/portal/*",
    });
    redirect(
      "/app/dashboard?status=error&message=" +
        encodeURIComponent("Tu usuario no tiene acceso al portal de empleado"),
    );
  }

  return employeeMembership;
}
