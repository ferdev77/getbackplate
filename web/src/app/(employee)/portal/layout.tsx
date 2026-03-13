import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireAuthenticatedUser, requireEmployeeAccess } from "@/shared/lib/access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
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
          .select("name")
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
        .select("name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", employeeBranchId)
        .maybeSingle()
    : { data: null };

  let employeePositionIds: string[] = [];
  if (employee?.position) {
    const { data: positionRows } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .eq("name", employee.position)
      .limit(20);

    employeePositionIds = (positionRows ?? []).map((row) => row.id);
  }

  const [documentsModuleEnabled, checklistModuleEnabled, announcementsModuleEnabled, onboardingModuleEnabled] =
    await Promise.all([
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "documents",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "checklists",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "announcements",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "onboarding",
      }),
    ]);

  const isDocumentsEnabled = Boolean(documentsModuleEnabled.data);
  const isChecklistEnabled = Boolean(checklistModuleEnabled.data);
  const isAnnouncementsEnabled = Boolean(announcementsModuleEnabled.data);
  const isOnboardingEnabled = Boolean(onboardingModuleEnabled.data);

  let docsCount = 0;

  if (isDocumentsEnabled) {
    const { data: documents } = await supabase
      .from("documents")
      .select("id, branch_id, access_scope")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(300);

    const assignedDocumentIds = new Set<string>();
    if (employee?.id) {
      const { data: links } = await supabase
        .from("employee_documents")
        .select("document_id")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employee.id);

      for (const link of links ?? []) {
        assignedDocumentIds.add(link.document_id);
      }
    }

    docsCount = (documents ?? []).filter((doc) =>
      canReadDocumentInTenant({
        roleCode: tenant.roleCode,
        userId: user.id,
        branchId: employeeBranchId,
        departmentId: employee?.department_id ?? null,
        positionIds: employeePositionIds,
        isDirectlyAssigned: assignedDocumentIds.has(doc.id),
        accessScope: doc.access_scope,
      }),
    ).length;
  }

  const employeeName = employee
    ? `${employee.first_name} ${employee.last_name}`.trim()
    : (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) || user.email || "Empleado";

  let checklistTemplateNames: string[] = [];
  if (isChecklistEnabled) {
    const { data: templates } = await supabase
      .from("checklist_templates")
      .select("id, name, branch_id, department_id, target_scope, updated_at")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(100);

    checklistTemplateNames = (templates ?? [])
      .filter((template) =>
        canUseChecklistTemplateInTenant({
          roleCode: tenant.roleCode,
          userId: user.id,
          branchId: employeeBranchId,
          departmentId: employee?.department_id ?? null,
          positionIds: employeePositionIds,
          templateBranchId: template.branch_id,
          templateDepartmentId: template.department_id,
          targetScope: template.target_scope,
        }),
      )
      .map((template) => template.name);
  }

  return (
    <EmployeeShell
      organizationName={organization?.name ?? "Empresa"}
      employeeName={employeeName}
      employeePosition={employee?.position ?? null}
      branchName={resolvedBranch.data?.name ?? branch?.name ?? null}
      departmentName={department?.name ?? null}
      docsCount={docsCount}
      checklistTemplateNames={checklistTemplateNames}
      enabledModules={{
        documents: isDocumentsEnabled,
        checklists: isChecklistEnabled,
        announcements: isAnnouncementsEnabled,
        onboarding: isOnboardingEnabled,
      }}
    >
      {children}
    </EmployeeShell>
  );
}
