import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { DocumentsPageWorkspace } from "@/modules/documents/ui/documents-page-workspace";
import { requireTenantModule } from "@/shared/lib/access";
import { getEnabledModules } from "@/modules/organizations/queries";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";

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

  const [{ data: folders }, { data: documents }, { data: branches }, { data: departments }, { data: positions }] =
    await Promise.all([
      supabase
        .from("document_folders")
        .select("id, name, parent_id, access_scope, created_at")
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("id, title, file_size_bytes, mime_type, file_path, folder_id, branch_id, access_scope, created_at")
.is('deleted_at', null)
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
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
    ]);

  const enabledModules = await getEnabledModules(tenant.organizationId);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const mappedBranches = (branches ?? []).map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  const scopedUsers = await buildScopeUsersCatalog(tenant.organizationId);

  return (
    <DocumentsPageWorkspace
      organizationId={tenant.organizationId}
      viewerUserId={viewerUserId}
      folders={folders ?? []}
      documents={documents ?? []}
      branches={branches ?? []}
      mappedBranches={mappedBranches}
      departments={departments ?? []}
      positions={positions ?? []}
      users={scopedUsers}
      customBrandingEnabled={customBrandingEnabled}
      initialAction={params.action}
      initialViewMode={initialViewMode}
    />
  );
}
