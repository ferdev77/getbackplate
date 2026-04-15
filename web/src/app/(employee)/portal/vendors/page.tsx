import { Suspense } from "react";
import { assertEmployeeModule } from "@/shared/lib/access";
import EmployeeVendorsView from "@/modules/vendors/ui/vendors-employee-view";

export const metadata = {
  title: "Directorio de Proveedores",
};

export default async function EmployeeVendorsPage() {
  const account = await assertEmployeeModule("vendors");

  return (
    <Suspense fallback={<div className="p-8">Cargando directorio...</div>}>
      <EmployeeVendorsView
        organizationId={account.organizationId}
        employeeId={account.employeeId}
      />
    </Suspense>
  );
}
