import { Suspense } from "react";
import { requireEmployeeModule } from "@/shared/lib/access";
import { getVendorDirectoryView } from "@/modules/vendors/services";
import VendorsTableWorkspace from "@/modules/vendors/ui/vendors-table-workspace";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";

export const metadata = {
  title: "Directorio de Proveedores",
};

async function VendorContent({
  organizationId,
  branchId,
  canCreate,
  canEdit,
  canDelete,
}: {
  organizationId: string;
  branchId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { vendors, branches, categories } = await getVendorDirectoryView(organizationId, {
    forEmployee: true,
    branchId,
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
  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    account.organizationId,
    account.membershipId,
  );

  if (!delegatedPermissions.vendors.view) {
    return null;
  }

  return (
    <Suspense fallback={<div className="p-8">Cargando directorio...</div>}>
      <VendorContent
        organizationId={account.organizationId}
        branchId={account.branchId}
        canCreate={delegatedPermissions.vendors.create}
        canEdit={delegatedPermissions.vendors.edit}
        canDelete={delegatedPermissions.vendors.delete}
      />
    </Suspense>
  );
}
