import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { extractDisplayName } from "@/shared/lib/user";

export async function GET(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("announcements");
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

  const [{ data: authData }, { data: customBrandingEnabled }, { data: branches }, { data: departments }, { data: positions }, users] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
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
