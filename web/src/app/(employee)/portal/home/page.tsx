import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { markEmployeeOnboardingSeenAction } from "@/modules/onboarding/actions";
import { EmployeeWelcomeModal } from "@/modules/onboarding/ui/employee-welcome-modal";
import { requireEmployeeAccess } from "@/shared/lib/access";

export default async function EmployeeHomePage() {
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) return null;

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, department_id, branch_id, hired_at, position, emergency_contact_name")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const [{ data: announcementsModuleEnabled }, { data: preferencesRow }] = await Promise.all([
    supabase.rpc("is_module_enabled", {
      org_id: tenant.organizationId,
      module_code: "announcements",
    }),
    supabase
      .from("user_preferences")
      .select("onboarding_seen_at")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  let announcements: Array<{
    id: string;
    title: string;
    body: string;
    kind: string;
    publish_at: string | null;
    expires_at: string | null;
    target_scope: unknown;
  }> = [];

  const hasAnnouncementsModule = Boolean(announcementsModuleEnabled?.data);

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

  let pendingDocs = 0;
  let approvedDocs = 0;
  let contractSigned = false;

  if (employeeRow?.id) {
    const [{ data: linkedDocs }, { data: latestContract }] = await Promise.all([
      supabase
        .from("employee_documents")
        .select("status")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeRow.id),
      supabase
        .from("employee_contracts")
        .select("contract_status, signed_at")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    pendingDocs = (linkedDocs ?? []).filter((row) => row.status === "pending").length;
    approvedDocs = (linkedDocs ?? []).filter((row) => row.status === "approved").length;
    contractSigned = Boolean(latestContract?.signed_at) || latestContract?.contract_status === "active";
  }

  const heroAnnouncement = announcements[0] ?? null;
  const recentAnnouncements = announcements.slice(1, 4);
  const showOnboardingWelcome = !preferencesRow?.onboarding_seen_at;

  return (
    <>
      <section className="rounded-2xl bg-[#1e1a18] p-8 text-white">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#e74c3c]">Mensaje de la Direccion</p>
        <h2 className="font-serif text-3xl font-bold leading-tight">{heroAnnouncement?.title ?? "Bienvenido al Portal Interno"}</h2>
        <p className="mt-4 text-sm leading-7 text-[#b8b0aa]">{heroAnnouncement?.body ?? "Aqui encontraras avisos y documentos de tu puesto con acceso controlado por rol y locacion."}</p>
        <p className="mt-4 text-[11px] text-[#665f5a]">Publicado: {heroAnnouncement?.publish_at ? new Date(heroAnnouncement.publish_at).toLocaleDateString("es-AR") : "-"}</p>
      </section>

      <section className="mt-7 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#bbb]">
          {hasAnnouncementsModule ? "Avisos recientes" : "Comunicacion interna"}
        </p>

        {recentAnnouncements.map((item) => (
          <article key={item.id} className="flex gap-4 rounded-xl border border-[#e8e8e8] bg-white p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#fff8f0] text-lg">📣</div>
            <div>
              <h3 className="text-[15px] font-bold text-[#111]">{item.title}</h3>
              <p className="mt-1 text-[13px] leading-6 text-[#666]">{item.body}</p>
              <p className="mt-2 text-[11px] text-[#bbb]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</p>
            </div>
          </article>
        ))}

        {!announcements.length ? (
          <div className="rounded-xl border border-dashed border-[#dccfca] bg-white px-4 py-8 text-center text-sm text-[#8b817c]">
            {hasAnnouncementsModule
              ? "No hay avisos vigentes para tu perfil."
              : "El modulo de avisos no esta habilitado para tu empresa."}
          </div>
        ) : null}
      </section>

      {showOnboardingWelcome ? (
        <EmployeeWelcomeModal
          pendingDocs={pendingDocs}
          approvedDocs={approvedDocs}
          contractSigned={contractSigned}
          finishAction={markEmployeeOnboardingSeenAction}
        />
      ) : null}
    </>
  );
}
