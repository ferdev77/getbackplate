import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getEmployeeDocumentIdSet } from "@/shared/lib/document-domain";

type Scope = {
  locations?: string[];
  department_ids?: string[];
  position_ids?: string[];
  users?: string[];
};

function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  return `"${raw.replaceAll("\"", '""')}"`;
}

async function requireContext() {
  const moduleAccess = await assertCompanyAdminModuleApi("documents");
  if (!moduleAccess.ok) {
    return {
      error: NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const tenant = moduleAccess.tenant;

  return { supabase, tenant };
}

export async function GET() {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant } = context;

  const [{ data: folders }, { data: branches }, { data: departments }, employeeDocumentIds] = await Promise.all([
    supabase
      .from("document_folders")
      .select("id, name, access_scope")
      .eq("organization_id", tenant.organizationId),
    supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", tenant.organizationId),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId),
    getEmployeeDocumentIdSet(supabase, tenant.organizationId),
  ]);

  const docs = await collectAllDocumentsForExport(supabase, tenant.organizationId);

  const companyDocs = (docs ?? []).filter((doc) => !employeeDocumentIds.has(doc.id));

  const folderMap = new Map((folders ?? []).map((row) => [row.id, row]));
  const branchMap = new Map((branches ?? []).map((row) => [row.id, row.name]));
  const deptMap = new Map((departments ?? []).map((row) => [row.id, row.name]));

  const header = [
    "ID",
    "Titulo",
    "Carpeta",
    "Locacion",
    "Departamento",
    "Puesto",
    "UsuariosScope",
    "TipoMime",
    "TamanoBytes",
    "Creado",
  ];

  const rows = companyDocs.map((doc) => {
    const folderScope = doc.folder_id ? ((folderMap.get(doc.folder_id)?.access_scope as Scope | null) ?? null) : null;
    const scope = folderScope ?? ((doc.access_scope as Scope | null) ?? {});
    const deptName = (scope.department_ids ?? []).map((id) => deptMap.get(id) ?? id).join(" | ");
    const positionName = (scope.position_ids ?? []).join(" | ");
    const branchName = doc.branch_id ? (branchMap.get(doc.branch_id) ?? null) : null;
    const scopedLocationNames = (scope.locations ?? []).map((id) => branchMap.get(id) ?? id).join(" | ");
    const locationName = (branchName ?? scopedLocationNames) || "Global";
    const usersCount = (scope.users ?? []).length;

    return [
      doc.id,
      doc.title,
      doc.folder_id ? folderMap.get(doc.folder_id)?.name ?? doc.folder_id : "Sin carpeta",
      locationName,
      deptName || "-",
      positionName || "-",
      usersCount,
      doc.mime_type ?? "",
      doc.file_size_bytes ?? "",
      doc.created_at,
    ];
  });

  const csv = [header, ...rows].map((line) => line.map((cell) => csvCell(cell)).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=documentos-${stamp}.csv`,
      "Cache-Control": "no-store",
    },
  });
}

async function collectAllDocumentsForExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
) {
  const pageSize = 1000;
  const rows: Array<{
    id: string;
    title: string;
    folder_id: string | null;
    branch_id: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    created_at: string;
    access_scope: unknown;
  }> = [];

  for (let from = 0; from < 100_000; from += pageSize) {
    const { data } = await supabase
      .from("documents")
      .select("id, title, folder_id, branch_id, mime_type, file_size_bytes, created_at, access_scope")
      .is("deleted_at", null)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    const batch = (data ?? []) as Array<{
      id: string;
      title: string;
      folder_id: string | null;
      branch_id: string | null;
      mime_type: string | null;
      file_size_bytes: number | null;
      created_at: string;
      access_scope: unknown;
    }>;

    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }

  return rows;
}
