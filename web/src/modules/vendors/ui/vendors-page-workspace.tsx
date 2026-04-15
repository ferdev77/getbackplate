import { getVendorDirectoryView } from "@/modules/vendors/services";
import VendorsTableWorkspace from "@/modules/vendors/ui/vendors-table-workspace";

type Props = {
  organizationId: string;
  roleCode: string;
};

export async function VendorsPageWorkspace({ organizationId }: Props) {
  const { vendors, branches } = await getVendorDirectoryView(organizationId);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <VendorsTableWorkspace
        initialVendors={vendors}
        branches={branches}
        organizationId={organizationId}
      />
    </main>
  );
}
