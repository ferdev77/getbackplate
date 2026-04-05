import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { resolveAnnouncementAuthorNames } from "@/shared/lib/announcement-authors";
import { canReadAnnouncementInTenant } from "@/shared/lib/announcement-access";
import { AlertCircle, CalendarClock, PartyPopper, Megaphone } from "lucide-react";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  kind: "urgent" | "reminder" | "celebration" | "general" | string | null;
  is_featured: boolean;
  publish_at: string | null;
  created_at: string;
  expires_at: string | null;
  target_scope: unknown;
  created_by: string | null;
};

export default async function EmployeeAnnouncementsPage() {
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return null;
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("department_id, position, branch_id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

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

  const enabledModules = await getEnabledModulesCached(tenant.organizationId);
  const hasAnnouncementsModule = new Set(enabledModules).has("announcements");

  let announcements: AnnouncementRow[] = [];

  if (hasAnnouncementsModule) {
    const now = new Date();
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, kind, is_featured, publish_at, created_at, expires_at, target_scope, created_by")
      .eq("organization_id", tenant.organizationId)
      .order("publish_at", { ascending: false })
      .limit(60);

    const announcementTimestamp = (row: { publish_at: string | null; created_at: string }) => {
      const dateValue = row.publish_at ?? row.created_at;
      const timestamp = new Date(dateValue).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    announcements = (data ?? []).filter((item) => {
      const publishAt = item.publish_at ? new Date(item.publish_at) : null;
      const expiresAt = item.expires_at ? new Date(item.expires_at) : null;
      const published = !publishAt || publishAt <= now;
      const notExpired = !expiresAt || expiresAt >= now;
      if (!published || !notExpired) return false;

      return canReadAnnouncementInTenant({
        roleCode: tenant.roleCode,
        userId,
        branchId: tenant.branchId ?? employeeRow?.branch_id ?? null,
        departmentId: employeeRow?.department_id ?? null,
        positionIds: employeePositionIds,
        targetScope: item.target_scope,
      });
    }).sort((a, b) => {
      if (Boolean(a.is_featured) !== Boolean(b.is_featured)) {
        return a.is_featured ? -1 : 1;
      }
      return announcementTimestamp(b) - announcementTimestamp(a);
    });
  }

  // Fetch authors for announcements
  const authorIds = Array.from(
    new Set(
      announcements
        .map((a) => a.created_by)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const authorNameMap = await resolveAnnouncementAuthorNames({
    organizationId: tenant.organizationId,
    authorIds,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--gbp-text)]">Avisos</h1>
        <p className="mt-1 text-sm text-[var(--gbp-text2)]">Directivas y comunicaciones de la empresa.</p>
      </header>

      <section className="space-y-4">
        <div className="space-y-3">
          {announcements.map((item) => (
            <article key={item.id} className="group relative flex gap-4 overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 transition-all hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] hover:shadow-lg hover:shadow-black/5">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors ${
                item.kind === "urgent" ? "bg-rose-50 text-rose-500 group-hover:bg-rose-100" :
                item.kind === "reminder" ? "bg-amber-50 text-amber-500 group-hover:bg-amber-100" :
                item.kind === "celebration" ? "bg-blue-50 text-blue-500 group-hover:bg-blue-100" :
                "bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] group-hover:bg-[color:color-mix(in_oklab,var(--gbp-accent)_18%,transparent)]"
              }`}>
                {item.kind === "urgent" && <AlertCircle className="h-6 w-6" />}
                {item.kind === "reminder" && <CalendarClock className="h-6 w-6" />}
                {item.kind === "celebration" && <PartyPopper className="h-6 w-6" />}
                {item.kind === "general" && <Megaphone className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="pr-2 text-base font-bold text-[var(--gbp-text)]">{item.title}</h3>
                  {item.kind && item.kind !== "general" && (
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                      item.kind === "urgent" ? "border-rose-200 bg-rose-50 text-rose-600" :
                      item.kind === "reminder" ? "border-amber-200 bg-amber-50 text-amber-600" :
                      item.kind === "celebration" ? "border-blue-200 bg-blue-50 text-blue-600" :
                      ""
                    }`}>
                      {item.kind === "urgent" && "Urgente"}
                      {item.kind === "reminder" && "Recordatorio"}
                      {item.kind === "celebration" && "Celebración"}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--gbp-text2)]">{item.body}</p>
                
                <div className="mt-4 flex items-center gap-3 border-t border-[var(--gbp-border)] pt-3">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--gbp-text2)]">
                    <div className="grid h-5 w-5 place-items-center rounded-full bg-[var(--gbp-surface2)] text-[9px] font-bold text-[var(--gbp-text)]">
                      {(authorNameMap.get(item.created_by ?? "") || "DG").substring(0, 1).toUpperCase()}
                    </div>
                    {authorNameMap.get(item.created_by ?? "") || "Dirección General"}
                  </span>
                  <span className="text-[10px] text-[var(--gbp-muted)]">•</span>
                  <span className="text-[12px] font-medium text-[var(--gbp-muted)]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</span>
                </div>
              </div>
            </article>
          ))}

          {!announcements.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)]/70 px-4 py-12 text-center text-[var(--gbp-text2)]">
              {hasAnnouncementsModule
                ? "No hay avisos vigentes para tu perfil."
                : "El módulo de avisos no está habilitado."}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
