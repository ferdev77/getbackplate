import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { EmployeeChecklistWorkspace } from "@/modules/checklists/ui/employee-checklist-workspace";
import { RestoreChecklistScroll } from "@/modules/checklists/ui/restore-checklist-scroll";
import { requireEmployeeModule } from "@/shared/lib/access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { getBranchDisplayName } from "@/shared/lib/branch-display";

type EmployeeChecklistPageProps = {
  searchParams: Promise<{ preview?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function EmployeeChecklistPage({ searchParams }: EmployeeChecklistPageProps) {
  const tenant = await requireEmployeeModule("checklists");
  const params = await searchParams;
  const previewTemplateId = firstParam(params.preview).trim();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return null;
  }

  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );
  const canCreate = delegatedPermissions.checklists.create;
  const canEdit = delegatedPermissions.checklists.edit;
  const canDelete = delegatedPermissions.checklists.delete;
  const enabledModulesSet = new Set(await getEnabledModulesCached(tenant.organizationId));
  const customBrandingEnabled = enabledModulesSet.has("custom_branding");

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("department_id, branch_id, position")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const employeeBranchId = tenant.branchId ?? employeeRow?.branch_id ?? null;

  let employeePositionIds: string[] = [];
  if (employeeRow?.position) {
    const { data: positionRows } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .eq("name", employeeRow.position)
      .limit(20);

    employeePositionIds = (positionRows ?? []).map((row) => row.id);
  }

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("id, name, branch_id, department_id, target_scope, updated_at")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  const visibleTemplates = (templates ?? []).filter((template) =>
    canUseChecklistTemplateInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      templateBranchId: template.branch_id,
      templateDepartmentId: template.department_id,
      targetScope: template.target_scope,
    }),
  );

  const visibleTemplateIds = visibleTemplates.map((template) => template.id);
  const [{ data: visibleSubmissions }, { data: scheduledJobs }] = visibleTemplateIds.length
    ? await Promise.all([
        admin
          .from("checklist_submissions")
          .select("template_id, status, submitted_at")
          .eq("organization_id", tenant.organizationId)
          .eq("submitted_by", userId)
          .in("template_id", visibleTemplateIds)
          .order("submitted_at", { ascending: false }),
        admin
          .from("scheduled_jobs")
          .select("target_id, last_run_at")
          .eq("organization_id", tenant.organizationId)
          .eq("job_type", "checklist_generator")
          .in("target_id", visibleTemplateIds)
      ])
    : [{ data: null }, { data: null }];

  const lastRunByTemplateId = new Map<string, Date | null>();
  for (const job of scheduledJobs ?? []) {
    lastRunByTemplateId.set(job.target_id, job.last_run_at ? new Date(job.last_run_at) : null);
  }

  const latestSubmissionByTemplateId = new Map<string, { status: string; submittedAt: string | null }>();
  for (const row of visibleSubmissions ?? []) {
    if (!latestSubmissionByTemplateId.has(row.template_id)) {
      latestSubmissionByTemplateId.set(row.template_id, {
        status: row.status,
        submittedAt: row.submitted_at,
      });
    }
  }

  function isTemplateSentForCurrentPeriod(templateId: string) {
    const latest = latestSubmissionByTemplateId.get(templateId);
    if (!latest) return false;
    
    // If there is no scheduled job or it hasn't run yet, just knowing it was submitted once is enough
    const lastRunAt = lastRunByTemplateId.get(templateId);
    if (!lastRunAt) return true;

    // It's sent for the current period if the last submission was AFTER the last cron run
    const submittedAt = new Date(latest.submittedAt || 0);
    return submittedAt >= lastRunAt;
  }

  const templatesForDisplay = [...visibleTemplates].sort((a, b) => {
    const aSent = isTemplateSentForCurrentPeriod(a.id);
    const bSent = isTemplateSentForCurrentPeriod(b.id);
    if (aSent === bSent) return 0;
    return aSent ? 1 : -1;
  });

  const templatesWorkspaceData = templatesForDisplay.map((template) => {
    const latest = latestSubmissionByTemplateId.get(template.id);
    return {
      id: template.id,
      name: template.name,
      sent: isTemplateSentForCurrentPeriod(template.id),
      submissionStatus: latest?.status ?? null,
      submittedAt: latest?.submittedAt ?? null,
    };
  });

  const { data: myCreatedTemplates } = await supabase
    .from("checklist_templates")
    .select("id, name, created_at")
    .eq("organization_id", tenant.organizationId)
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(40);

  const myCreatedTemplateIds = (myCreatedTemplates ?? []).map((row) => row.id);
  const { data: mySections } = myCreatedTemplateIds.length
    ? await supabase
        .from("checklist_template_sections")
        .select("id, template_id")
        .eq("organization_id", tenant.organizationId)
        .in("template_id", myCreatedTemplateIds)
    : { data: [] as Array<{ id: string; template_id: string }> };

  const mySectionIds = (mySections ?? []).map((row) => row.id);
  const { data: myItems } = mySectionIds.length
    ? await supabase
        .from("checklist_template_items")
        .select("id, section_id, label")
        .eq("organization_id", tenant.organizationId)
        .in("section_id", mySectionIds)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<{ id: string; section_id: string; label: string }> };

  const sectionByTemplate = new Map<string, string[]>();
  for (const section of mySections ?? []) {
    const labels = (myItems ?? [])
      .filter((item) => item.section_id === section.id)
      .map((item) => item.label)
      .filter(Boolean);
    const current = sectionByTemplate.get(section.template_id) ?? [];
    sectionByTemplate.set(section.template_id, [...current, ...labels]);
  }

  const myCreatedWorkspaceData = (myCreatedTemplates ?? []).map((template) => ({
    id: template.id,
    name: template.name,
    items: sectionByTemplate.get(template.id) ?? [],
  }));

  const [{ data: branches }, { data: departments }, { data: positions }, scopeUsers] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    buildScopeUsersCatalog(tenant.organizationId),
  ]);

  return (
    <main>
      <RestoreChecklistScroll />
      <section className="mb-5 rounded-2xl border border-[var(--gbp-border)] bg-gradient-to-r from-[var(--gbp-surface)] to-[var(--gbp-bg)] p-6">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--gbp-text2)] uppercase">Checklist asignado</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Tus checklists visibles</h1>
          <span className="inline-flex rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-3 py-1 text-xs font-semibold text-[var(--gbp-accent)]">
            {visibleTemplates.length} visible(s)
          </span>
        </div>
      </section>

      <EmployeeChecklistWorkspace
        templates={templatesWorkspaceData}
        initialPreviewTemplateId={previewTemplateId}
        createdTemplates={myCreatedWorkspaceData}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        branches={(branches ?? []).map((branch) => ({
          ...branch,
          name: getBranchDisplayName(branch, customBrandingEnabled),
        }))}
        departments={departments ?? []}
        positions={positions ?? []}
        users={scopeUsers}
      />
    </main>
  );
}
