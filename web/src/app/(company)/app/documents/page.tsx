import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { DocumentsPageWorkspace } from "@/modules/documents/ui/documents-page-workspace";
import { requireTenantModule } from "@/shared/lib/access";
import { getEnabledModules } from "@/modules/organizations/queries";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { getEmployeeDocumentIdSet } from "@/shared/lib/document-domain";

type CompanyDocumentsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; view?: string }>;
};

function hasMissingColumnError(error: { message?: string } | null, column: string) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("column") && message.includes(column.toLowerCase());
}

export default async function CompanyDocumentsPage({
  searchParams,
}: CompanyDocumentsPageProps) {
  const tenant = await requireTenantModule("documents");
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const viewerUserId = authData.user?.id ?? "";
  const initialViewMode = String(params.view ?? "").trim().toLowerCase() === "columns" ? "columns" : "tree";

  const fetchOrderedBranches = async () => {
    const primary = await supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return { data: primary.data };

    return supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });
  };

  const fetchOrderedDepartments = async () => {
    const primary = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return { data: primary.data };

    return supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });
  };

  const fetchOrderedPositions = async () => {
    const primary = await supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return { data: primary.data };

    return supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("name", { ascending: true });
  };

  const [{ data: folders }, { data: documents }, { data: branches }, { data: departments }, { data: positions }, employeeDocumentIds] =
    await Promise.all([
      supabase
        .from("document_folders")
        .select("id, name, parent_id, access_scope, created_at, created_by")
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("id, title, file_size_bytes, mime_type, file_path, folder_id, branch_id, access_scope, created_at")
        .is("deleted_at", null)
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false })
        .limit(150),
      fetchOrderedBranches(),
      fetchOrderedDepartments(),
      fetchOrderedPositions(),
      getEmployeeDocumentIdSet(supabase, tenant.organizationId),
    ]);

  const companyDocuments = (documents ?? []).filter((doc) => !employeeDocumentIds.has(doc.id)).slice(0, 100);

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
      documents={companyDocuments}
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
