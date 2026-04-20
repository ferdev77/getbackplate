import { Trash2 } from "lucide-react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { SuperadminDocumentTrashList } from "@/modules/trash/ui/superadmin-document-trash-list";
import { SlideUp } from "@/shared/ui/animations";
import { PageContent } from "@/shared/ui/page-content";

type TrashedDocumentRow = {
  id: string;
  title: string;
  file_size_bytes: number;
  deleted_at: string;
  organization_id: string;
  organizations?: { name: string } | null;
};

export default async function SuperadminTrashPage() {
  await requireSuperadmin();
  const supabase = await createSupabaseServerClient();

  // Get ALL deleted documents with their corresponding organization
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, file_size_bytes, deleted_at, organization_id, organizations(name)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(300);

  return (
    <PageContent spacing="roomy" className="space-y-6">
      <SlideUp>
        <section className="mb-8 flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
            <Trash2 className="h-5 w-5 text-[var(--gbp-accent)]" />
            <h1 className="text-xl font-bold">Papelera Global</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Gestión de documentos eliminados de todas las empresas. Retención máxima: 30 días.
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <SuperadminDocumentTrashList documents={(documents as TrashedDocumentRow[] | null) ?? []} />
      </SlideUp>
    </PageContent>
  );
}
