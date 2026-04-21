import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireAuthenticatedUser, requireEmployeeModule } from "@/shared/lib/access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { DocumentTrashList } from "@/modules/trash/ui/document-trash-list";
import { SlideUp } from "@/shared/ui/animations";
import { getEmployeeDocumentIdSet } from "@/shared/lib/document-domain";
import { PageContent } from "@/shared/ui/page-content";

export default async function EmployeeTrashPage() {
  const [user, tenant] = await Promise.all([
    requireAuthenticatedUser(),
    requireEmployeeModule("documents"),
  ]);

  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );

  if (!delegatedPermissions.documents.delete) {
    redirect("/portal/documents?status=error&message=No%20tienes%20permiso%20para%20acceder%20a%20la%20papelera");
  }

  const supabase = await createSupabaseServerClient();
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const [{ data: documents }, employeeDocumentIds] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, file_size_bytes, deleted_at")
      .eq("organization_id", tenant.organizationId)
      .eq("owner_user_id", user.id)
      .not("deleted_at", "is", null)
      .gte("deleted_at", fifteenDaysAgo.toISOString())
      .order("deleted_at", { ascending: false })
      .limit(400),
    getEmployeeDocumentIdSet(supabase, tenant.organizationId),
  ]);

  const employeeTrashDocuments = (documents ?? []).filter((doc) => !employeeDocumentIds.has(doc.id)).slice(0, 100);

  return (
    <PageContent>
      <SlideUp>
        <section className="mb-5 flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
            <Trash2 className="h-4 w-4" />
            <h1 className="text-lg font-bold">Papelera</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Los documentos eliminados se conservaran aqui por 15 dias antes de ser eliminados definitivamente.
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <DocumentTrashList documents={employeeTrashDocuments} scope="employee" />
      </SlideUp>
    </PageContent>
  );
}
