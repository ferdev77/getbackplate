import { Suspense } from "react";
import { requireTenantModule } from "@/shared/lib/access";
import { VendorsPageWorkspace } from "@/modules/vendors/ui/vendors-page-workspace";

export const metadata = {
  title: "Proveedores",
};

export default async function VendorsPage() {
  const tenant = await requireTenantModule("vendors");

  return (
    <Suspense fallback={<div className="p-8">Cargando proveedores...</div>}>
      <VendorsPageWorkspace
        organizationId={tenant.organizationId}
        roleCode={tenant.roleCode}
      />
    </Suspense>
  );
}
