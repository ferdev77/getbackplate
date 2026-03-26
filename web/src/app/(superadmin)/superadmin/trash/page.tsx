import { Trash2 } from "lucide-react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { SuperadminDocumentTrashList } from "@/modules/trash/ui/superadmin-document-trash-list";
import { SlideUp } from "@/shared/ui/animations";

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
    <main className="w-full space-y-6">
      <SlideUp>
        <section className="mb-8 flex flex-col gap-1">
          <div className={`inline-flex items-center gap-2 text-[#1f1a17] [.theme-dark-pro_&]:text-[#e7edf7]`}>
            <Trash2 className="h-5 w-5 text-[#f97316] [.theme-dark-pro_&]:text-orange-500" />
            <h1 className="text-xl font-bold">Papelera Global</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Gestión de documentos eliminados de todas las empresas. Retención máxima: 30 días.
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <SuperadminDocumentTrashList documents={(documents as any) ?? []} />
      </SlideUp>
    </main>
  );
}
