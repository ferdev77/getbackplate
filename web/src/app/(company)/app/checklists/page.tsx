import Link from "next/link";
import { ClipboardPlus, Eye, MapPin, Pencil, Trash2 } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { ChecklistUpsertModal } from "@/modules/checklists/ui/checklist-upsert-modal";
import { ChecklistDeleteModal } from "@/modules/checklists/ui/checklist-delete-modal";
import { requireTenantModule } from "@/shared/lib/access";
import { SlideUp, AnimatedList, AnimatedItem } from "@/shared/ui/animations";

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

  const [
    { data: authData },
    { data: branches },
    { data: templates },
    { data: employees },
    { data: departments },
    { data: positions },
    { data: memberships },
    { data: roles },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("checklist_templates")
      .select("id, name, checklist_type, is_active, branch_id, shift, department, department_id, repeat_every, target_scope, created_at")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(80),
    (openCreateModal || previewTemplateId)
      ? supabase
          .from("employees")
          .select("id, user_id, first_name, last_name")
          .eq("organization_id", tenant.organizationId)
          .not("user_id", "is", null)
          .order("first_name")
      : Promise.resolve({ data: [] }),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    (openCreateModal || previewTemplateId)
      ? supabase
          .from("department_positions")
          .select("id, department_id, name")
          .eq("organization_id", tenant.organizationId)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
    openCreateModal
      ? supabase
          .from("memberships")
          .select("user_id, role_id")
          .eq("organization_id", tenant.organizationId)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
    openCreateModal
      ? supabase
          .from("roles")
          .select("id, code")
          .in("code", ["company_admin", "manager", "employee"])
      : Promise.resolve({ data: [] }),
  ]);

  const templateIds = (templates ?? []).map((t) => t.id);

  const { data: sections } = templateIds.length > 0
    ? await supabase
        .from("checklist_template_sections")
        .select("id, template_id, name, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("template_id", templateIds)
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

  const roleLabelByCode: Record<string, string> = {
    company_admin: "Admin",
    manager: "Manager",
    employee: "Empleado",
  };
  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const membershipRoleByUserId = new Map<string, string>();
  for (const membership of memberships ?? []) {
    const roleCode = roleCodeById.get(membership.role_id) ?? "";
    membershipRoleByUserId.set(membership.user_id, (roleLabelByCode[roleCode] ?? roleCode) || "Usuario");
  }

  const employeeByUserId = new Map(
    (employees ?? [])
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, row]),
  );

  const membershipUserIds = [...new Set((memberships ?? []).map((row) => row.user_id))];
  const scopedUsers: Array<{ id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string }> = [];

  for (const userId of membershipUserIds) {
    const employee = employeeByUserId.get(userId);
    if (employee) {
      scopedUsers.push({
        id: employee.id,
        user_id: employee.user_id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        role_label: membershipRoleByUserId.get(userId),
      });
      continue;
    }

    scopedUsers.push({
      id: `m-${userId}`,
      user_id: userId,
      first_name: "Usuario",
      last_name: userId.slice(0, 8),
      role_label: membershipRoleByUserId.get(userId),
    });
  }

  if (authData.user) {
    const alreadyInList = scopedUsers.some((row) => row.user_id === authData.user?.id);
    if (!alreadyInList) {
      const fullName =
        typeof authData.user.user_metadata?.full_name === "string"
          ? authData.user.user_metadata.full_name.trim()
          : "";
      const [firstName = "Usuario", ...rest] = fullName ? fullName.split(/\s+/) : [];

      scopedUsers.unshift({
        id: `self-${authData.user.id}`,
        user_id: authData.user.id,
        first_name: firstName || authData.user.email || "Usuario",
        last_name: rest.join(" "),
        role_label: membershipRoleByUserId.get(authData.user.id) ?? "Usuario",
      });
    }
  }

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

  const branchNameMap = new Map((branches ?? []).map((row) => [row.id, row.name]));
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

  const templateRows = (templates ?? []).map((template) => {
    const templateSections = sectionsByTemplate.get(template.id) ?? [];
    const templateItems = templateSections.flatMap((section) => itemsBySection.get(section.id) ?? []);
    const sectionViews = templateSections.map((section) => ({
      id: section.id,
      name: section.name,
      items: (itemsBySection.get(section.id) ?? []).map((item) => item.label),
    }));
    return {
      ...template,
      itemsCount: templateItems.length,
      templateItems,
      templateSections: sectionViews,
      branchName: template.branch_id ? branchNameMap.get(template.branch_id) ?? "Sucursal" : "Global",
      departmentName:
        (template.department_id ? departmentNameMap.get(template.department_id) : null) ??
        template.department ??
        "-",
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

  const forceUserIds = new Set<string>();
  for (const template of [editingTemplate, previewTemplate]) {
    const users =
      template &&
      typeof template.target_scope === "object" &&
      template.target_scope !== null &&
      Array.isArray((template.target_scope as Record<string, string[]>).users)
        ? ((template.target_scope as Record<string, string[]>).users ?? [])
        : [];

    for (const userId of users) {
      if (typeof userId === "string" && userId.trim()) {
        forceUserIds.add(userId.trim());
      }
    }
  }

  if (forceUserIds.size) {
    const existing = new Set(scopedUsers.map((row) => row.user_id).filter(Boolean) as string[]);
    for (const userId of forceUserIds) {
      if (existing.has(userId)) continue;
      scopedUsers.push({
        id: `forced-${userId}`,
        user_id: userId,
        first_name: "Usuario",
        last_name: userId.slice(0, 8),
        role_label: "Sin membresia activa",
      });
    }
  }

  const userNameById = new Map(
    scopedUsers
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, `${row.first_name} ${row.last_name}`.trim()]),
  );

  const totalTemplates = templates?.length ?? 0;
  const activeTemplates = (templates ?? []).filter((row) => row.is_active).length;
  const completed = 0;
  const pending = 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <SlideUp>
        <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9d948f] uppercase">Operacion diaria</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Mis Checklists</h1>
              <p className="mt-1 text-sm text-[#67605b]">Replica funcional del tablero final: plantillas, ejecuciones e incidencias.</p>
            </div>
            <Link href="/app/checklists?action=create" className="inline-flex items-center gap-1 rounded-lg bg-[#111] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c0392b]"><ClipboardPlus className="h-4 w-4" /> Nuevo Checklist</Link>
          </div>
        </section>
      </SlideUp>

      <AnimatedList className="mb-5 grid gap-3 sm:grid-cols-4">
        <AnimatedItem className="h-full">
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full"><p className="text-xs text-[#8a817b]">Total Checklists</p><p className="mt-1 text-2xl font-bold">{totalTemplates}</p></article>
        </AnimatedItem>
        <AnimatedItem className="h-full">
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full"><p className="text-xs text-[#8a817b]">Activos hoy</p><p className="mt-1 text-2xl font-bold">{activeTemplates}</p></article>
        </AnimatedItem>
        <AnimatedItem className="h-full">
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full"><p className="text-xs text-[#8a817b]">Completados</p><p className="mt-1 text-2xl font-bold">{completed}</p></article>
        </AnimatedItem>
        <AnimatedItem className="h-full">
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full"><p className="text-xs text-[#8a817b]">Pendientes</p><p className="mt-1 text-2xl font-bold">{pending}</p></article>
        </AnimatedItem>
      </AnimatedList>

      <SlideUp delay={0.1}>
        <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e7e0dc] bg-white p-3" method="get">
          <input name="q" defaultValue={q} className="h-[34px] w-[240px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs" placeholder="Buscar checklist..." />
          <select name="type" defaultValue={typeFilter} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todos los tipos</option><option value="opening">Apertura</option><option value="closing">Cierre</option><option value="prep">Prep</option><option value="custom">Custom</option></select>
          <select name="loc" defaultValue={locFilter} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todas las locaciones</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <button type="submit" className="h-[34px] rounded-lg bg-[#111] px-4 text-xs font-semibold text-white hover:bg-[#c0392b]">Filtrar</button>
        </form>
      </SlideUp>

      <SlideUp delay={0.2}>
        <section className="overflow-hidden rounded-xl border border-[#e7e0dc] bg-white">
          <div className="grid grid-cols-[minmax(180px,2fr)_100px_110px_130px_130px_90px_120px] gap-x-3 border-b-[1.5px] border-[#e8e8e8] bg-[#fafafa] px-4 py-2.5 text-[11px] font-bold tracking-[0.07em] text-[#aaa] uppercase">
            <p>Checklist</p><p>Tipo</p><p>Shift</p><p>Locacion</p><p>Departamento</p><p>Estado</p><p>Acciones</p>
          </div>
          <div>
            {filteredTemplates && filteredTemplates.length > 0 ? (
              <AnimatedList>
                {filteredTemplates.map((template) => (
                  <AnimatedItem key={template.id}>
                    <div className="grid grid-cols-[minmax(180px,2fr)_100px_110px_130px_130px_90px_120px] items-center gap-x-3 border-b border-[#f0f0f0] px-4 py-3">
                      <div>
                        <p className="text-[13px] font-semibold text-[#111]">{template.name}</p>
                        <p className="text-[11px] text-[#aaa]">{template.itemsCount} items</p>
                      </div>
                      <p className="text-xs text-[#666]">{typeLabel(template.checklist_type)}</p>
                      <p className="text-xs text-[#666]">{template.shift || "-"}</p>
                      <p className="inline-flex items-center gap-1 text-xs text-[#666]"><MapPin className="h-3.5 w-3.5" />{template.branchName}</p>
                      <p className="text-xs text-[#666]">{template.departmentName}</p>
                      <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] ${template.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>{template.is_active ? "Activa" : "Inactiva"}</span>
                      <div className="flex gap-1">
                        <Link href={`/app/checklists?preview=${template.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#d6e9dc] bg-[#eff8f2] text-[#2f6b45] hover:bg-[#e6f3ea]" title="Vista previa"><Eye className="h-3.5 w-3.5" /></Link>
                        <Link href={`/app/checklists?action=edit&templateId=${template.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#e8e8e8] bg-white text-[#666] hover:bg-[#f6f6f6]" title="Editar"><Pencil className="h-3.5 w-3.5" /></Link>
                        <Link href={`/app/checklists?delete=${template.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#f0d7d3] bg-[#fff3f1] text-[#a44a3f] hover:bg-[#ffe9e5]" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Link>
                      </div>
                    </div>
                  </AnimatedItem>
                ))}
              </AnimatedList>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-[#8b817c]">No hay checklists para los filtros seleccionados.</div>
            )}
          </div>
        </section>
      </SlideUp>

      {previewTemplate ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <SlideUp className="flex max-h-[88vh] w-[720px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
              <p className="font-serif text-[15px] font-bold text-[#111]">Vista previa · {previewTemplate.name}</p>
              <Link href="/app/checklists" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link>
            </div>
            <div className="max-h-[68vh] space-y-3 overflow-y-auto px-6 py-5">
              <div className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a908a]">Metadata</p>
                <div className="grid gap-2 sm:grid-cols-2 text-xs text-[#5f5853]">
                  <p><span className="font-semibold text-[#2a2420]">Tipo:</span> {typeLabel(previewTemplate.checklist_type)}</p>
                  <p><span className="font-semibold text-[#2a2420]">Shift:</span> {previewTemplate.shift || "-"}</p>
                  <p><span className="font-semibold text-[#2a2420]">Frecuencia:</span> {previewTemplate.repeat_every || "-"}</p>
                  <p><span className="font-semibold text-[#2a2420]">Estado:</span> {previewTemplate.is_active ? "Activo" : "Inactivo"}</p>
                </div>

                <div className="mt-3 border-t border-[#f0e8e3] pt-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a908a]">Alcance</p>
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
                      <div className="space-y-2 text-xs text-[#5f5853]">
                        <p><span className="font-semibold text-[#2a2420]">Locaciones:</span> {locations.length ? locations.join(", ") : hasScopedRules ? "No restringe por locacion" : "Todas"}</p>
                        <p><span className="font-semibold text-[#2a2420]">Departamentos:</span> {departments.length ? departments.join(", ") : hasScopedRules ? "No restringe por departamento" : "Todos"}</p>
                        <p><span className="font-semibold text-[#2a2420]">Puestos:</span> {positions.length ? positions.join(", ") : hasScopedRules ? "No restringe por puesto" : "Todos"}</p>
                        <p><span className="font-semibold text-[#2a2420]">Usuarios:</span> {users.length ? users.join(", ") : hasScopedRules ? "Sin usuarios especificos" : "Todos"}</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {(previewTemplate.templateSections ?? []).map((section) => (
                <div key={section.id} className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                  <p className="text-sm font-semibold text-[#2a2420]">{section.name}</p>
                  <ul className="mt-2 space-y-1.5">
                    {section.items.map((item) => (
                      <li key={`${section.id}-${item}`} className="rounded-lg border border-[#f0e8e3] bg-white px-3 py-2 text-xs text-[#4f4843]">{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {!previewTemplate.templateSections?.length ? <p className="text-sm text-[#8b817c]">Sin secciones cargadas.</p> : null}
            </div>
            <div className="flex justify-end border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
              <Link href="/app/checklists" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cerrar</Link>
            </div>
          </SlideUp>
        </div>
      ) : null}

      {deletingTemplate ? (
        <ChecklistDeleteModal template={deletingTemplate} />
      ) : null}

      {openCreateModal ? (
        <ChecklistUpsertModal 
          branches={branches ?? []}
          departments={departments ?? []}
          positions={positions ?? []}
          users={scopedUsers}
          action={action}
          editingTemplate={editingTemplate}
        />
      ) : null}
    </main>
  );
}
