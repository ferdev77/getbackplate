import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { isEmployeePrivateDocument } from "@/shared/lib/employee-private-documents";
import { requireEmployeeModule } from "@/shared/lib/access";
import { getDocumentsScopeUsersCached, getDocumentsWorkspaceSeedCached } from "@/modules/documents/cached-queries";
import { EmployeeDocumentsTree } from "@/modules/documents/ui/employee-documents-tree";

import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { getSystemFolderType } from "@/shared/lib/employee-documents-folders-contract";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { getBranchDisplayName } from "@/shared/lib/branch-display";
import { resolveEmployeeLocationScope } from "@/shared/lib/employee-location-scope";

type EmployeeDocumentsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

function hasExplicitScopeValue(scope: unknown) {
  if (!scope || typeof scope !== "object") return false;
  const value = scope as Record<string, unknown>;
  const locations = Array.isArray(value.locations) ? value.locations : [];
  const departments = Array.isArray(value.department_ids) ? value.department_ids : [];
  const positions = Array.isArray(value.position_ids) ? value.position_ids : [];
  const users = Array.isArray(value.users) ? value.users : [];
  return locations.length > 0 || departments.length > 0 || positions.length > 0 || users.length > 0;
}

export default async function EmployeeDocumentsPage({ searchParams }: EmployeeDocumentsPageProps) {
  const tenant = await requireEmployeeModule("documents");
  const params = await searchParams;
  const initialViewMode = String(params.view ?? "").trim().toLowerCase() === "columns" ? "columns" : "tree";
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  const viewerUserName = authData.user?.user_metadata?.full_name?.trim() 
    || authData.user?.user_metadata?.name?.trim()
    || authData.user?.user_metadata?.first_name?.trim()
    || undefined;

  if (!userId) return null;

  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );
  const canViewCreatedDocuments =
    delegatedPermissions.documents.create || delegatedPermissions.documents.edit || delegatedPermissions.documents.delete;
  const enabledModulesSet = new Set(await getEnabledModulesCached(tenant.organizationId));
  const customBrandingEnabled = enabledModulesSet.has("custom_branding");

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, department_id, branch_id, all_locations, location_scope_ids, position")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: membershipRows } = await supabase
    .from("memberships")
    .select("branch_id, all_locations, location_scope_ids")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(20);

  const locationScope = await resolveEmployeeLocationScope(supabase, tenant.organizationId, {
    tenantBranchId: tenant.branchId,
    employeeBranchId: employeeRow?.branch_id ?? null,
    employeeLocationIds: employeeRow?.location_scope_ids ?? [],
    membershipRows,
    employeeAllLocations: employeeRow?.all_locations ?? false,
  });
  const employeeBranchId = locationScope.primaryLocationId;
  const allowedLocationIds = locationScope.locationIds;

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

  const [{ folders, documents, branches, departments, positions }, scopeUsers] = await Promise.all([
    getDocumentsWorkspaceSeedCached(tenant.organizationId),
    getDocumentsScopeUsersCached(tenant.organizationId),
  ]);

  const visibleDocumentIds = documents.map((doc) => doc.id);
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

  const folderById = new Map(folders.map((f) => [f.id, f]));

  const visibleDocuments = (documents ?? []).filter((doc) => {
    if (employeeDomainDocumentIds.has(doc.id)) {
      return false;
    }

    if (isEmployeePrivateDocument(doc.access_scope, doc.title)) {
      return false;
    }

    const effectiveScope = doc.folder_id
      ? (hasExplicitScopeValue(doc.access_scope)
          ? doc.access_scope
          : (folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope))
      : doc.access_scope;

    return canReadDocumentInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      branchIds: allowedLocationIds,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      isDirectlyAssigned: assignedDocumentIds.has(doc.id),
      accessScope: effectiveScope,
    });
  });

  const visibleFolderIds = new Set<string>();

  folders.forEach((folder) => {
    const isValid = canReadDocumentInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      branchIds: allowedLocationIds,
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

  const systemFolderIds = new Set(
    folders
      .filter((folder) => {
        const systemType = getSystemFolderType(folder.access_scope);
        return systemType === "employees_root" || systemType === "employee_home";
      })
      .map((folder) => folder.id),
  );

  const visibleFolders = folders.filter((folder) => visibleFolderIds.has(folder.id) && !systemFolderIds.has(folder.id));
  const visibleFolderIdSet = new Set(visibleFolders.map((folder) => folder.id));

  const finalFolders = visibleFolders.map((folder) => ({
    ...folder,
    parent_id: folder.parent_id && visibleFolderIdSet.has(folder.parent_id) ? folder.parent_id : null,
  }));

  const normalizedDocuments = visibleDocuments.map((doc) => ({
    ...doc,
    folder_id: doc.folder_id && visibleFolderIdSet.has(doc.folder_id) ? doc.folder_id : null,
  }));

  return (
    <>
      <EmployeeDocumentsTree
        organizationId={tenant.organizationId}
        viewerUserId={userId}
        viewerUserName={viewerUserName}
        folders={finalFolders}
        documents={normalizedDocuments.map((doc, i) => ({
          ...doc,
          is_new: i < 2,
        }))}
        initialViewMode={initialViewMode}
        canCreate={delegatedPermissions.documents.create}
        canEdit={delegatedPermissions.documents.edit}
        canDelete={delegatedPermissions.documents.delete}
        showCreatedView={canViewCreatedDocuments}
        branches={branches.map((branch) => ({
          ...branch,
          name: getBranchDisplayName(branch, customBrandingEnabled),
        }))}
        departments={departments}
        positions={positions}
        users={scopeUsers}
        recentDocuments={normalizedDocuments.slice(0, 6).map((doc) => ({
          id: doc.id,
          title: doc.title,
          branch_id: doc.branch_id,
          created_at: doc.created_at,
        }))}
        allowedLocationIds={allowedLocationIds}
      />
    </>
  );
}
