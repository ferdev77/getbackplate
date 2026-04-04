import Link from "next/link";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { markEmployeeOnboardingSeenAction } from "@/modules/onboarding/actions";
import { EmployeeHomeWelcomeWorkspace } from "@/modules/onboarding/ui/employee-home-welcome-workspace";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { getEnabledModules } from "@/modules/organizations/queries";
import { resolveAnnouncementAuthorNames } from "@/shared/lib/announcement-authors";
import { canReadAnnouncementInTenant } from "@/shared/lib/announcement-access";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { FileText, ClipboardCheck, ArrowRight, AlertCircle, CalendarClock, PartyPopper, Megaphone } from "lucide-react";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  kind: "urgent" | "reminder" | "celebration" | "general" | string | null;
  publish_at: string | null;
  expires_at: string | null;
  target_scope: unknown;
  created_by: string | null;
};

type VisibleDocument = {
  id: string;
  title: string;
  mime_type: string;
  file_size_bytes: number | null;
  created_at: string;
  access_scope: string | null;
};

type VisibleTemplate = {
  id: string;
  name: string;
  branch_id: string | null;
  department_id: string | null;
  target_scope: string | null;
  updated_at: string;
};

export default async function EmployeeHomePage() {
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) return null;

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, department_id, branch_id, hired_at, position, emergency_contact_name, first_name, last_name")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const employeeBranchId = tenant.branchId ?? employeeRow?.branch_id ?? null;

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

  const [
    enabledModules,
    { data: preferencesRow },
    { data: department },
    resolvedBranch,
  ] = await Promise.all([
    getEnabledModules(tenant.organizationId),
    supabase
      .from("user_preferences")
      .select("onboarding_seen_at")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    employeeRow?.department_id
      ? supabase
          .from("organization_departments")
          .select("name")
          .eq("organization_id", tenant.organizationId)
          .eq("id", employeeRow.department_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    employeeBranchId
      ? supabase
          .from("branches")
          .select("name, city")
          .eq("organization_id", tenant.organizationId)
          .eq("id", employeeBranchId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customBrandingEnabled = enabledModules.has("custom_branding");
  const resolvedBranchDisplayName = resolvedBranch.data
    ? (customBrandingEnabled && resolvedBranch.data.city ? resolvedBranch.data.city : resolvedBranch.data.name)
    : null;

  const hasAnnouncementsModule = enabledModules.has("announcements");
  const hasDocumentsModule = enabledModules.has("documents");
  const hasChecklistsModule = enabledModules.has("checklists");

  const announcementsPromise = hasAnnouncementsModule
    ? supabase
        .from("announcements")
        .select("id, title, body, kind, publish_at, expires_at, target_scope, created_by")
        .eq("organization_id", tenant.organizationId)
        .order("publish_at", { ascending: false })
        .limit(30)
    : Promise.resolve({ data: [] as AnnouncementRow[] });

  const documentsPromise = hasDocumentsModule
    ? supabase
        .from("documents")
        .select("id, title, mime_type, file_size_bytes, created_at, access_scope")
        .is("deleted_at", null)
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [] as VisibleDocument[] });

  const checklistTemplatesPromise = hasChecklistsModule
    ? supabase
        .from("checklist_templates")
        .select("id, name, branch_id, department_id, target_scope, updated_at")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [] as VisibleTemplate[] });

  const employeeDocumentsLinksPromise = employeeRow?.id
    ? supabase
        .from("employee_documents")
        .select("document_id, status")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeRow.id)
    : Promise.resolve({ data: [] as Array<{ document_id: string; status: string }> });

  const latestContractPromise = employeeRow?.id
    ? supabase
        .from("employee_contracts")
        .select("contract_status, signed_at")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null as { contract_status: string | null; signed_at: string | null } | null });

  const docsCountPromise = hasDocumentsModule
    ? supabase
        .rpc("count_accessible_documents", {
          p_organization_id: tenant.organizationId,
          p_user_id: userId,
          p_role_code: tenant.roleCode,
          p_branch_id: employeeBranchId,
          p_department_id: employeeRow?.department_id ?? null,
          p_position_ids: employeePositionIds,
        })
        .then(({ data }) => data ?? 0)
    : Promise.resolve(0);

  const [
    docsCount,
    { data: announcementsRaw },
    { data: documentsRaw },
    { data: templatesRaw },
    { data: employeeDocumentLinks },
    { data: latestContract },
  ] = await Promise.all([
    docsCountPromise,
    announcementsPromise,
    documentsPromise,
    checklistTemplatesPromise,
    employeeDocumentsLinksPromise,
    latestContractPromise,
  ]);

  const employeeName = employeeRow
    ? `${employeeRow.first_name} ${employeeRow.last_name}`.trim()
    : (typeof authData.user?.user_metadata?.full_name === "string" && authData.user.user_metadata.full_name.trim()) || authData.user?.email || "Empleado";

  let announcements: AnnouncementRow[] = [];

  if (hasAnnouncementsModule) {
    const now = new Date();
    announcements = (announcementsRaw ?? []).filter((item) => {
      const publishAt = item.publish_at ? new Date(item.publish_at) : null;
      const expiresAt = item.expires_at ? new Date(item.expires_at) : null;
      const published = !publishAt || publishAt <= now;
      const notExpired = !expiresAt || expiresAt >= now;
      if (!published || !notExpired) return false;

      return canReadAnnouncementInTenant({
        roleCode: tenant.roleCode,
        userId,
        branchId: employeeBranchId,
        departmentId: employeeRow?.department_id ?? null,
        positionIds: employeePositionIds,
        targetScope: item.target_scope,
      });
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

  // Fetch Documents
  let visibleDocuments: VisibleDocument[] = [];
  if (hasDocumentsModule) {
    const assignedDocumentIds = new Set((employeeDocumentLinks ?? []).map((link) => link.document_id));

    visibleDocuments = (documentsRaw ?? []).filter((doc) =>
      canReadDocumentInTenant({
        roleCode: tenant.roleCode,
        userId,
        branchId: employeeBranchId,
        departmentId: employeeRow?.department_id ?? null,
        positionIds: employeePositionIds,
        isDirectlyAssigned: assignedDocumentIds.has(doc.id),
        accessScope: doc.access_scope,
      }),
    ).slice(0, 3);
  }

  // Fetch Checklists
  let visibleTemplates: VisibleTemplate[] = [];
  if (hasChecklistsModule) {
    visibleTemplates = (templatesRaw ?? []).filter((template) =>
      canUseChecklistTemplateInTenant({
        roleCode: tenant.roleCode,
        userId,
        branchId: employeeBranchId,
        departmentId: employeeRow?.department_id ?? null,
        positionIds: employeePositionIds,
        templateBranchId: template.branch_id,
        templateDepartmentId: template.department_id,
        targetScope: template.target_scope,
      }),
    ).slice(0, 3);
  }

  let pendingDocs = 0;
  let approvedDocs = 0;
  let contractSigned = false;

  if (employeeRow?.id) {
    pendingDocs = (employeeDocumentLinks ?? []).filter((row) => row.status === "pending").length;
    approvedDocs = (employeeDocumentLinks ?? []).filter((row) => row.status === "approved").length;
    contractSigned = Boolean(latestContract?.signed_at) || latestContract?.contract_status === "active";
  }

  const heroAnnouncement = announcements[0] ?? null;
  const recentAnnouncements = announcements.slice(1, 4);
  const showOnboardingWelcome = !preferencesRow?.onboarding_seen_at;

  return (
    <>
      <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-xs text-[var(--gbp-muted)]">Bienvenido de vuelta</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-[var(--gbp-text)]">{employeeName}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
            {resolvedBranchDisplayName && <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-3 py-1 text-[var(--gbp-accent)]">{resolvedBranchDisplayName}</span>}
            {department?.name && <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-600 dark:text-blue-400">{department.name}</span>}
            {employeeRow?.position && <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-3 py-1 text-[var(--gbp-success)]">{employeeRow.position}</span>}
          </div>
        </div>
        <div className="min-w-[140px] rounded-xl bg-[var(--gbp-bg)] p-5 text-center">
          <p className="font-serif text-5xl font-bold leading-none text-[var(--gbp-accent)]">{docsCount}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-[var(--gbp-text2)]">Documentos</p>
        </div>
      </section>
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 p-12 opacity-10 blur-2xl">
           <div className="w-64 h-64 bg-brand rounded-full"></div>
        </div>
        <div className="relative z-10 flex flex-col items-start">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--gbp-accent)]">
              Mensaje Principal
            </span>
            {heroAnnouncement?.kind && (
              <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
                heroAnnouncement.kind === "urgent" ? "bg-rose-500/20 text-rose-300" :
                heroAnnouncement.kind === "reminder" ? "bg-amber-500/20 text-amber-300" :
                heroAnnouncement.kind === "celebration" ? "bg-blue-500/20 text-blue-300" :
                "bg-white/10 text-white/70"
              }`}>
                {heroAnnouncement.kind === "urgent" && "Urgente"}
                {heroAnnouncement.kind === "reminder" && "Recordatorio"}
                {heroAnnouncement.kind === "celebration" && "Celebración"}
                {heroAnnouncement.kind === "general" && "General"}
              </span>
            )}
          </div>
          <h2 className="font-serif text-3xl font-bold leading-tight max-w-3xl">{heroAnnouncement?.title ?? "Bienvenido al Portal Interno"}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">{heroAnnouncement?.body ?? "Aquí encontrarás avisos, checklists pendientes y documentos recientes de tu puesto."}</p>
          <div className="mt-6 flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[10px] font-bold text-white/90">
              {(authorNameMap.get(heroAnnouncement?.created_by ?? "") || "DG").substring(0, 2).toUpperCase()}
            </div>
            <div className="text-[11px] leading-tight">
              <p className="font-medium text-white/90">{authorNameMap.get(heroAnnouncement?.created_by ?? "") || "Dirección General"}</p>
              <p className="text-white/45">{heroAnnouncement?.publish_at ? new Date(heroAnnouncement.publish_at).toLocaleDateString("es-AR") : "-"}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-stretch">
        <div className="space-y-8">
          <section className="flex min-h-[280px] flex-col space-y-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 sm:p-5 lg:min-h-[320px]">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--gbp-text2)]">
                <ClipboardCheck className="w-4 h-4 text-brand" /> Checklists Pendientes
              </h3>
              {hasChecklistsModule && (
                <Link href="/portal/checklist" className="text-xs font-bold text-brand hover:text-brand-dark flex items-center gap-1 group">
                  Ver todos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>

            {hasChecklistsModule && visibleTemplates.length > 0 ? (
              <div className="flex-1 space-y-3">
                {visibleTemplates.map((template) => (
                  <Link href={`/portal/checklist?preview=${template.id}`} key={template.id} className="block group">
                    <article className="flex items-center gap-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 transition-all hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] hover:shadow-lg hover:shadow-black/5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100"><ClipboardCheck className="h-5 w-5" /></div>
                      <div>
                        <h4 className="text-[14px] font-bold text-[var(--gbp-text)] transition-colors group-hover:text-[var(--gbp-accent)]">{template.name}</h4>
                        <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">Pendiente de completar</p>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
                {!hasChecklistsModule ? "Módulo inactivo" : "No tienes checklists pendientes."}
              </div>
            )}
          </section>

          <section className="flex min-h-[280px] flex-col space-y-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 sm:p-5 lg:min-h-[320px]">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--gbp-text2)]">
                <FileText className="w-4 h-4 text-blue-500" /> Documentos Recientes
              </h3>
              {hasDocumentsModule && (
                <Link href="/portal/documents" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group">
                  Ver archivos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>

            {hasDocumentsModule && visibleDocuments.length > 0 ? (
              <div className="flex-1 space-y-3">
                {visibleDocuments.map((doc) => (
                  <a href={`/api/documents/${doc.id}/download`} target="_blank" key={doc.id} className="block group">
                    <article className="flex items-center gap-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 transition-all hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] hover:shadow-lg hover:shadow-black/5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100"><FileText className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-[14px] font-bold text-[var(--gbp-text)] transition-colors group-hover:text-[var(--gbp-accent)]">{doc.title}</h4>
                        <p className="mt-1 mt-0.5 flex gap-2 text-[11px] text-[var(--gbp-text2)]">
                           <span className="uppercase">{doc.mime_type}</span>
                           <span>{new Date(doc.created_at).toLocaleDateString("es-AR")}</span>
                        </p>
                      </div>
                    </article>
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
                {!hasDocumentsModule ? "Módulo inactivo" : "No tienes documentos recientes."}
              </div>
            )}
          </section>
        </div>

        <section className="flex min-h-[280px] flex-col space-y-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 sm:p-5 lg:min-h-[320px]">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--gbp-text2)]">
              {hasAnnouncementsModule ? "Avisos Recientes" : "Comunicación Externa"}
            </h3>
            {hasAnnouncementsModule && (
              <Link href="/portal/announcements" className="text-xs font-bold text-orange-600 hover:text-orange-800 flex items-center gap-1 group">
                Ver todos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>

          <div className="flex-1 space-y-3">
            {recentAnnouncements.map((item) => (
              <article key={item.id} className="group relative flex gap-4 overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5 transition-all hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] hover:shadow-lg hover:shadow-black/5">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                  item.kind === "urgent" ? "bg-rose-50 text-rose-500 group-hover:bg-rose-100" :
                  item.kind === "reminder" ? "bg-amber-50 text-amber-500 group-hover:bg-amber-100" :
                  item.kind === "celebration" ? "bg-blue-50 text-blue-500 group-hover:bg-blue-100" :
                  "bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] group-hover:bg-[color:color-mix(in_oklab,var(--gbp-accent)_18%,transparent)]"
                }`}>
                  {item.kind === "urgent" && <AlertCircle className="h-5 w-5" />}
                  {item.kind === "reminder" && <CalendarClock className="h-5 w-5" />}
                  {item.kind === "celebration" && <PartyPopper className="h-5 w-5" />}
                  {item.kind === "general" && <Megaphone className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="pr-2 text-[14px] font-bold text-[var(--gbp-text)]">{item.title}</h3>
                  </div>
                  <p className="mt-1 text-[13px] leading-6 text-[var(--gbp-text2)]">{item.body}</p>
                  
                  <div className="mt-3 flex items-center gap-3 border-t border-[var(--gbp-border)] pt-3">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--gbp-text2)]">
                      <div className="grid h-4 w-4 place-items-center rounded-full bg-[var(--gbp-surface2)] text-[8px] font-bold text-[var(--gbp-text)]">
                        {(authorNameMap.get(item.created_by ?? "") || "DG").substring(0, 1).toUpperCase()}
                      </div>
                      {authorNameMap.get(item.created_by ?? "") || "Dirección General"}
                    </span>
                    <span className="text-[10px] text-[var(--gbp-muted)]">•</span>
                    <span className="text-[11px] font-medium text-[var(--gbp-muted)]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</span>
                  </div>
                </div>
              </article>
            ))}

            {!announcements.length ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
                {hasAnnouncementsModule
                  ? "No hay avisos vigentes para tu perfil."
                  : "El módulo de avisos no está habilitado."}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {showOnboardingWelcome ? (
        <EmployeeHomeWelcomeWorkspace
          open={showOnboardingWelcome}
          pendingDocs={pendingDocs}
          approvedDocs={approvedDocs}
          contractSigned={contractSigned}
          finishAction={markEmployeeOnboardingSeenAction}
        />
      ) : null}
    </>
  );
}
