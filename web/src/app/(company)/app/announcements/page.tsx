import Link from "next/link";
import { Bell, BellPlus, CalendarClock, Pencil, Pin } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { TooltipLabel } from "@/shared/ui/tooltip";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { parseAnnouncementScope } from "@/modules/announcements/lib/scope";
import {
  deleteAnnouncementAction,
  toggleAnnouncementFeaturedAction,
} from "@/modules/announcements/actions";
import { resolveAnnouncementAuthorNames } from "@/shared/lib/announcement-authors";
import { requireTenantModule } from "@/shared/lib/access";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { AnnouncementCreateModal } from "@/shared/ui/announcement-create-modal";
import { getEnabledModules } from "@/modules/organizations/queries";
import { ConfirmSubmitButton } from "@/shared/ui/confirm-submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { extractDisplayName } from "@/shared/lib/user";

type CompanyAnnouncementsPageProps = {
  searchParams: Promise<{
    status?: string;
    message?: string;
    action?: string;
    announcementId?: string;
  }>;
};

const TEXT_STRONG = "text-[var(--gbp-text)]";
const TEXT_MUTED = "text-[var(--gbp-text2)]";
const CARD = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]";
const ACTION_BTN_NEUTRAL = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_DANGER = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

function kindLabel(kind: string) {
  if (kind === "urgent") return "Urgente";
  if (kind === "reminder") return "Recordatorio";
  if (kind === "celebration") return "Celebracion";
  return "General";
}

function kindClass(kind: string) {
  if (kind === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (kind === "reminder") return "border-amber-200 bg-amber-50 text-amber-700";
  if (kind === "celebration") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default async function CompanyAnnouncementsPage({ searchParams }: CompanyAnnouncementsPageProps) {
  const tenant = await requireTenantModule("announcements");
  const params = await searchParams;
  const action = String(params.action ?? "").trim().toLowerCase();
  const openCreateModal = action === "create" || action === "edit";
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const { data: announcements, error: annError } = await supabase
    .from("announcements")
    .select("id, title, body, kind, is_featured, publish_at, expires_at, branch_id, target_scope, created_by")
    .eq("organization_id", tenant.organizationId)
    .order("publish_at", { ascending: false })
    .limit(100);

  if (annError) {
    console.error("Error fetching announcements:", annError);
  }

  // Optimize payload: Only fetch what we need for the listed announcements, unless opening the form modal
  const uniqueBranchIds = new Set<string>();
  const uniqueDepartmentIds = new Set<string>();
  const uniquePositionIds = new Set<string>();
  const uniqueUserIds = new Set<string>();
  const authorIds = Array.from(new Set((announcements ?? []).map((ann) => ann.created_by).filter(Boolean)));

  for (const ann of announcements || []) {
    const scope = parseAnnouncementScope(ann.target_scope);
    scope.locations.forEach(id => uniqueBranchIds.add(id));
    scope.department_ids.forEach(id => uniqueDepartmentIds.add(id));
    scope.position_ids.forEach(id => uniquePositionIds.add(id));
    scope.users.forEach(id => uniqueUserIds.add(id));
  }

  const branchIdsArr = Array.from(uniqueBranchIds);
  const deptIdsArr = Array.from(uniqueDepartmentIds);
  const posIdsArr = Array.from(uniquePositionIds);
  const userIdsArr = Array.from(uniqueUserIds);

  const branchesQuery = supabase
    .from("branches")
    .select("id, name, city")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true);

const employeesQuery = supabase
  .from("employees")
  .select("id, user_id, first_name, last_name, branch_id, department_id, position")
  .eq("organization_id", tenant.organizationId);

  const departmentsQuery = supabase
    .from("organization_departments")
    .select("id, name")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true);

  const positionsQuery = supabase
    .from("department_positions")
    .select("id, department_id, name")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true);

  const userProfilesQuery = supabase
    .from("organization_user_profiles")
  .select("id, user_id, first_name, last_name")
  .eq("organization_id", tenant.organizationId)
  .eq("is_employee", false);

  if (!openCreateModal) {
    // Only fetch needed references for performance
    if (branchIdsArr.length > 0) branchesQuery.in("id", branchIdsArr); else branchesQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    if (userIdsArr.length > 0) employeesQuery.in("user_id", userIdsArr); else employeesQuery.in("user_id", ["00000000-0000-0000-0000-000000000000"]);
    if (userIdsArr.length > 0) userProfilesQuery.in("user_id", userIdsArr); else userProfilesQuery.in("user_id", ["00000000-0000-0000-0000-000000000000"]);
    if (deptIdsArr.length > 0) departmentsQuery.in("id", deptIdsArr); else departmentsQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    if (posIdsArr.length > 0) positionsQuery.in("id", posIdsArr); else positionsQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
  }

  const [
    { data: branches },
    { data: employees },
    { data: userProfiles },
    { data: departments },
    { data: positions },
  ] = await Promise.all([
    branchesQuery,
    employeesQuery,
    userProfilesQuery,
    departmentsQuery,
    positionsQuery,
  ]);

  const enabledModules = await getEnabledModules(tenant.organizationId);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const mappedBranches = (branches ?? []).map((b) => ({
    ...b,
    originalName: b.name, // Keep it just in case, though might not be needed
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  const branchNameMap = new Map(mappedBranches.map((row) => [row.id, row.name]));
  const departmentNameMap = new Map((departments ?? []).map((row) => [row.id, row.name]));
  const authorNameMap = await resolveAnnouncementAuthorNames({
    organizationId: tenant.organizationId,
    authorIds,
  });
  const employeeNameByUserId = new Map(
    (employees ?? [])
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()]),
  );
  for (const profile of userProfiles ?? []) {
    if (!profile.user_id) continue;
    if (employeeNameByUserId.has(profile.user_id)) continue;
    employeeNameByUserId.set(profile.user_id, `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Usuario");
  }

  const scopeUsers = openCreateModal ? await buildScopeUsersCatalog(tenant.organizationId) : [];
  const positionNameMap = new Map((positions ?? []).map((row) => [row.id, row.name]));

  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);
  const porVencer = (announcements ?? []).filter((row) => {
    if (!row.expires_at) return false;
    const exp = new Date(row.expires_at);
    return exp >= now && exp <= in7Days;
  }).length;

  const latestAnnouncement = (announcements ?? [])[0] ?? null;
  const latestDate = latestAnnouncement?.publish_at;
  const today = new Date().toISOString().slice(0, 10);

  const editingAnnouncement = action === "edit"
    ? (announcements ?? []).find((row) => row.id === params.announcementId)
    : null;

  const publisherName = extractDisplayName(authData.user);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <SlideUp>
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className={`inline-flex items-center gap-2 ${TEXT_STRONG}`}>
            <Bell className="h-4 w-4" />
            <h1 className="text-[18px] font-bold">Avisos</h1>
          </div>
          <Link href="/app/announcements?action=create" className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white hover:bg-[var(--gbp-accent)]"><BellPlus className="h-3.5 w-3.5" /> Nuevo Aviso</Link>
        </section>
      </SlideUp>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Avisos activos</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{announcements?.length ?? 0}</p><p className={`text-[11px] ${TEXT_MUTED}`}>En todas las locaciones</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Fijados</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{(announcements ?? []).filter((row) => row.is_featured).length}</p><p className={`text-[11px] ${TEXT_MUTED}`}>Visible al top</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Por vencer</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{porVencer}</p><p className={`text-[11px] ${TEXT_MUTED}`}>Esta semana</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Ultima publicacion</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{latestDate ? new Date(latestDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "-"}</p><p className={`text-[11px] ${TEXT_MUTED}`}>{latestAnnouncement ? authorNameMap.get(latestAnnouncement.created_by ?? "") || "Direccion General" : "Sin avisos"}</p></article>
        </div>
      </div>

      <SlideUp delay={0.1}>
        <p className={`mb-2 text-[11px] font-bold tracking-[0.11em] uppercase ${TEXT_MUTED}`}>Avisos publicados</p>
      </SlideUp>

      <section className="space-y-3">
        {announcements && announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((ann) => {
              const target = parseAnnouncementScope(ann.target_scope);
              const scopedLocations = target.locations;
              const scopedDepartments = target.department_ids;
              const scopedPositions = target.position_ids;
              const scopedUsers = target.users;
              const hasAudience =
                scopedLocations.length > 0 || scopedDepartments.length > 0 || scopedPositions.length > 0 || scopedUsers.length > 0;

              return (
                <div key={ann.id}>
                  <article className={`rounded-xl border-[1.5px] px-5 py-4 ${CARD} ${ann.is_featured ? "border-[var(--gbp-border)] border-l-[3.5px] border-l-[var(--gbp-accent)]" : "border-[var(--gbp-border)]"}`}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-[14px] font-bold ${TEXT_STRONG}`}>{ann.title}</p>
                        <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] ${TEXT_MUTED}`}>
                          <span>📅 {ann.publish_at ? new Date(ann.publish_at).toLocaleDateString("es-AR") : "-"} · {authorNameMap.get(ann.created_by ?? "") || "Direccion General"}</span>
                          {ann.expires_at ? (
                            (() => {
                              const datePart = ann.expires_at.slice(0, 10);
                              const badgeClass =
                                datePart < today
                                  ? "border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"
                                  : datePart === today
                                    ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                                    : "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]";
                              const prefix = datePart < today ? "Vencio" : datePart === today ? "Vence hoy" : "Por vencer";
                              return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${badgeClass}`}><CalendarClock className="h-3 w-3" /> {prefix}: {new Date(ann.expires_at).toLocaleDateString("es-AR")}</span>;
                            })()
                          ) : null}
                        </div>
                      </div>
                      {ann.is_featured ? <span className="inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gbp-accent)]"><Pin className="h-3 w-3" /> FIJADO</span> : null}
                    </div>

                    <p className={`text-[13px] leading-6 ${TEXT_MUTED}`}>{ann.body}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={`text-[11px] font-semibold ${TEXT_MUTED}`}>Para:</span>
                      {!hasAudience ? <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[11px] text-[var(--gbp-text2)]">Todos los empleados</span> : null}
                      {scopedLocations.map((id) => <span key={`${ann.id}-loc-${id}`} className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[11px] font-medium text-[var(--gbp-accent)]">{branchNameMap.get(id) ?? "Sucursal"}</span>)}
                      {scopedDepartments.map((id) => <span key={`${ann.id}-dep-${id}`} className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">{departmentNameMap.get(id) ?? "Departamento"}</span>)}
                      {scopedPositions.map((id) => <span key={`${ann.id}-pos-${id}`} className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--gbp-success)]">{positionNameMap.get(id) ?? "Puesto"}</span>)}
                      {scopedUsers.slice(0, 3).map((id) => <span key={`${ann.id}-user-${id}`} className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[11px] text-[var(--gbp-text2)]">{employeeNameByUserId.get(id) ?? "Usuario"}</span>)}
                      {scopedUsers.length > 3 ? <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-2 py-0.5 text-[11px] text-[var(--gbp-text2)]">+{scopedUsers.length - 3}</span> : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${kindClass(ann.kind)}`}>{kindLabel(ann.kind)}</span>
                      <div className="flex items-center gap-1">
                        <form action={toggleAnnouncementFeaturedAction}>
                          <input type="hidden" name="announcement_id" value={ann.id} />
                          <input type="hidden" name="next_featured" value={String(!ann.is_featured)} />
                          <button className={ann.is_featured ? ACTION_BTN_DANGER : ACTION_BTN_NEUTRAL} type="submit"><Pin className="h-3.5 w-3.5" /><TooltipLabel label={ann.is_featured ? "Quitar fijado" : "Fijar"} /></button>
                        </form>
                        <Link href={`/app/announcements?action=edit&announcementId=${ann.id}`} className={ACTION_BTN_NEUTRAL}><Pencil className="h-3.5 w-3.5" /><TooltipLabel label="Editar" /></Link>
                        <form action={deleteAnnouncementAction}>
                          <input type="hidden" name="announcement_id" value={ann.id} />
                          <ConfirmSubmitButton
                            label="🗑"
                            confirmTitle="Eliminar anuncio"
                            confirmDescription="Se eliminara el anuncio y su audiencia. Esta accion no se puede deshacer."
                            confirmLabel="Eliminar"
                            className={ACTION_BTN_DANGER}
                          />
                        </form>
                      </div>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        ) : (
          <SlideUp delay={0.2}>
            <EmptyState title="Aun no hay anuncios" description="Publica tu primer aviso para que llegue a tu equipo." />
          </SlideUp>
        )}
      </section>

      {openCreateModal ? (
        <AnnouncementCreateModal
          branches={mappedBranches}
          departments={departments ?? []}
          positions={positions ?? []}
          users={scopeUsers}
          publisherName={publisherName}
          mode={action === "edit" ? "edit" : "create"}
          initial={
            editingAnnouncement
              ? (() => {
                  const target = parseAnnouncementScope(editingAnnouncement.target_scope);
                  return {
                    id: editingAnnouncement.id,
                    kind: editingAnnouncement.kind,
                    title: editingAnnouncement.title,
                    body: editingAnnouncement.body,
                    expires_at: editingAnnouncement.expires_at,
                    is_featured: editingAnnouncement.is_featured,
                    location_scope: target.locations,
                    department_scope: target.department_ids,
                    position_scope: target.position_ids,
                    user_scope: target.users,
                  };
                })()
              : undefined
          }
        />
      ) : null}
    </main>
  );
}
