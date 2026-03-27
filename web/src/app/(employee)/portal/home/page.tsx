import Link from "next/link";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { markEmployeeOnboardingSeenAction } from "@/modules/onboarding/actions";
import { EmployeeWelcomeModal } from "@/modules/onboarding/ui/employee-welcome-modal";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { FileText, ClipboardCheck, ArrowRight, AlertCircle, CalendarClock, PartyPopper, Megaphone } from "lucide-react";

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

  const { data: department } = employeeRow?.department_id
    ? await supabase
        .from("organization_departments")
        .select("name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", employeeRow.department_id)
        .maybeSingle()
    : { data: null };

  const resolvedBranch = employeeBranchId
    ? await supabase
        .from("branches")
        .select("name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", employeeBranchId)
        .maybeSingle()
    : { data: null };

  let docsCount = 0;
  if (documentsModuleEnabled && userId && tenant.organizationId) {
    const { data: countData } = await supabase.rpc("count_accessible_documents", {
      p_organization_id: tenant.organizationId,
      p_user_id: userId,
      p_role_code: tenant.roleCode,
      p_branch_id: employeeBranchId,
      p_department_id: employeeRow?.department_id ?? null,
      p_position_ids: employeePositionIds,
    });
    docsCount = countData ?? 0;
  }

  const employeeName = employeeRow
    ? `${employeeRow.first_name} ${employeeRow.last_name}`.trim()
    : (typeof authData.user?.user_metadata?.full_name === "string" && authData.user.user_metadata.full_name.trim()) || authData.user?.email || "Empleado";

  let announcements: Array<any> = [];
  const hasAnnouncementsModule = Boolean(announcementsModuleEnabled);

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
      <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#e8e8e8] bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-xs text-[#aaa]">Bienvenido de vuelta</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-[#111]">{employeeName}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
            {resolvedBranch.data?.name && <span className="rounded-full border border-[#e8e8e8] bg-[#f5f5f5] px-3 py-1 text-[#666]">{resolvedBranch.data.name}</span>}
            {department?.name && <span className="rounded-full border border-[#dbe7ff] bg-[#f2f6ff] px-3 py-1 text-[#3b5bdb]">{department.name}</span>}
            {employeeRow?.position && <span className="rounded-full border border-[#f0d5d0] bg-[#fef0ed] px-3 py-1 text-[#c0392b]">{employeeRow.position}</span>}
          </div>
        </div>
        <div className="rounded-xl bg-[#faf9f8] p-5 text-center min-w-[140px]">
          <p className="font-serif text-5xl font-bold leading-none text-[#c0392b]">{docsCount}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-[#8b817c]">Documentos</p>
        </div>
      </section>
      <section className="rounded-3xl bg-[#1e1a18] p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10 blur-2xl">
           <div className="w-64 h-64 bg-brand rounded-full"></div>
        </div>
        <div className="relative z-10 flex flex-col items-start">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex rounded-full bg-[#111] border border-[#332b27] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#e74c3c]">
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
          <p className="mt-4 text-sm leading-7 text-[#b8b0aa] max-w-2xl">{heroAnnouncement?.body ?? "Aquí encontrarás avisos, checklists pendientes y documentos recientes de tu puesto."}</p>
          <div className="mt-6 flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#302824] text-[10px] font-bold text-[#e8e8e8]">
              {(authorNameMap.get(heroAnnouncement?.created_by ?? "") || "DG").substring(0, 2).toUpperCase()}
            </div>
            <div className="text-[11px] leading-tight">
              <p className="font-medium text-[#e8e8e8]">{authorNameMap.get(heroAnnouncement?.created_by ?? "") || "Dirección General"}</p>
              <p className="text-[#665f5a]">{heroAnnouncement?.publish_at ? new Date(heroAnnouncement.publish_at).toLocaleDateString("es-AR") : "-"}</p>
            </div>
          </div>
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
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.15em] text-[#8b817c]">
              {hasAnnouncementsModule ? "Avisos Recientes" : "Comunicación Externa"}
            </h3>
            {hasAnnouncementsModule && (
              <Link href="/portal/announcements" className="text-xs font-bold text-orange-600 hover:text-orange-800 flex items-center gap-1 group">
                Ver todos <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>

          <div className="space-y-3">
            {recentAnnouncements.map((item) => (
              <article key={item.id} className="group relative flex gap-4 overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white p-5 transition-all hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                  item.kind === "urgent" ? "bg-rose-50 text-rose-500 group-hover:bg-rose-100" :
                  item.kind === "reminder" ? "bg-amber-50 text-amber-500 group-hover:bg-amber-100" :
                  item.kind === "celebration" ? "bg-blue-50 text-blue-500 group-hover:bg-blue-100" :
                  "bg-[#fff8f0] text-orange-400 group-hover:bg-orange-100"
                }`}>
                  {item.kind === "urgent" && <AlertCircle className="h-5 w-5" />}
                  {item.kind === "reminder" && <CalendarClock className="h-5 w-5" />}
                  {item.kind === "celebration" && <PartyPopper className="h-5 w-5" />}
                  {item.kind === "general" && <Megaphone className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[14px] font-bold text-[#111] pr-2">{item.title}</h3>
                  </div>
                  <p className="mt-1 text-[13px] leading-6 text-[#666]">{item.body}</p>
                  
                  <div className="mt-3 flex items-center gap-3 border-t border-[#f5f5f5] pt-3">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#888]">
                      <div className="grid h-4 w-4 place-items-center rounded-full bg-[#f0f0f0] text-[8px] font-bold text-[#555]">
                        {(authorNameMap.get(item.created_by ?? "") || "DG").substring(0, 1).toUpperCase()}
                      </div>
                      {authorNameMap.get(item.created_by ?? "") || "Dirección General"}
                    </span>
                    <span className="text-[10px] text-[#ccc]">•</span>
                    <span className="text-[11px] font-medium text-[#bbb]">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("es-AR") : "-"}</span>
                  </div>
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
