import { ClipboardPlus } from "lucide-react";
import { ChecklistsListWorkspace } from "@/modules/checklists/ui/checklists-list-workspace";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { ChecklistCreateTrigger } from "@/modules/checklists/ui/checklist-create-trigger";
import { ChecklistUpsertModal } from "@/modules/checklists/ui/checklist-upsert-modal";
import { ChecklistPreviewModalRoute } from "@/modules/checklists/ui/checklist-preview-modal-route";
import {
  obtenerHistorialDeRepartos,
  puedeVerHistorialDeRepartos,
} from "@/modules/checklists/services/checklist-delivery-history.service";
import { ChecklistDeleteModal } from "@/modules/checklists/ui/checklist-delete-modal";
import { EmployeeChecklistRealtimeRefresh } from "@/modules/checklists/ui/employee-checklist-realtime-refresh";
import { requireTenantModule } from "@/shared/lib/access";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { SlideUp } from "@/shared/ui/animations";
import { resolveAnnouncementAuthorNames } from "@/shared/lib/announcement-authors";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";
import { PageContent } from "@/shared/ui/page-content";
import { hasMissingColumnError } from "@/shared/lib/supabase-compat";

type CompanyChecklistsPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    message?: string | string[];
    action?: string | string[];
    modal?: string | string[];
    templateId?: string | string[];
    q?: string | string[];
    type?: string | string[];
    loc?: string | string[];
    preview?: string | string[];
    delete?: string | string[];
  }>;
};

const TEXT_STRONG = "text-[var(--gbp-text)]";
const TEXT_MUTED = "text-[var(--gbp-text2)]";
const CARD = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]";
const CARD_SOFT = "border-[var(--gbp-border)] bg-[var(--gbp-bg)]";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function CompanyChecklistsPage({ searchParams }: CompanyChecklistsPageProps) {
  const tenant = await requireTenantModule("checklists");
  const params = await searchParams;
  const action = firstParam(params.action).trim().toLowerCase();
  const modal = firstParam(params.modal).trim().toLowerCase();
  const openCreateModal =
    action === "create" ||
    action === "new" ||
    action === "create-checklist" ||
    action === "new-checklist" ||
    action === "edit" ||
    action === "nuevo" ||
    modal === "checklist-create";
  const q = firstParam(params.q).trim().toLowerCase();
  const typeFilter = firstParam(params.type).trim().toLowerCase();
  const locFilter = firstParam(params.loc).trim();
  const previewTemplateId = firstParam(params.preview).trim();
  const deleteTemplateId = firstParam(params.delete).trim();
  const templateId = firstParam(params.templateId).trim();

  const supabase = await createSupabaseServerClient();

  const fetchOrderedBranches = async () => {
    const primary = await supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return { data: primary.data };

    return supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });
  };

  const fetchOrderedDepartments = async () => {
    const primary = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return { data: primary.data };

    return supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });
  };

  const fetchOrderedPositions = async () => {
    const primary = await supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return { data: primary.data };

    return supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("name", { ascending: true });
  };

  const [
    { data: branches },
    { data: templates },
    { data: departments },
    { data: positions },
    { count: completedCount },
    { count: pendingCount },
    { data: scheduledJobs },
  ] = await Promise.all([
    fetchOrderedBranches(),
    supabase
      .from("checklist_templates")
      .select("id, name, checklist_type, is_active, branch_id, shift, department, department_id, repeat_every, target_scope, created_at, created_by")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(80),
    fetchOrderedDepartments(),
    fetchOrderedPositions(),
    supabase
      .from("checklist_submissions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", tenant.organizationId)
      .eq("status", "reviewed"),
    supabase
      .from("checklist_submissions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", tenant.organizationId)
      .eq("status", "submitted"),
    supabase
      .from("scheduled_jobs")
      .select("target_id, recurrence_type, custom_days, cron_expression")
      .eq("organization_id", tenant.organizationId)
      .eq("job_type", "checklist_generator")
  ]);

  const templateIds = (templates ?? []).map((template) => template.id);

  const { data: sections } = templateIds.length > 0
    ? await supabase
        .from("checklist_template_sections")
        .select("id, template_id, name, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("template_id", templateIds)
        .order("sort_order")
    : { data: [] };

  const sectionIds = (sections ?? []).map((s) => s.id);

  const { data: items } = sectionIds.length > 0
    ? await supabase
        .from("checklist_template_items")
        .select("id, section_id, label, priority, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("section_id", sectionIds)
        .order("sort_order")
    : { data: [] };

  const scopedUsers = await buildScopeUsersCatalog(tenant.organizationId);

  if (scopedUsers.some((row) => row.first_name === "Usuario" && row.user_id)) {
    try {
      const admin = createSupabaseAdminClient();
      const unnamedUsers = scopedUsers.filter((u) => u.user_id && u.first_name === "Usuario");
      await Promise.all(
        unnamedUsers.map(async (user) => {
          try {
            const { data } = await admin.auth.admin.getUserById(user.user_id!);
            if (!data?.user) return;
            const fullName =
              typeof data.user.user_metadata?.full_name === "string"
                ? data.user.user_metadata.full_name.trim()
                : "";
            if (fullName) {
              const [firstName = "Usuario", ...rest] = fullName.split(/\s+/);
              user.first_name = firstName;
              user.last_name = rest.join(" ");
            } else {
              user.first_name = data.user.email ?? user.first_name;
              user.last_name = "";
            }
          } catch {
            // fallback
          }
        }),
      );
    } catch {
      // fallback
    }
  }

  const enabledModulesArr = await getEnabledModulesCached(tenant.organizationId);
  const enabledModules = new Set(enabledModulesArr);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const checklistAuthorIds = Array.from(
    new Set(
      (templates ?? [])
        .map((template) => template.created_by)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const checklistAuthorNameMap = await resolveAnnouncementAuthorNames({
    organizationId: tenant.organizationId,
    authorIds: checklistAuthorIds,
  });

  const userNameById = new Map(
    scopedUsers
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, `${row.first_name} ${row.last_name}`.trim()]),
  );

  const mappedBranches = (branches ?? []).map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  const branchNameMap = new Map(mappedBranches.map((row) => [row.id, row.name]));
  const departmentNameMap = new Map((departments ?? []).map((row) => [row.id, row.name]));
  const positionNameMap = new Map((positions ?? []).map((row) => [row.id, row.name]));

  const sectionsByTemplate = new Map<string, Array<{ id: string; name: string; sort_order: number }>>();
  for (const section of sections ?? []) {
    const list = sectionsByTemplate.get(section.template_id) ?? [];
    list.push(section);
    sectionsByTemplate.set(section.template_id, list);
  }

  const itemsBySection = new Map<string, Array<{ id: string; label: string; priority: string; sort_order: number }>>();
  for (const item of items ?? []) {
    const list = itemsBySection.get(item.section_id) ?? [];
    list.push(item);
    itemsBySection.set(item.section_id, list);
  }

  const scheduledJobsByTemplateId = new Map(
    (scheduledJobs ?? []).map((job) => [job.target_id, job])
  );

  const templateRows = (templates ?? []).map((template) => {
    const templateSections = sectionsByTemplate.get(template.id) ?? [];
    const templateItems = templateSections.flatMap((section) => itemsBySection.get(section.id) ?? []);
    const sectionViews = templateSections.map((section) => ({
      id: section.id,
      name: section.name,
      items: (itemsBySection.get(section.id) ?? []).map((item) => ({ id: item.id, label: item.label })),
    }));
    const itemsCount = templateItems.length;

    const scope = typeof template.target_scope === "object" && template.target_scope !== null ? (template.target_scope as Record<string, string[]>) : {};
    const scopeLocationNames = Array.isArray(scope.locations) && scope.locations.length > 0
      ? scope.locations.map((id) => branchNameMap.get(id) ?? "Locación")
      : (template.branch_id ? [branchNameMap.get(template.branch_id) ?? "Locación"] : []);
    const explicitDepts = Array.isArray(scope.department_ids) ? [...scope.department_ids] : [];
    const explicitPositions = Array.isArray(scope.position_ids) ? [...scope.position_ids] : [];

    const scopeRoles: { name: string, type: "department" | "position" }[] = [];
    for (const dId of explicitDepts) {
      scopeRoles.push({ name: departmentNameMap.get(dId) ?? "Depto", type: "department" });
    }

    for (const pId of explicitPositions) {
      const p = positions?.find((pos) => pos.id === pId);
      if (p && p.department_id) {
        const dName = departmentNameMap.get(p.department_id) ?? "Depto";
        scopeRoles.push({ name: `${dName}: ${p.name}`, type: "position" });
      } else if (p) {
        scopeRoles.push({ name: p.name, type: "position" });
      }
    }

    if (scopeRoles.length === 0) {
      if (template.department_id) {
        scopeRoles.push({ name: departmentNameMap.get(template.department_id) ?? "Departamento", type: "department" });
      } else if (template.department) {
        scopeRoles.push({ name: template.department, type: "department" });
      }
    }

    return {
      ...template,
      itemsCount,
      templateItems,
      templateSections: sectionViews,
      scheduledJob: scheduledJobsByTemplateId.get(template.id) ?? null,
      scopeLocationNames,
      scopeRoles,
      branchName: template.branch_id ? branchNameMap.get(template.branch_id) ?? "Locación" : "Global",
      created_by_name: template.created_by ? checklistAuthorNameMap.get(template.created_by) ?? "Usuario" : "Sin autor",
    };
  });

  const editingTemplate = action === "edit" ? templateRows.find((row) => row.id === templateId) ?? null : null;
  const previewTemplate = previewTemplateId ? templateRows.find((row) => row.id === previewTemplateId) ?? null : null;

  const deletingTemplate = deleteTemplateId ? templateRows.find((row) => row.id === deleteTemplateId) ?? null : null;

  const totalTemplates = templates?.length ?? 0;
  const activeTemplates = (templates ?? []).filter((row) => row.is_active).length;
  const completed = completedCount ?? 0;
  const pending = pendingCount ?? 0;
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? "";

  // El historial de repartos solo lo ve un admin de empresa o quien creo el
  // checklist. `null` significa "sin permiso" y hace que la columna no exista;
  // una lista vacia significa "todavia no se repartio", que si se muestra.
  const visorDelHistorial = {
    userId: userId || null,
    esCompanyAdmin: tenant.roleCode === "company_admin",
  };
  const deliveryHistory =
    previewTemplate && puedeVerHistorialDeRepartos(visorDelHistorial, previewTemplate.created_by)
      ? await obtenerHistorialDeRepartos({
          organizationId: tenant.organizationId,
          templateId: previewTemplate.id,
          visor: visorDelHistorial,
          templateCreatedBy: previewTemplate.created_by,
        })
      : null;

  return (
    <PageContent>
      <EmployeeChecklistRealtimeRefresh organizationId={tenant.organizationId} userId={userId} />
      <SlideUp>
        <OperationHeaderCard
          eyebrow="Operación diaria"
          title="Mis Checklists"
          description="Gestiona plantillas de checklist, revisa su estado operativo y administra acciones de edición, vista previa y eliminación."
          className={CARD_SOFT}
          eyebrowClassName={`text-[11px] font-semibold tracking-[0.14em] uppercase ${TEXT_MUTED}`}
          titleClassName={`mt-1 text-2xl font-bold tracking-tight ${TEXT_STRONG}`}
          descriptionClassName={`mt-1 text-sm ${TEXT_MUTED}`}
          action={(
            <ChecklistCreateTrigger
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent)]"
              branches={mappedBranches}
              departments={departments ?? []}
              positions={positions ?? []}
              users={scopedUsers}
            >
              <ClipboardPlus className="h-4 w-4" /> Nuevo Checklist
            </ChecklistCreateTrigger>
          )}
        />
      </SlideUp>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Total Checklists</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{totalTemplates}</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Activos hoy</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{activeTemplates}</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Completados</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{completed}</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Pendientes</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{pending}</p></article>
        </div>
      </div>

      <ChecklistsListWorkspace
        templates={templateRows}
        branches={mappedBranches}
        departments={departments ?? []}
        positions={positions ?? []}
        users={scopedUsers}
        initialQuery={q}
        initialType={typeFilter}
        initialLocation={locFilter}
      />

      {previewTemplate ? (
        <ChecklistPreviewModalRoute
          templateName={previewTemplate.name}
          sections={(previewTemplate.templateSections ?? []).map((section) => ({
            id: section.id,
            name: section.name,
            items: section.items.map((item) => ({
              id: item.id,
              label: item.label,
              priority: "",
            })),
          }))}
          checklistType={previewTemplate.checklist_type}
          shift={previewTemplate.shift}
          // La frecuencia sale del reparto real, no de repeat_every: ese campo
          // dice 'daily' por defecto aunque el checklist no se reparta nunca.
          scheduledJob={previewTemplate.scheduledJob}
          isActive={previewTemplate.is_active}
          createdByName={previewTemplate.created_by_name ?? "Dirección"}
          scopeLabels={(() => {
            const scope =
              typeof previewTemplate.target_scope === "object" && previewTemplate.target_scope !== null
                ? (previewTemplate.target_scope as Record<string, string[]>)
                : {};
            return {
              locations: Array.isArray(scope.locations)
                ? scope.locations.map((id) => branchNameMap.get(id) ?? id)
                : [],
              departments: Array.isArray(scope.department_ids)
                ? scope.department_ids.map((id) => departmentNameMap.get(id) ?? id)
                : [],
              positions: Array.isArray(scope.position_ids)
                ? scope.position_ids.map((id) => positionNameMap.get(id) ?? id)
                : [],
              users: Array.isArray(scope.users)
                ? scope.users.map((id) => userNameById.get(id) ?? id)
                : [],
            };
          })()}
          deliveryHistory={deliveryHistory ?? undefined}
          closeHref="/app/checklists"
        />
      ) : null}

      {deletingTemplate ? (
        <ChecklistDeleteModal template={deletingTemplate} />
      ) : null}

      {openCreateModal ? (
        <ChecklistUpsertModal 
          branches={mappedBranches}
          departments={departments ?? []}
          positions={positions ?? []}
          users={scopedUsers}
          action={action}
          editingTemplate={editingTemplate}
        />
      ) : null}
    </PageContent>
  );
}
