import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeAccess } from "@/shared/lib/access";

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
      .select("id, title, body, kind, publish_at, expires_at, target_scope")
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#111]">Avisos</h1>
        <p className="text-sm text-[#666] mt-1">Directivas y comunicaciones de la empresa.</p>
      </header>

      <section className="space-y-4">
        <div className="space-y-3">
          {announcements.map((item) => (
            <article key={item.id} className="flex gap-4 rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff8f0] text-lg">📣</div>
              <div>
                <h3 className="text-base font-bold text-[#111]">{item.title}</h3>
                <p className="mt-1 text-[14px] leading-6 text-[#666]">{item.body}</p>
                <p className="mt-2 text-[11px] font-medium text-[#bbb]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</p>
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
