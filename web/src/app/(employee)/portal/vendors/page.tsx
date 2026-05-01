import { Suspense } from "react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeModule } from "@/shared/lib/access";
import { getVendorDirectoryView } from "@/modules/vendors/services";
import VendorsTableWorkspace from "@/modules/vendors/ui/vendors-table-workspace";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { resolveEmployeeLocationScope } from "@/shared/lib/employee-location-scope";

export const metadata = {
  title: "Directorio de Proveedores",
};

async function VendorContent({
  organizationId,
  branchIds,
  canCreate,
  canEdit,
  canDelete,
}: {
  organizationId: string;
  branchIds: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { vendors, branches, categories } = await getVendorDirectoryView(organizationId, {
    forEmployee: true,
    branchIds,
  });

  return (
    <VendorsTableWorkspace
      initialVendors={vendors}
      branches={branches}
      initialCategories={categories}
      organizationId={organizationId}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      apiBasePath="/api/employee/vendors"
      historyEndpointBase="/api/employee/vendors"
      deferredDataUrl="/api/employee/vendors"
    />
  );
}

export default async function EmployeeVendorsPage() {
  const account = await requireEmployeeModule("vendors");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  const [delegatedPermissions, employeeData, membershipData] = await Promise.all([
    getEmployeeDelegatedPermissionsByMembership(account.organizationId, account.membershipId),
    userId
      ? supabase
          .from("employees")
          .select("branch_id, all_locations, location_scope_ids")
          .eq("organization_id", account.organizationId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("memberships")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", account.organizationId)
      .eq("user_id", userId ?? "")
      .eq("status", "active"),
  ]);

  if (!delegatedPermissions.vendors.view) {
    return null;
  }

  const locationScope = await resolveEmployeeLocationScope(supabase, account.organizationId, {
    tenantBranchId: account.branchId,
    employeeBranchId: employeeData.data?.branch_id ?? null,
    employeeLocationIds: employeeData.data?.location_scope_ids ?? null,
    employeeAllLocations: employeeData.data?.all_locations ?? null,
    membershipRows: membershipData.data ?? [],
  });

  return (
    <Suspense fallback={<div className="p-8">Cargando directorio...</div>}>
      <VendorContent
        organizationId={account.organizationId}
        branchIds={locationScope.locationIds}
        canCreate={delegatedPermissions.vendors.create}
        canEdit={delegatedPermissions.vendors.edit}
        canDelete={delegatedPermissions.vendors.delete}
      />
    </Suspense>
  );
}
