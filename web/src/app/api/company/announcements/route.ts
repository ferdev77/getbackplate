import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { extractDisplayName } from "@/shared/lib/user";
import { hasMissingColumnError } from "@/shared/lib/supabase-compat";

export async function GET(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("announcements");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const url = new URL(request.url);
  const catalog = url.searchParams.get("catalog");
  if (catalog !== "create_modal") {
    return NextResponse.json({ error: "Consulta no soportada" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = moduleAccess.tenant.organizationId;

  const [branchesResult, departmentsResult, positionsResult] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const [{ data: branches }, { data: departments }, { data: positions }] = await Promise.all([
    hasMissingColumnError(branchesResult.error, "sort_order")
      ? supabase
          .from("branches")
          .select("id, name, city")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name", { ascending: true })
      : Promise.resolve({ data: branchesResult.data }),
    hasMissingColumnError(departmentsResult.error, "sort_order")
      ? supabase
          .from("organization_departments")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name", { ascending: true })
      : Promise.resolve({ data: departmentsResult.data }),
    hasMissingColumnError(positionsResult.error, "sort_order")
      ? supabase
          .from("department_positions")
          .select("id, department_id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("department_id", { ascending: true })
          .order("name", { ascending: true })
      : Promise.resolve({ data: positionsResult.data }),
  ]);

  const [{ data: authData }, { data: customBrandingEnabled }, users] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    buildScopeUsersCatalog(organizationId),
  ]);

  const mappedBranches = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: customBrandingEnabled && branch.city ? branch.city : branch.name,
  }));

  return NextResponse.json({
    publisherName: extractDisplayName(authData.user),
    branches: mappedBranches,
    departments: departments ?? [],
    positions: positions ?? [],
    users,
  });
}
