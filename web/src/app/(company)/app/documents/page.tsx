import Link from "next/link";
import { FolderPlus, LayoutGrid, UploadCloud } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { DocumentsTreeWorkspace } from "@/modules/documents/ui/documents-tree-workspace";
import { DocumentFolderModal } from "@/modules/documents/ui/document-folder-modal";
import { UploadDocumentModal } from "@/modules/documents/ui/upload-document-modal";
import { requireTenantModule } from "@/shared/lib/access";
import { SlideUp } from "@/shared/ui/animations";

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
  const admin = createSupabaseAdminClient();

  const [{ data: folders }, { data: documents }, { data: branches }, { data: employees }, { data: userProfiles }, { data: departments }, { data: positions }, { data: memberships }, { data: roles }] =
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
      admin
        .from("branches")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      (openFolderModal || openUploadModal) 
        ? admin
            .from("employees")
            .select("id, user_id, first_name, last_name, branch_id, department_id, position")
            .eq("organization_id", tenant.organizationId)
            .order("first_name")
        : Promise.resolve({ data: [] }),
      (openFolderModal || openUploadModal)
        ? admin
            .from("organization_user_profiles")
            .select("id, user_id, first_name, last_name")
            .eq("organization_id", tenant.organizationId)
            .eq("is_employee", false)
            .order("first_name")
        : Promise.resolve({ data: [] }),
      admin
        .from("organization_departments")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      (openFolderModal || openUploadModal)
        ? admin
            .from("department_positions")
            .select("id, department_id, name")
            .eq("organization_id", tenant.organizationId)
            .eq("is_active", true)
            .order("name")
        : Promise.resolve({ data: [] }),
      (openFolderModal || openUploadModal)
        ? admin
            .from("memberships")
            .select("user_id, role_id")
            .eq("organization_id", tenant.organizationId)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      (openFolderModal || openUploadModal)
        ? admin
            .from("roles")
            .select("id, code")
        : Promise.resolve({ data: [] }),
    ]);

  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const employeeRoleUserIds = new Set(
    (memberships ?? [])
      .filter((membership) => roleCodeById.get(membership.role_id) === "employee")
      .map((membership) => membership.user_id),
  );
  const branchNameById = new Map((branches ?? []).map((row) => [row.id, row.name]));
  const departmentNameById = new Map((departments ?? []).map((row) => [row.id, row.name]));

  const scopedUsers = [
    ...(employees ?? []).map((user) => ({
      id: user.id,
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      role_label: "Empleado",
      location_label: user.branch_id ? (branchNameById.get(user.branch_id) ?? undefined) : undefined,
      department_label: user.department_id ? (departmentNameById.get(user.department_id) ?? undefined) : undefined,
      position_label: user.position ?? undefined,
    })),
    ...(userProfiles ?? [])
      .filter((profile) => !profile.user_id || !(employees ?? []).some((employee) => employee.user_id === profile.user_id))
      .map((profile) => ({
        id: `up-${profile.id}`,
        user_id: profile.user_id,
        first_name: profile.first_name ?? "Usuario",
        last_name: profile.last_name ?? "",
        role_label: "Usuario",
      })),
    ...Array.from(employeeRoleUserIds)
      .filter((userId) => Boolean(userId))
      .filter((userId) => !(employees ?? []).some((employee) => employee.user_id === userId))
      .filter((userId) => !(userProfiles ?? []).some((profile) => profile.user_id === userId))
      .map((userId) => ({
        id: `m-${userId}`,
        user_id: userId,
        first_name: "Usuario",
        last_name: userId.slice(0, 8),
        role_label: "Usuario",
      })),
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <SlideUp>
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
      </SlideUp>

      <SlideUp delay={0.1}>
        <DocumentsTreeWorkspace
          organizationId={tenant.organizationId}
          folders={folders ?? []}
          documents={documents ?? []}
          branches={branches ?? []}
          departments={departments ?? []}
          positions={positions ?? []}
          users={scopedUsers}
        />
      </SlideUp>

      {openFolderModal ? (
        <DocumentFolderModal 
          folders={folders ?? []}
          branches={branches ?? []}
          departments={departments ?? []}
          positions={positions ?? []}
          employees={scopedUsers}
        />
      ) : null}

      {openUploadModal ? (
        <UploadDocumentModal
          folders={(folders ?? []).map((folder) => ({ id: folder.id, name: folder.name }))}
          branches={branches ?? []}
          departments={departments ?? []}
          positions={positions ?? []}
          employees={scopedUsers}
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
