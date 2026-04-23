import { getVendorDirectoryView } from "@/modules/vendors/services";
import VendorsTableWorkspace from "@/modules/vendors/ui/vendors-table-workspace";
import { PageContent } from "@/shared/ui/page-content";

type Props = {
  organizationId: string;
  roleCode: string;
};

export async function VendorsPageWorkspace({ organizationId }: Props) {
  const { vendors, branches } = await getVendorDirectoryView(organizationId);

  return (
    <PageContent>
      <VendorsTableWorkspace
        initialVendors={vendors}
        branches={branches}
        organizationId={organizationId}
        deferredDataUrl="/api/company/vendors"
      />
    </PageContent>
  );
}
