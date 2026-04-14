import { Trash2 } from "lucide-react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";
import { DocumentTrashList } from "@/modules/trash/ui/document-trash-list";
import { SlideUp } from "@/shared/ui/animations";
import { getEmployeeDocumentIdSet } from "@/shared/lib/document-domain";

export default async function CompanyTrashPage() {
  const tenant = await requireTenantModule("documents");
  const supabase = await createSupabaseServerClient();

  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const [{ data: documents }, employeeDocumentIds] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, file_size_bytes, deleted_at")
      .eq("organization_id", tenant.organizationId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", fifteenDaysAgo.toISOString())
      .order("deleted_at", { ascending: false })
      .limit(400),
    getEmployeeDocumentIdSet(supabase, tenant.organizationId),
  ]);

  const companyTrashDocuments = (documents ?? []).filter((doc) => !employeeDocumentIds.has(doc.id)).slice(0, 100);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <SlideUp>
        <section className="mb-5 flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
            <Trash2 className="h-4 w-4" />
            <h1 className="text-[18px] font-bold">Papelera</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Los documentos eliminados se conservarán aquí por 15 días antes de ser eliminados definitivamente.
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <DocumentTrashList documents={companyTrashDocuments} />
      </SlideUp>
    </main>
  );
}
