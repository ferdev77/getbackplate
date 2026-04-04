import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { isEmployeePrivateDocument } from "@/shared/lib/employee-private-documents";
import { requireEmployeeModule } from "@/shared/lib/access";
import { EmployeeDocumentsTree } from "@/modules/documents/ui/employee-documents-tree";

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

  const [{ data: folders }, { data: documents }] = await Promise.all([
    supabase
      .from("document_folders")
      .select("id, name, parent_id, access_scope, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, title, mime_type, file_size_bytes, folder_id, created_at, access_scope")
.is('deleted_at', null)
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

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

  const folderById = new Map((folders ?? []).map((f) => [f.id, f]));

  const visibleDocuments = (documents ?? []).filter((doc) => {
    if (isEmployeePrivateDocument(doc.access_scope, doc.title)) {
      return false;
    }

    const effectiveScope = doc.folder_id
      ? folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope
      : doc.access_scope;

    return canReadDocumentInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      isDirectlyAssigned: assignedDocumentIds.has(doc.id),
      accessScope: effectiveScope,
    });
  });

  const visibleFolderIds = new Set<string>();

  (folders ?? []).forEach((folder) => {
    const isValid = canReadDocumentInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      isDirectlyAssigned: false,
      accessScope: folder.access_scope,
    });
    if (isValid) {
      visibleFolderIds.add(folder.id);
    }
  });

  for (const doc of visibleDocuments) {
    let currentId = doc.folder_id;
    while (currentId) {
      visibleFolderIds.add(currentId);
      currentId = folderById.get(currentId)?.parent_id ?? null;
    }
  }

  const finalFolders = (folders ?? []).filter((f) => visibleFolderIds.has(f.id));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[18px] font-bold text-[var(--gbp-text)]">Tus Documentos</h1>
        <p className="mt-1 text-sm text-[var(--gbp-text2)]">
          Explora los archivos y carpetas a los que tienes acceso segun tu perfil.
        </p>
      </div>

      <EmployeeDocumentsTree
        folders={finalFolders}
        documents={visibleDocuments.map((doc, i) => ({
          ...doc,
          is_new: i < 2, 
        }))}
      />
    </>
  );
}
