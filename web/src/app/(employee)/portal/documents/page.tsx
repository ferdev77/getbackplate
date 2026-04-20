import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { isEmployeePrivateDocument } from "@/shared/lib/employee-private-documents";
import { requireEmployeeModule } from "@/shared/lib/access";
import { EmployeeDocumentsTree } from "@/modules/documents/ui/employee-documents-tree";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { getBranchDisplayName } from "@/shared/lib/branch-display";

type EmployeeDocumentsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function EmployeeDocumentsPage({ searchParams }: EmployeeDocumentsPageProps) {
  const tenant = await requireEmployeeModule("documents");
  const params = await searchParams;
  const initialViewMode = String(params.view ?? "").trim().toLowerCase() === "columns" ? "columns" : "tree";
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) return null;

  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );
  const enabledModulesSet = new Set(await getEnabledModulesCached(tenant.organizationId));
  const customBrandingEnabled = enabledModulesSet.has("custom_branding");

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

  const [{ data: folders }, { data: documents }, { data: branches }, { data: departments }, { data: positions }, scopeUsers] = await Promise.all([
    supabase
      .from("document_folders")
      .select("id, name, parent_id, access_scope, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, title, mime_type, file_size_bytes, folder_id, created_at, branch_id, access_scope, owner_user_id")
.is('deleted_at', null)
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    buildScopeUsersCatalog(tenant.organizationId),
  ]);

  const visibleDocumentIds = (documents ?? []).map((doc) => doc.id);
  let employeeDomainDocumentIds = new Set<string>();

  if (visibleDocumentIds.length > 0) {
    const { data: employeeDomainLinks } = await supabase
      .from("employee_documents")
      .select("document_id")
      .eq("organization_id", tenant.organizationId)
      .in("document_id", visibleDocumentIds);

    employeeDomainDocumentIds = new Set((employeeDomainLinks ?? []).map((row) => row.document_id));
  }

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
    if (employeeDomainDocumentIds.has(doc.id)) {
      return false;
    }

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
      <EmployeeDocumentsTree
        organizationId={tenant.organizationId}
        viewerUserId={userId}
        folders={finalFolders}
        documents={visibleDocuments.map((doc, i) => ({
          ...doc,
          is_new: i < 2, 
        }))}
        initialViewMode={initialViewMode}
        canCreate={delegatedPermissions.documents.create}
        canEdit={delegatedPermissions.documents.edit}
        canDelete={delegatedPermissions.documents.delete}
        branches={(branches ?? []).map((branch) => ({
          ...branch,
          name: getBranchDisplayName(branch, customBrandingEnabled),
        }))}
        departments={departments ?? []}
        positions={positions ?? []}
        users={scopeUsers}
        recentDocuments={visibleDocuments.slice(0, 6).map((doc) => ({
          id: doc.id,
          title: doc.title,
          branch_id: doc.branch_id,
          created_at: doc.created_at,
        }))}
      />
    </>
  );
}
