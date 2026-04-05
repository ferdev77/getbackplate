import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireAuthenticatedUser, requireEmployeeAccess } from "@/shared/lib/access";
import { EmployeeShell } from "@/shared/ui/employee-shell";
import {
  getEnabledModulesCached,
  getOrganizationSettingsCached,
  getOrganizationByIdCached,
} from "@/modules/organizations/cached-queries";

export async function generateMetadata(): Promise<Metadata> {
  let tenant;
  try {
    tenant = await requireEmployeeAccess();
  } catch {
    return {};
  }

  const [organization, orgSettings, enabledModules] = await Promise.all([
    getOrganizationByIdCached(tenant.organizationId),
    getOrganizationSettingsCached(tenant.organizationId),
    getEnabledModulesCached(tenant.organizationId),
  ]);

  const customBranding = enabledModules.includes("custom_branding");

  if (customBranding && (organization?.name || orgSettings?.company_favicon_url)) {
    return {
      title: {
        template: `%s | ${organization?.name ?? "Portal"}`,
        default: organization?.name ?? "Portal",
      },
      icons: orgSettings?.company_favicon_url
        ? {
            icon: [
              { url: orgSettings.company_favicon_url },
            ],
          }
        : undefined,
    };
  }

  return {};
}

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();

  const organizationPromise = getOrganizationByIdCached(tenant.organizationId);
  const settingsPromise = getOrganizationSettingsCached(tenant.organizationId);

  const [{ data: employee }, { data: branch }, organizationData] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, position, department_id, branch_id")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    (tenant.branchId ?? null)
      ? supabase
          .from("branches")
          .select("name, city")
          .eq("organization_id", tenant.organizationId)
          .eq("id", tenant.branchId ?? null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    organizationPromise,
  ]);

  const brandingSettings = await settingsPromise;

  const { data: department } = employee?.department_id
    ? await supabase
        .from("organization_departments")
        .select("name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", employee.department_id)
        .maybeSingle()
    : { data: null };

  const employeeBranchId = tenant.branchId ?? employee?.branch_id ?? null;

  const resolvedBranch = employeeBranchId
    ? await supabase
        .from("branches")
        .select("name, city")
        .eq("organization_id", tenant.organizationId)
        .eq("id", employeeBranchId)
        .maybeSingle()
    : { data: null };

  const enabledModulesArr = await getEnabledModulesCached(tenant.organizationId);
  const enabledModuleCodes = new Set(enabledModulesArr);

  const isDocumentsEnabled = enabledModuleCodes.has("documents");
  const isChecklistEnabled = enabledModuleCodes.has("checklists");
  const isAnnouncementsEnabled = enabledModuleCodes.has("announcements");
  const isOnboardingEnabled = enabledModuleCodes.has("onboarding");

  const docsCount = 0;

  const employeeName = employee
    ? `${employee.first_name} ${employee.last_name}`.trim()
    : (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) || user.email || "Empleado";

  const checklistTemplateNames: string[] = [];

  return (
    <EmployeeShell
      organizationId={tenant.organizationId}
      userId={user.id}
      employeeId={employee?.id ?? null}
      organizationName={organizationData?.name ?? "Empresa"}
      employeeName={employeeName}
      employeePosition={employee?.position ?? null}
      branchName={(() => {
        const b = resolvedBranch.data ?? branch;
        if (!b) return null;
        return enabledModuleCodes.has("custom_branding") && b.city ? b.city : b.name;
      })()}
      departmentName={department?.name ?? null}
      docsCount={docsCount}
      checklistTemplateNames={checklistTemplateNames}
      enabledModules={{
        documents: isDocumentsEnabled,
        checklists: isChecklistEnabled,
        announcements: isAnnouncementsEnabled,
        onboarding: isOnboardingEnabled,
      }}
      customBrandingEnabled={enabledModuleCodes.has("custom_branding")}
      companyLogoUrl={brandingSettings?.company_logo_url ?? ""}
    >
      {children}
    </EmployeeShell>
  );
}
