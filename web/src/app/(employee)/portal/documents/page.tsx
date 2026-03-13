import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { requireEmployeeModule } from "@/shared/lib/access";

function formatBytes(value: number | null) {
  const bytes = value ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function EmployeeDocumentsPage() {
  const tenant = await requireEmployeeModule("documents");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) return null;

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, department_id, branch_id, position")
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

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, mime_type, file_size_bytes, created_at, access_scope")
    .eq("organization_id", tenant.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

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

  const visibleDocuments = (documents ?? []).filter((doc) =>
    canReadDocumentInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      isDirectlyAssigned: assignedDocumentIds.has(doc.id),
      accessScope: doc.access_scope,
    }),
  );

  return (
    <>
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#bbb]">Tus documentos asignados</p>
      <section className="space-y-3">
        {visibleDocuments.map((doc, index) => (
          <article key={doc.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e8e8e8] bg-white px-6 py-5 transition hover:-translate-y-[1px] hover:border-[#c0392b] hover:shadow-[0_6px_24px_rgba(192,57,43,.08)]">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[#f0d5d0] bg-[#fff5f3] text-2xl">📄</div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-serif text-lg font-bold text-[#111]">{doc.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-[#eee] bg-[#f5f5f5] px-2.5 py-1 text-[#888]">{(doc.mime_type ?? "Archivo").toUpperCase()} - {formatBytes(doc.file_size_bytes)}</span>
                <span className="rounded-full border border-[#eee] bg-[#f5f5f5] px-2.5 py-1 text-[#888]">Portal Empleado</span>
                <span className="text-[#bbb]">Actualizado {new Date(doc.created_at).toLocaleDateString("es-AR")}</span>
                {index < 2 ? <span className="rounded-full border border-[#c3efd4] bg-[#edfbf3] px-2.5 py-1 font-bold text-[#27ae60]">NUEVO</span> : null}
              </div>
            </div>
            <div className="flex gap-2">
              <a href={`/api/documents/${doc.id}/download`} target="_blank" className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#666] hover:bg-[#eee] hover:text-[#111]">Vista previa</a>
              <a href={`/api/documents/${doc.id}/download`} className="rounded-lg bg-[#111] px-5 py-2 text-sm font-bold text-white hover:bg-[#c0392b]">Descargar</a>
            </div>
          </article>
        ))}

        {!visibleDocuments.length ? (
          <div className="rounded-xl border border-dashed border-[#dccfca] bg-white px-4 py-8 text-center text-sm text-[#8b817c]">Aun no tienes documentos visibles o asignados.</div>
        ) : null}
      </section>

      <section className="mt-6 flex items-start gap-3 rounded-xl border border-[#f0f0f0] bg-[#fafafa] px-5 py-4">
        <span className="text-2xl">🔒</span>
        <div>
          <p className="text-sm font-bold text-[#555]">Acceso controlado</p>
          <p className="text-xs leading-6 text-[#999]">Solo puedes ver y descargar documentos asignados a tu puesto, departamento, locacion o usuario.</p>
        </div>
      </section>
    </>
  );
}
