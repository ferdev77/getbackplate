import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getEnabledModules } from "@/modules/organizations/queries";
import { requireAuthenticatedUser, requireEmployeeAccess } from "@/shared/lib/access";
import { EmployeeShell } from "@/shared/ui/employee-shell";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();

  const [{ data: employee }, { data: branch }, { data: organization }] = await Promise.all([
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
    supabase
      .from("organizations")
      .select("name")
      .eq("id", tenant.organizationId)
      .maybeSingle(),
  ]);

  const { data: brandingSettings } = await supabase
    .from("organization_settings")
    .select("company_logo_url")
    .eq("organization_id", tenant.organizationId)
    .maybeSingle();

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

  const enabledModuleCodes = await getEnabledModules(tenant.organizationId);

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
      organizationName={organization?.name ?? "Empresa"}
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
