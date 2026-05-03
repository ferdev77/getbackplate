import { unstable_cache } from "next/cache";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getEmployeeDocumentIdSet } from "@/shared/lib/document-domain";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { hasMissingColumnError } from "@/shared/lib/supabase-compat";

export const DOCUMENTS_WORKSPACE_SEED_TAG = "documents-workspace-seed-v1";
export const DOCUMENTS_SCOPE_USERS_TAG = "documents-scope-users-v1";

export const getDocumentsWorkspaceSeedCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();

    const fetchOrderedBranches = async () => {
      const primary = await supabase
        .from("branches")
        .select("id, name, city")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!hasMissingColumnError(primary.error, "sort_order")) return primary.data ?? [];

      const fallback = await supabase
        .from("branches")
        .select("id, name, city")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      return fallback.data ?? [];
    };

    const fetchOrderedDepartments = async () => {
      const primary = await supabase
        .from("organization_departments")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!hasMissingColumnError(primary.error, "sort_order")) return primary.data ?? [];

      const fallback = await supabase
        .from("organization_departments")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      return fallback.data ?? [];
    };

    const fetchOrderedPositions = async () => {
      const primary = await supabase
        .from("department_positions")
        .select("id, department_id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("department_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!hasMissingColumnError(primary.error, "sort_order")) return primary.data ?? [];

      const fallback = await supabase
        .from("department_positions")
        .select("id, department_id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("department_id", { ascending: true })
        .order("name", { ascending: true });
      return fallback.data ?? [];
    };

    const [{ data: folders }, { data: documents }, branches, departments, positions, employeeDocumentIds] =
      await Promise.all([
        supabase
          .from("document_folders")
          .select("id, name, parent_id, access_scope, created_at, created_by")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("documents")
          .select("id, title, file_size_bytes, mime_type, file_path, folder_id, branch_id, access_scope, created_at, owner_user_id")
          .is("deleted_at", null)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(300),
        fetchOrderedBranches(),
        fetchOrderedDepartments(),
        fetchOrderedPositions(),
        getEmployeeDocumentIdSet(supabase, organizationId),
      ]);

    return {
      folders: folders ?? [],
      documents: documents ?? [],
      branches,
      departments,
      positions,
      employeeDocumentIds: Array.from(employeeDocumentIds),
    };
  },
  [DOCUMENTS_WORKSPACE_SEED_TAG],
  { revalidate: 20, tags: [DOCUMENTS_WORKSPACE_SEED_TAG] },
);

export const getDocumentsScopeUsersCached = unstable_cache(
  async (organizationId: string) => buildScopeUsersCatalog(organizationId),
  [DOCUMENTS_SCOPE_USERS_TAG],
  { revalidate: 60, tags: [DOCUMENTS_SCOPE_USERS_TAG] },
);
