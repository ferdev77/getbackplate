import Link from "next/link";
import { FolderPlus, LayoutGrid, UploadCloud } from "lucide-react";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import {
  createDocumentFolderAction,
} from "@/modules/documents/actions";
import { DocumentsTreeWorkspace } from "@/modules/documents/ui/documents-tree-workspace";
import { UploadDocumentModal } from "@/modules/documents/ui/upload-document-modal";
import { requireTenantModule } from "@/shared/lib/access";
import { ScopeSelector } from "@/shared/ui/scope-selector";

type CompanyDocumentsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string }>;
};

export default async function CompanyDocumentsPage({
  searchParams,
}: CompanyDocumentsPageProps) {
  const tenant = await requireTenantModule("documents");
  const params = await searchParams;
  const openFolderModal = params.action === "create-folder";
  const openUploadModal = params.action === "upload";
  const supabase = await createSupabaseServerClient();

  const [{ data: folders }, { data: documents }, { data: branches }, { data: employees }, { data: departments }, { data: positions }] =
    await Promise.all([
      supabase
        .from("document_folders")
        .select("id, name, parent_id, access_scope, created_at")
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("id, title, file_size_bytes, mime_type, file_path, folder_id, branch_id, access_scope, created_at")
        .eq("organization_id", tenant.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("branches")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("employees")
        .select("id, user_id, first_name, last_name")
        .eq("organization_id", tenant.organizationId)
        .not("user_id", "is", null)
        .order("first_name"),
      supabase
        .from("organization_departments")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("department_positions")
        .select("id, department_id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
    ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[#1f1a17]">
          <LayoutGrid className="h-4 w-4" />
          <h1 className="text-[18px] font-bold">Documentos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/api/company/documents/export" className="inline-flex h-[33px] items-center rounded-lg border border-[#ddd5d0] bg-white px-3 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1]">Exportar</Link>
          <Link href="/app/documents?action=create-folder" className="inline-flex h-[33px] items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-3 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1]"><FolderPlus className="h-3.5 w-3.5" /> Nueva Carpeta</Link>
          <Link href="/app/documents?action=upload" className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[#111] px-3 text-xs font-bold text-white hover:bg-[#c0392b]"><UploadCloud className="h-3.5 w-3.5" /> Subir Archivo</Link>
        </div>
      </section>

      {params.message ? (
        <section
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            params.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {params.message}
        </section>
      ) : null}

      <DocumentsTreeWorkspace
        organizationId={tenant.organizationId}
        folders={folders ?? []}
        documents={documents ?? []}
        branches={branches ?? []}
        departments={departments ?? []}
        positions={positions ?? []}
        users={employees ?? []}
      />

      {openFolderModal ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <div className="max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5"><p className="font-serif text-[15px] font-bold text-[#111]">Nueva Carpeta</p><Link href="/app/documents" className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link></div>
            <form action={createDocumentFolderAction}>
              <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Nombre de la carpeta</label>
                <input name="name" required className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm" placeholder="ej. Manuales, Operaciones" />
                <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Crear en</label>
                <select name="parent_id" defaultValue="" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"><option value="">Raiz</option>{(folders ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
                <ScopeSelector
                  namespace="folder"
                  branches={branches ?? []}
                  departments={departments ?? []}
                  positions={positions ?? []}
                  users={employees ?? []}
                  locationInputName="location_scope"
                  departmentInputName="department_scope"
                  positionInputName="position_scope"
                  userInputName="user_scope"
                />
              </div>
              <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4"><Link href="/app/documents" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cancelar</Link><button className="rounded-lg bg-[#111] px-5 py-2 text-sm font-bold text-white hover:bg-[#c0392b]" type="submit">Crear Carpeta</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {openUploadModal ? (
        <UploadDocumentModal
          folders={(folders ?? []).map((folder) => ({ id: folder.id, name: folder.name }))}
          branches={branches ?? []}
          departments={departments ?? []}
          positions={positions ?? []}
          employees={employees ?? []}
          recentDocuments={(documents ?? []).map((document) => ({
            id: document.id,
            title: document.title,
            branch_id: document.branch_id,
            created_at: document.created_at,
          }))}
        />
      ) : null}
    </main>
  );
}
