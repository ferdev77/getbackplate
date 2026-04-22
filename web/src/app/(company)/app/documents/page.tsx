import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getDocumentsScopeUsersCached, getDocumentsWorkspaceSeedCached } from "@/modules/documents/cached-queries";
import { DocumentsPageWorkspace } from "@/modules/documents/ui/documents-page-workspace";
import { requireTenantModule } from "@/shared/lib/access";
import { getEnabledModules } from "@/modules/organizations/queries";

type CompanyDocumentsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; view?: string }>;
};

export default async function CompanyDocumentsPage({
  searchParams,
}: CompanyDocumentsPageProps) {
  const tenant = await requireTenantModule("documents");
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const viewerUserId = authData.user?.id ?? "";
  const initialViewMode = String(params.view ?? "").trim().toLowerCase() === "columns" ? "columns" : "tree";

  const [{ folders, documents, branches, departments, positions, employeeDocumentIds }, scopedUsers] = await Promise.all([
    getDocumentsWorkspaceSeedCached(tenant.organizationId),
    getDocumentsScopeUsersCached(tenant.organizationId),
  ]);

  const employeeDocumentIdsSet = new Set(employeeDocumentIds);
  const companyDocuments = documents.filter((doc) => !employeeDocumentIdsSet.has(doc.id)).slice(0, 100);

  const enabledModules = await getEnabledModules(tenant.organizationId);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const mappedBranches = (branches ?? []).map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  return (
    <DocumentsPageWorkspace
      organizationId={tenant.organizationId}
      viewerUserId={viewerUserId}
      folders={folders}
      documents={companyDocuments}
      branches={branches}
      mappedBranches={mappedBranches}
      departments={departments}
      positions={positions}
      users={scopedUsers}
      customBrandingEnabled={customBrandingEnabled}
      initialAction={params.action}
      initialViewMode={initialViewMode}
    />
  );
}
