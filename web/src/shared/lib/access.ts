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

export const MODULE_DISABLED_COPY = "Este modulo no esta incluido en tu plan actual.";

type TenantModuleApiAccessResult =
  | {
      ok: true;
      tenant: MembershipContext;
      userId: string;
    }
  | {
      ok: false;
      status: 401 | 403 | 409;
      error: string;
      reasonCode: string;
    };

async function resolveTenantFromCookie(options?: {
  roleCodes?: string[];
}) {
  const memberships = await getCurrentUserMemberships();
  const filteredMemberships = options?.roleCodes?.length
    ? memberships.filter((row) => options.roleCodes?.includes(row.roleCode))
    : memberships;

  const preferredOrganizationId = await getActiveOrganizationIdFromCookie();
  const resolved = resolvePreferredMembership(filteredMemberships, preferredOrganizationId);

  return {
    memberships,
    filteredMemberships,
    preferredOrganizationId,
    selected: resolved.selected,
    requiresSelection: resolved.requiresSelection,
  };
}

async function isTenantModuleEnabled(organizationId: string, moduleCode: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_module_enabled", {
    org_id: organizationId,
    module_code: moduleCode,
  });

  return {
    enabled: Boolean(data),
    hasError: Boolean(error),
  };
}

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

export async function requireTenantContext() {
  await requireAuthenticatedUser();
  const tenantContext = await resolveTenantFromCookie();

  if (tenantContext.requiresSelection) {
    redirect("/auth/select-organization");
  }

  const tenant = tenantContext.selected;

  if (!tenant) {
    const isSuperadmin = await isCurrentUserSuperadmin();

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
  const tenant = await requireTenantContext();

  const moduleAccess = await isTenantModuleEnabled(tenant.organizationId, moduleCode);

  if (moduleAccess.hasError || !moduleAccess.enabled) {
    await logModuleAccessDeniedEvent({
      organizationId: tenant.organizationId,
      branchId: tenant.branchId,
      moduleCode,
      pathHint: "/app/*",
      reasonCode: AUDIT_REASON_CODES.MODULE_DISABLED_FOR_TENANT,
    });
    redirect(
      "/app/dashboard?status=error&message=" +
        encodeURIComponent(MODULE_DISABLED_COPY),
    );
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

export async function assertTenantModuleApi(moduleCode: string): Promise<TenantModuleApiAccessResult> {
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

  const tenantContext = await resolveTenantFromCookie();

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

export async function assertCompanyManagerModuleApi(moduleCode: string) {
  const moduleAccess = await assertTenantModuleApi(moduleCode);

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
  await requireAuthenticatedUser();
  const context = await resolveTenantFromCookie({
    roleCodes: ["company_admin", "manager"],
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

  return companyMembership;
}

export async function requireEmployeeAccess() {
  await requireAuthenticatedUser();
  const context = await resolveTenantFromCookie({
    roleCodes: ["employee"],
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
