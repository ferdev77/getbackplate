import Link from "next/link";
import { ClipboardPlus } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { ChecklistsListWorkspace } from "@/modules/checklists/ui/checklists-list-workspace";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { ChecklistCreateTrigger } from "@/modules/checklists/ui/checklist-create-trigger";
import { ChecklistEditTrigger } from "@/modules/checklists/ui/checklist-edit-trigger";
import { ChecklistUpsertModal } from "@/modules/checklists/ui/checklist-upsert-modal";
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
const BTN_GHOST = "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_NEUTRAL = `group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border ${BTN_GHOST}`;
const ACTION_BTN_PREVIEW = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-success)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-success-soft)] [.theme-dark-pro_&]:text-[var(--gbp-success)]";
const ACTION_BTN_DANGER = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function typeLabel(type: string) {
  if (type === "opening") return "Apertura";
  if (type === "closing") return "Cierre";
  if (type === "prep") return "Prep";
  return "Custom";
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
      items: (itemsBySection.get(section.id) ?? []).map((item) => item.label),
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

  const filteredTemplates = templateRows.filter((row) => {
    const byQ = !q || row.name.toLowerCase().includes(q);
    const byType = !typeFilter || row.checklist_type === typeFilter;
    const byLoc = !locFilter || row.branch_id === locFilter;
    return byQ && byType && byLoc;
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <SlideUp className="flex max-h-[88vh] w-[720px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Vista previa · {previewTemplate.name}</p>
              <Link href="/app/checklists" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">✕</Link>
            </div>
            <div className="max-h-[68vh] space-y-3 overflow-y-auto px-6 py-5">
              <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Metadata</p>
                <div className="grid gap-2 text-xs text-[var(--gbp-text2)] sm:grid-cols-2">
                  <p><span className="font-semibold text-[var(--gbp-text)]">Tipo:</span> {typeLabel(previewTemplate.checklist_type)}</p>
                  <p><span className="font-semibold text-[var(--gbp-text)]">Shift:</span> {previewTemplate.shift || "-"}</p>
                  <p><span className="font-semibold text-[var(--gbp-text)]">Frecuencia:</span> {previewTemplate.repeat_every || "-"}</p>
                  <p><span className="font-semibold text-[var(--gbp-text)]">Estado:</span> {previewTemplate.is_active ? "Activo" : "Inactivo"}</p>
                  <p className="sm:col-span-2"><span className="font-semibold text-[var(--gbp-text)]">Creado por:</span> {previewTemplate.created_by_name ?? "Dirección"}</p>
                </div>

                <div className="mt-3 border-t border-[var(--gbp-border)] pt-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Alcance</p>
                  {(() => {
                    const scope =
                      typeof previewTemplate.target_scope === "object" && previewTemplate.target_scope !== null
                        ? (previewTemplate.target_scope as Record<string, string[]>)
                        : {};

                    const locations = Array.isArray(scope.locations)
                      ? scope.locations.map((id) => branchNameMap.get(id) ?? id)
                      : [];
                    const departments = Array.isArray(scope.department_ids)
                      ? scope.department_ids.map((id) => departmentNameMap.get(id) ?? id)
                      : [];
                    const positions = Array.isArray(scope.position_ids)
                      ? scope.position_ids.map((id) => positionNameMap.get(id) ?? id)
                      : [];
                    const users = Array.isArray(scope.users)
                      ? scope.users.map((id) => userNameById.get(id) ?? id)
                      : [];
                    const hasScopedRules =
                      locations.length > 0 ||
                      departments.length > 0 ||
                      positions.length > 0 ||
                      users.length > 0;

                    return (
                      <div className="space-y-2 text-xs text-[var(--gbp-text2)]">
                        <div>
                          <p className="mb-1 font-semibold text-[var(--gbp-text)]">Locaciones</p>
                          <div className="flex flex-wrap gap-1">
                            {locations.length ? locations.map((name) => <span key={`loc-${name}`} className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-accent)]">{name}</span>) : <span>{hasScopedRules ? "No restringe por locación" : "Todas"}</span>}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 font-semibold text-[var(--gbp-text)]">Departamentos</p>
                          <div className="flex flex-wrap gap-1">
                            {departments.length ? departments.map((name) => <span key={`dep-${name}`} className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">{name}</span>) : <span>{hasScopedRules ? "No restringe por departamento" : "Todos"}</span>}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 font-semibold text-[var(--gbp-text)]">Puestos</p>
                          <div className="flex flex-wrap gap-1">
                            {positions.length ? positions.map((name) => <span key={`pos-${name}`} className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-success)]">{name}</span>) : <span>{hasScopedRules ? "No restringe por puesto" : "Todos"}</span>}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 font-semibold text-[var(--gbp-text)]">Usuarios</p>
                          <div className="flex flex-wrap gap-1">
                            {users.length ? users.map((name) => <span key={`usr-${name}`} className="inline-flex items-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] text-[var(--gbp-text2)]">{name}</span>) : <span>{hasScopedRules ? "Sin usuarios especificos" : "Todos"}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {(previewTemplate.templateSections ?? []).map((section) => (
                <div key={section.id} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                  <p className="text-sm font-semibold text-[var(--gbp-text)]">{section.name}</p>
                  <ul className="mt-2 space-y-1.5">
                    {section.items.map((item) => (
                      <li key={`${section.id}-${item}`} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs text-[var(--gbp-text2)]">{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {!previewTemplate.templateSections?.length ? <p className="text-sm text-[var(--gbp-text2)]">Sin secciones cargadas.</p> : null}
            </div>
            <div className="flex justify-end border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <Link href="/app/checklists" className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cerrar</Link>
            </div>
          </SlideUp>
        </div>
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
