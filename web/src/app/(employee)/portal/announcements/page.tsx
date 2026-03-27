import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { AlertCircle, CalendarClock, PartyPopper, Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmployeeAnnouncementsPage() {
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();

  const { data: moduleData } = await supabase.rpc("is_module_enabled", { 
    org_id: tenant.organizationId, 
    module_code: "announcements" 
  });
  
  const hasAnnouncementsModule = Boolean(moduleData);

  let announcements: Array<any> = [];

  if (hasAnnouncementsModule) {
    const now = new Date();
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, kind, publish_at, expires_at, target_scope, created_by")
      .eq("organization_id", tenant.organizationId)
      .order("publish_at", { ascending: false })
      .limit(60);

    announcements = (data ?? []).filter((item) => {
      const publishAt = item.publish_at ? new Date(item.publish_at) : null;
      const expiresAt = item.expires_at ? new Date(item.expires_at) : null;
      const published = !publishAt || publishAt <= now;
      const notExpired = !expiresAt || expiresAt >= now;
      return published && notExpired;
    });
  }

  // Fetch authors for announcements
  const authorIds = Array.from(new Set(announcements.map((a) => a.created_by).filter(Boolean)));
  const authorNameMap = new Map<string, string>();
  if (authorIds.length > 0) {
    // Use admin client to bypass RLS — the author may be a company admin
    // whose profile is not visible to the employee's session
    const admin = createSupabaseAdminClient();
    const [{ data: employeesData }, { data: profilesData }] = await Promise.all([
      admin.from("employees").select("user_id, first_name, last_name, position").eq("organization_id", tenant.organizationId).in("user_id", authorIds),
      admin.from("organization_user_profiles").select("user_id, first_name, last_name").eq("organization_id", tenant.organizationId).in("user_id", authorIds),
    ]);
    for (const emp of employeesData ?? []) {
      if (emp.user_id) authorNameMap.set(emp.user_id, `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Dirección");
    }
    for (const prof of profilesData ?? []) {
      if (prof.user_id && !authorNameMap.has(prof.user_id)) {
        authorNameMap.set(prof.user_id, `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Dirección");
      }
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#111]">Avisos</h1>
        <p className="text-sm text-[#666] mt-1">Directivas y comunicaciones de la empresa.</p>
      </header>

      <section className="space-y-4">
        <div className="space-y-3">
          {announcements.map((item) => (
            <article key={item.id} className="group relative flex gap-4 overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white p-6 transition-all hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors ${
                item.kind === "urgent" ? "bg-rose-50 text-rose-500 group-hover:bg-rose-100" :
                item.kind === "reminder" ? "bg-amber-50 text-amber-500 group-hover:bg-amber-100" :
                item.kind === "celebration" ? "bg-blue-50 text-blue-500 group-hover:bg-blue-100" :
                "bg-[#fff8f0] text-orange-400 group-hover:bg-orange-100"
              }`}>
                {item.kind === "urgent" && <AlertCircle className="h-6 w-6" />}
                {item.kind === "reminder" && <CalendarClock className="h-6 w-6" />}
                {item.kind === "celebration" && <PartyPopper className="h-6 w-6" />}
                {item.kind === "general" && <Megaphone className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-[#111] pr-2">{item.title}</h3>
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
                <p className="mt-2 text-[14px] leading-relaxed text-[#555] whitespace-pre-wrap">{item.body}</p>
                
                <div className="mt-4 flex items-center gap-3 border-t border-[#f5f5f5] pt-3">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#888]">
                    <div className="grid h-5 w-5 place-items-center rounded-full bg-[#f0f0f0] text-[9px] font-bold text-[#555]">
                      {(authorNameMap.get(item.created_by ?? "") || "DG").substring(0, 1).toUpperCase()}
                    </div>
                    {authorNameMap.get(item.created_by ?? "") || "Dirección General"}
                  </span>
                  <span className="text-[10px] text-[#ccc]">•</span>
                  <span className="text-[12px] font-medium text-[#bbb]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</span>
                </div>
              </div>
            </article>
          ))}

          {!announcements.length ? (
            <div className="rounded-2xl border border-dashed border-[#dccfca] bg-white/50 px-4 py-12 text-center text-[#8b817c]">
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
