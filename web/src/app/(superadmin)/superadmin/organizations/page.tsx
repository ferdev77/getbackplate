import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { SuperadminOrganizationsWorkspace } from "@/modules/organizations/ui/superadmin-organizations-workspace";

type SuperadminOrganizationsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; org?: string }>;
};

async function getAuthUserMap() {
  const supabase = createSupabaseAdminClient();
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) break;

    for (const user of data.users) {
      map.set(user.id, user.email ?? user.id);
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return map;
}

export default async function SuperadminOrganizationsPage({ searchParams }: SuperadminOrganizationsPageProps) {
  const supabase = createSupabaseAdminClient();
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : "";
  const orgId = typeof params.org === "string" ? params.org : "";

  const [
    { data: organizations },
    { data: plans },
    { data: modules },
    { data: orgModules },
    { data: limits },
    { data: roles },
    { data: branchesUsage },
    { data: membershipsUsage },
    { data: employeesUsage },
    { data: storageUsage },
    { data: orgAddons },
    { data: addonModules },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status, plan_id, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("plans")
      .select("id, name, code, is_active, price_amount, currency_code, billing_period")
      .order("name"),
    supabase.from("module_catalog").select("id, code, name, is_core").order("name"),
    supabase.from("organization_modules").select("organization_id, module_id, is_enabled"),
    supabase
      .from("organization_limits")
      .select("organization_id, max_branches, max_users, max_storage_mb, max_employees"),
    supabase.from("roles").select("id, code"),
    supabase.from("branches").select("organization_id, is_active"),
    supabase.from("memberships").select("organization_id, status"),
    supabase.from("employees").select("organization_id, status"),
    supabase.from("documents").select("organization_id, file_size_bytes").is("deleted_at", null),
    supabase.from("organization_addons").select("organization_id, module_id, status").eq("status", "active"),
    supabase.from("module_catalog").select("id, addon_name, name").eq("is_available_as_addon", true),
  ]);

  const companyAdminRoleId = roles?.find((role) => role.code === "company_admin")?.id;

  const { data: adminMemberships } = companyAdminRoleId
    ? await supabase
        .from("memberships")
        .select("organization_id, user_id, status")
        .eq("role_id", companyAdminRoleId)
        .in("status", ["active", "invited"])
    : { data: [] };

  const authUserMap = await getAuthUserMap();

  return (
    <SuperadminOrganizationsWorkspace
      organizations={organizations ?? []}
      plans={plans ?? []}
      modules={modules ?? []}
      orgModules={orgModules ?? []}
      limits={limits ?? []}
      branchesUsage={branchesUsage ?? []}
      membershipsUsage={membershipsUsage ?? []}
      employeesUsage={employeesUsage ?? []}
      storageUsage={storageUsage ?? []}
      adminEntries={
        (adminMemberships ?? []).map((row) => ({
          organization_id: row.organization_id,
          email: authUserMap.get(row.user_id) ?? row.user_id,
          status: row.status,
        }))
      }
      orgAddons={(orgAddons ?? []).map((a) => ({ organization_id: a.organization_id, module_id: a.module_id }))}
      addonModules={(addonModules ?? []).map((m) => ({ id: m.id, name: m.addon_name ?? m.name }))}
      initialAction={action}
      initialOrgId={orgId}
      statusMessage={{ status: params.status, message: params.message }}
    />
  );
}
