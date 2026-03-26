import Link from "next/link";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { markEmployeeOnboardingSeenAction } from "@/modules/onboarding/actions";
import { EmployeeWelcomeModal } from "@/modules/onboarding/ui/employee-welcome-modal";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { FileText, ClipboardCheck, ArrowRight } from "lucide-react";

function formatBytes(value: number | null) {
  const bytes = value ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function EmployeeHomePage() {
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) return null;

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, department_id, branch_id, hired_at, position, emergency_contact_name")
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
    { data: announcementsModuleEnabled },
    { data: checklistsModuleEnabled },
    { data: documentsModuleEnabled },
    { data: preferencesRow }
  ] = await Promise.all([
    supabase.rpc("is_module_enabled", { org_id: tenant.organizationId, module_code: "announcements" }),
    supabase.rpc("is_module_enabled", { org_id: tenant.organizationId, module_code: "checklists" }),
    supabase.rpc("is_module_enabled", { org_id: tenant.organizationId, module_code: "documents" }),
    supabase
      .from("user_preferences")
      .select("onboarding_seen_at")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  let announcements: Array<any> = [];
  const hasAnnouncementsModule = Boolean(announcementsModuleEnabled);

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

  // Fetch Documents
  let visibleDocuments: any[] = [];
  const hasDocumentsModule = Boolean(documentsModuleEnabled);
  if (hasDocumentsModule) {
    const { data: documents } = await supabase
      .from("documents")
      .select("id, title, mime_type, file_size_bytes, created_at, access_scope")
.is('deleted_at', null)
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(20);

    const assignedDocumentIds = new Set<string>();
    if (employeeRow?.id) {
      const { data: links } = await supabase
        .from("employee_documents")
        .select("document_id")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeRow.id);

      for (const link of links ?? []) {
        assignedDocumentIds.add(link.document_id);
      }
    }

    visibleDocuments = (documents ?? []).filter((doc) =>
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
  let visibleTemplates: any[] = [];
  const hasChecklistsModule = Boolean(checklistsModuleEnabled);
  if (hasChecklistsModule) {
    const { data: templates } = await supabase
      .from("checklist_templates")
      .select("id, name, branch_id, department_id, target_scope, updated_at")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(20);

    visibleTemplates = (templates ?? []).filter((template) =>
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
      <section className="rounded-3xl bg-[#1e1a18] p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10 blur-2xl">
           <div className="w-64 h-64 bg-brand rounded-full"></div>
        </div>
        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#e74c3c]">Mensaje de la Dirección</p>
          <h2 className="font-serif text-3xl font-bold leading-tight">{heroAnnouncement?.title ?? "Bienvenido al Portal Interno"}</h2>
          <p className="mt-4 text-sm leading-7 text-[#b8b0aa] max-w-2xl">{heroAnnouncement?.body ?? "Aquí encontrarás avisos, checklists pendientes y documentos recientes de tu puesto."}</p>
          <p className="mt-4 text-[11px] text-[#665f5a]">Publicado: {heroAnnouncement?.publish_at ? new Date(heroAnnouncement.publish_at).toLocaleDateString("es-AR") : "-"}</p>
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#8b817c] flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-brand" /> Checklists Pendientes
              </h3>
              {hasChecklistsModule && (
                <Link href="/portal/checklist" className="text-xs font-bold text-brand hover:text-brand-dark flex items-center gap-1 group">
                  Ver todos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>

            {hasChecklistsModule && visibleTemplates.length > 0 ? (
              <div className="space-y-3">
                {visibleTemplates.map((template) => (
                  <Link href={`/portal/checklist?preview=${template.id}`} key={template.id} className="block group">
                    <article className="flex items-center gap-4 rounded-2xl border border-[#e8e8e8] bg-white p-4 transition-all hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100"><ClipboardCheck className="h-5 w-5" /></div>
                      <div>
                        <h4 className="text-[14px] font-bold text-[#111] group-hover:text-brand transition-colors">{template.name}</h4>
                        <p className="text-[11px] text-[#888] mt-0.5">Pendiente de completar</p>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#dccfca] bg-white/50 px-4 py-8 text-center text-sm text-[#8b817c]">
                {!hasChecklistsModule ? "Módulo inactivo" : "No tienes checklists pendientes."}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#8b817c] flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" /> Documentos Recientes
              </h3>
              {hasDocumentsModule && (
                <Link href="/portal/documents" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group">
                  Ver archivos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>

            {hasDocumentsModule && visibleDocuments.length > 0 ? (
              <div className="space-y-3">
                {visibleDocuments.map((doc) => (
                  <a href={`/api/documents/${doc.id}/download`} target="_blank" key={doc.id} className="block group">
                    <article className="flex items-center gap-4 rounded-2xl border border-[#e8e8e8] bg-white p-4 transition-all hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100"><FileText className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-[14px] font-bold text-[#111] group-hover:text-blue-600 transition-colors">{doc.title}</h4>
                        <p className="text-[11px] text-[#888] mt-0.5 mt-1 flex gap-2">
                           <span className="uppercase">{doc.mime_type}</span>
                           <span>{new Date(doc.created_at).toLocaleDateString("es-AR")}</span>
                        </p>
                      </div>
                    </article>
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#dccfca] bg-white/50 px-4 py-8 text-center text-sm text-[#8b817c]">
                {!hasDocumentsModule ? "Módulo inactivo" : "No tienes documentos recientes."}
              </div>
            )}
          </section>
        </div>

        <section className="space-y-4">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#8b817c]">
            {hasAnnouncementsModule ? "Avisos Recientes" : "Comunicación Externa"}
          </h3>

          <div className="space-y-3">
            {recentAnnouncements.map((item) => (
              <article key={item.id} className="flex gap-4 rounded-2xl border border-[#e8e8e8] bg-white p-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff8f0] text-lg">📣</div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#111]">{item.title}</h3>
                  <p className="mt-1 text-[13px] leading-6 text-[#666]">{item.body}</p>
                  <p className="mt-2 text-[11px] font-medium text-[#bbb]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</p>
                </div>
              </article>
            ))}

            {!announcements.length ? (
              <div className="rounded-2xl border border-dashed border-[#dccfca] bg-white/50 px-4 py-8 text-center text-sm text-[#8b817c]">
                {hasAnnouncementsModule
                  ? "No hay avisos vigentes para tu perfil."
                  : "El módulo de avisos no está habilitado."}
              </div>
            ) : null}
          </div>
        </section>
      </div>

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
