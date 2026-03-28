import Link from "next/link";
import { Bell, BellPlus, CalendarClock, Pencil, Pin } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";

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

const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_CARD = "[.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_PRIMARY = "[.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:text-white [.theme-dark-pro_&]:hover:bg-[#3a73c6]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#d8e3f2] [.theme-dark-pro_&]:hover:bg-[#172131]";
const ACTION_BTN_NEUTRAL = `inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#e8e8e8] bg-white text-[#666] hover:bg-[#f6f6f6] ${DARK_GHOST}`;
const ACTION_BTN_DANGER = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#f3cbc4] bg-[#fff3f1] text-[#b63a2f] hover:bg-[#ffe8e4] [.theme-dark-pro_&]:border-[#6a3a42] [.theme-dark-pro_&]:bg-[#2a1c1f] [.theme-dark-pro_&]:text-[#ff9ea7] [.theme-dark-pro_&]:hover:bg-[#352328]";

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
    .select("id, name")
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

  const branchNameMap = new Map((branches ?? []).map((row) => [row.id, row.name]));
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
          <div className={`inline-flex items-center gap-2 text-[#1f1a17] ${DARK_TEXT}`}>
            <Bell className="h-4 w-4" />
            <h1 className="text-[18px] font-bold">Avisos</h1>
          </div>
          <Link href="/app/announcements?action=create" className={`inline-flex h-[33px] items-center gap-1 rounded-lg bg-[#111] px-3 text-xs font-bold text-white hover:bg-[#c0392b] ${DARK_PRIMARY}`}><BellPlus className="h-3.5 w-3.5" /> Nuevo Aviso</Link>
        </section>
      </SlideUp>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="h-full">
          <article className={`rounded-xl border border-[#e7e0dc] bg-white p-4 h-full ${DARK_CARD}`}><p className={`text-xs text-[#8a817b] ${DARK_MUTED}`}>Avisos activos</p><p className={`mt-1 text-2xl font-bold ${DARK_TEXT}`}>{announcements?.length ?? 0}</p><p className={`text-[11px] text-[#a7a09a] ${DARK_MUTED}`}>En todas las locaciones</p></article>
        </div>
        <div className="h-full">
          <article className={`rounded-xl border border-[#e7e0dc] bg-white p-4 h-full ${DARK_CARD}`}><p className={`text-xs text-[#8a817b] ${DARK_MUTED}`}>Fijados</p><p className={`mt-1 text-2xl font-bold ${DARK_TEXT}`}>{(announcements ?? []).filter((row) => row.is_featured).length}</p><p className={`text-[11px] text-[#a7a09a] ${DARK_MUTED}`}>Visible al top</p></article>
        </div>
        <div className="h-full">
          <article className={`rounded-xl border border-[#e7e0dc] bg-white p-4 h-full ${DARK_CARD}`}><p className={`text-xs text-[#8a817b] ${DARK_MUTED}`}>Por vencer</p><p className={`mt-1 text-2xl font-bold ${DARK_TEXT}`}>{porVencer}</p><p className={`text-[11px] text-[#a7a09a] ${DARK_MUTED}`}>Esta semana</p></article>
        </div>
        <div className="h-full">
          <article className={`rounded-xl border border-[#e7e0dc] bg-white p-4 h-full ${DARK_CARD}`}><p className={`text-xs text-[#8a817b] ${DARK_MUTED}`}>Ultima publicacion</p><p className={`mt-1 text-2xl font-bold ${DARK_TEXT}`}>{latestDate ? new Date(latestDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "-"}</p><p className={`text-[11px] text-[#a7a09a] ${DARK_MUTED}`}>{latestAnnouncement ? authorNameMap.get(latestAnnouncement.created_by ?? "") || "Direccion General" : "Sin avisos"}</p></article>
        </div>
      </div>

      <SlideUp delay={0.1}>
        <p className={`mb-2 text-[11px] font-bold tracking-[0.11em] text-[#9c938d] uppercase ${DARK_MUTED}`}>Avisos publicados</p>
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
                  <article className={`rounded-xl border-[1.5px] bg-white px-5 py-4 ${DARK_CARD} ${ann.is_featured ? "border-[#e8e8e8] border-l-[3.5px] border-l-[#c0392b]" : "border-[#e8e8e8]"}`}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-[14px] font-bold text-[#111] ${DARK_TEXT}`}>{ann.title}</p>
                        <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#aaa] ${DARK_MUTED}`}>
                          <span>📅 {ann.publish_at ? new Date(ann.publish_at).toLocaleDateString("es-AR") : "-"} · {authorNameMap.get(ann.created_by ?? "") || "Direccion General"}</span>
                          {ann.expires_at ? (
                            (() => {
                              const datePart = ann.expires_at.slice(0, 10);
                              const badgeClass =
                                datePart < today
                                  ? "border-[#ffd7d1] bg-[#fff1ef] text-[#bf3e31]"
                                  : datePart === today
                                    ? "border-[#f1dfb3] bg-[#fff9ec] text-[#9f7010]"
                                    : "border-[#d8e7ff] bg-[#eef4ff] text-[#2a4f87]";
                              const prefix = datePart < today ? "Vencio" : datePart === today ? "Vence hoy" : "Por vencer";
                              return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${badgeClass}`}><CalendarClock className="h-3 w-3" /> {prefix}: {new Date(ann.expires_at).toLocaleDateString("es-AR")}</span>;
                            })()
                          ) : null}
                        </div>
                      </div>
                      {ann.is_featured ? <span className="inline-flex items-center gap-1 rounded-full border border-[#f3cbc4] bg-[#fff2f0] px-2 py-0.5 text-[10px] font-semibold text-[#b63a2f]"><Pin className="h-3 w-3" /> FIJADO</span> : null}
                    </div>

                    <p className={`text-[13px] leading-6 text-[#777] ${DARK_MUTED}`}>{ann.body}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={`text-[11px] font-semibold text-[#888] ${DARK_MUTED}`}>Para:</span>
                      {!hasAudience ? <span className="rounded-full border border-[#e8dfda] bg-[#faf7f5] px-2 py-0.5 text-[11px] text-[#6f6864]">Todos los empleados</span> : null}
                      {scopedLocations.map((id) => <span key={`${ann.id}-loc-${id}`} className="rounded-full border border-[#d6e2f4] bg-[#eef4ff] px-2 py-0.5 text-[11px] text-[#2a4f87]">{branchNameMap.get(id) ?? "Sucursal"}</span>)}
                      {scopedDepartments.map((id) => <span key={`${ann.id}-dep-${id}`} className="rounded-full border border-[#f0e3d0] bg-[#fff7eb] px-2 py-0.5 text-[11px] text-[#9b6a1e]">{departmentNameMap.get(id) ?? "Departamento"}</span>)}
                      {scopedPositions.map((id) => <span key={`${ann.id}-pos-${id}`} className="rounded-full border border-[#e6d9f9] bg-[#f6f1ff] px-2 py-0.5 text-[11px] text-[#6f46b7]">{positionNameMap.get(id) ?? "Puesto"}</span>)}
                      {scopedUsers.slice(0, 3).map((id) => <span key={`${ann.id}-user-${id}`} className="rounded-full border border-[#f0d5d0] bg-[#fff5f3] px-2 py-0.5 text-[11px] text-[#b63a2f]">{employeeNameByUserId.get(id) ?? "Usuario"}</span>)}
                      {scopedUsers.length > 3 ? <span className="rounded-full border border-[#ececec] bg-[#f8f8f8] px-2 py-0.5 text-[11px] text-[#777]">+{scopedUsers.length - 3}</span> : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${kindClass(ann.kind)}`}>{kindLabel(ann.kind)}</span>
                      <div className="flex items-center gap-1">
                        <form action={toggleAnnouncementFeaturedAction}>
                          <input type="hidden" name="announcement_id" value={ann.id} />
                          <input type="hidden" name="next_featured" value={String(!ann.is_featured)} />
                          <button className={ann.is_featured ? ACTION_BTN_DANGER : ACTION_BTN_NEUTRAL} type="submit" title={ann.is_featured ? "Quitar fijado" : "Fijar"}><Pin className="h-3.5 w-3.5" /></button>
                        </form>
                        <Link href={`/app/announcements?action=edit&announcementId=${ann.id}`} className={ACTION_BTN_NEUTRAL} title="Editar"><Pencil className="h-3.5 w-3.5" /></Link>
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
          branches={branches ?? []}
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
