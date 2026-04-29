import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { ClipboardPlus } from "lucide-react";
import { EmployeeChecklistWorkspace } from "@/modules/checklists/ui/employee-checklist-workspace";
import { RestoreChecklistScroll } from "@/modules/checklists/ui/restore-checklist-scroll";
import { ChecklistCreateTrigger } from "@/modules/checklists/ui/checklist-create-trigger";
import { requireEmployeeModule } from "@/shared/lib/access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { getBranchDisplayName } from "@/shared/lib/branch-display";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";
import { resolveEmployeeLocationScope } from "@/shared/lib/employee-location-scope";

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
    .select("department_id, branch_id, all_locations, position")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: membershipRows } = await supabase
    .from("memberships")
    .select("branch_id, all_locations")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(20);

  const locationScope = await resolveEmployeeLocationScope(supabase, tenant.organizationId, {
    tenantBranchId: tenant.branchId,
    employeeBranchId: employeeRow?.branch_id ?? null,
    membershipRows,
    employeeAllLocations: employeeRow?.all_locations ?? false,
  });
  const employeeBranchId = locationScope.primaryLocationId;
  const allowedLocationIds = locationScope.locationIds;
  const locationHelperText =
    "Tu alcance base queda limitado a tus locaciones asignadas. Departamento y puesto filtran dentro de ese alcance.";

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
      branchIds: allowedLocationIds,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      templateBranchId: template.branch_id,
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

  const { data: myCreatedTemplates } = canCreate
    ? await admin
        .from("checklist_templates")
        .select("id, name, created_at, checklist_type, shift, repeat_every, is_active, target_scope")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] };

  const myCreatedTemplateIds = (myCreatedTemplates ?? []).map((row) => row.id);
  const { data: mySections } = myCreatedTemplateIds.length
    ? await admin
        .from("checklist_template_sections")
        .select("id, template_id, name, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("template_id", myCreatedTemplateIds)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<{ id: string; template_id: string; name: string; sort_order: number }> };

  const mySectionIds = (mySections ?? []).map((row) => row.id);
  const { data: myItems } = mySectionIds.length
    ? await admin
        .from("checklist_template_items")
        .select("id, section_id, label, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("section_id", mySectionIds)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<{ id: string; section_id: string; label: string; sort_order: number }> };

  const itemsBySectionId = new Map<string, string[]>();
  for (const item of myItems ?? []) {
    const current = itemsBySectionId.get(item.section_id) ?? [];
    itemsBySectionId.set(item.section_id, [...current, item.label]);
  }

  const sectionsByTemplateId = new Map<string, Array<{ name: string; items: string[] }>>();
  for (const section of mySections ?? []) {
    const current = sectionsByTemplateId.get(section.template_id) ?? [];
    current.push({
      name: section.name,
      items: itemsBySectionId.get(section.id) ?? [],
    });
    sectionsByTemplateId.set(section.template_id, current);
  }

  const myCreatedWorkspaceData = (myCreatedTemplates ?? []).map((template) => {
    const templateSections = sectionsByTemplateId.get(template.id) ?? [];
    return {
      id: template.id,
      name: template.name,
      checklist_type: template.checklist_type,
      shift: template.shift,
      repeat_every: template.repeat_every,
      is_active: template.is_active,
      target_scope:
        typeof template.target_scope === "object" && template.target_scope !== null
          ? (template.target_scope as Record<string, string[]>)
          : {},
      templateSections,
      items: templateSections.flatMap((section) => section.items),
    };
  });

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

  const scopeUsersInAllowedLocations = scopeUsers.filter(
    (user) => Boolean(user.user_id) && Boolean(user.branch_id) && allowedLocationIds.includes(user.branch_id as string),
  );

  return (
    <main>
      <RestoreChecklistScroll />
      <OperationHeaderCard
        eyebrow="Operación diaria"
        title="Mis Checklists"
        description="Completa tus checklists asignados y gestiona los que creaste con vista previa, edición y eliminación."
        action={canCreate ? (
          <ChecklistCreateTrigger
            className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white hover:bg-[var(--gbp-accent)]"
            branches={(branches ?? []).map((branch) => ({
              ...branch,
              name: getBranchDisplayName(branch, customBrandingEnabled),
            }))}
            departments={departments ?? []}
            positions={positions ?? []}
            users={scopeUsersInAllowedLocations}
            submitEndpoint="/api/employee/checklists/templates"
            basePath="/portal/checklist"
            allowedLocationIds={allowedLocationIds}
            lockLocationSelection
            locationHelperText={locationHelperText}
          >
            <ClipboardPlus className="h-4 w-4" /> Nuevo Checklist
          </ChecklistCreateTrigger>
        ) : null}
      />

      <EmployeeChecklistWorkspace
        templates={templatesWorkspaceData}
        initialPreviewTemplateId={previewTemplateId}
        createdTemplates={myCreatedWorkspaceData}
        canViewCreated={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        branches={(branches ?? []).map((branch) => ({
          ...branch,
          name: getBranchDisplayName(branch, customBrandingEnabled),
        }))}
        departments={departments ?? []}
        positions={positions ?? []}
        users={scopeUsersInAllowedLocations}
        allowedLocationIds={allowedLocationIds}
        lockLocationSelection
        locationHelperText={locationHelperText}
      />
    </main>
  );
}
