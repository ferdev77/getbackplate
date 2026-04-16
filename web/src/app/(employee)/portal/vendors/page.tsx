import { Suspense } from "react";
import { requireEmployeeModule } from "@/shared/lib/access";
import { getVendorDirectoryView } from "@/modules/vendors/services";
import EmployeeVendorsView from "@/modules/vendors/ui/vendors-employee-view";

export const metadata = {
  title: "Directorio de Proveedores",
};

async function VendorContent({
  organizationId,
  branchId,
}: {
  organizationId: string;
  branchId: string | null;
}) {
  const { vendors, branches } = await getVendorDirectoryView(organizationId, {
    forEmployee: true,
    branchId,
  });

  return <EmployeeVendorsView initialVendors={vendors} branches={branches} />;
}

export default async function EmployeeVendorsPage() {
  const account = await requireEmployeeModule("vendors");

  return (
    <Suspense fallback={<div className="p-8">Cargando directorio...</div>}>
      <VendorContent
        organizationId={account.organizationId}
        branchId={account.branchId}
      />
    </Suspense>
  );
}
