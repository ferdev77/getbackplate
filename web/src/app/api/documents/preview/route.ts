import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { isModuleEnabledForOrganization } from "@/shared/lib/access";
import { canReadDocumentInTenant } from "@/shared/lib/document-access";
import { isEmployeePrivateDocument } from "@/shared/lib/employee-private-documents";
import { resolveActiveSuperadminImpersonationSession } from "@/shared/lib/impersonation";
import {
  isAllowedDocumentMime,
  isAllowedDocumentSize,
  isSafeTenantStoragePath,
} from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const documentId = String(url.searchParams.get("documentId") ?? "").trim();
  if (!documentId) {
    return NextResponse.json({ error: "documentId requerido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, branch_id, role_id")
    .eq("user_id", userId)
    .eq("status", "active");

  const impersonation = await resolveActiveSuperadminImpersonationSession(userId);

  const orgIds = [
    ...new Set(
      [
        ...(memberships ?? []).map((m) => m.organization_id),
        ...(impersonation?.organizationId ? [impersonation.organizationId] : []),
      ].filter(Boolean),
    ),
  ];

  if (!orgIds.length) {
    return NextResponse.json({ error: "Sin membresia activa" }, { status: 403 });
  }

  const roleIds = [...new Set((memberships ?? []).map((row) => row.role_id))];
  const { data: roles } = await supabase.from("roles").select("id, code").in("id", roleIds);
  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));

  const admin = createSupabaseAdminClient();
  const { data: document, error: docError } = await admin
    .from("documents")
    .select("id, title, file_path, organization_id, branch_id, folder_id, access_scope, mime_type, file_size_bytes")
    .is("deleted_at", null)
    .eq("id", documentId)
    .in("organization_id", orgIds)
    .single();

  if (docError || !document) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const membership = (memberships ?? []).find((row) => row.organization_id === document.organization_id);
  if (!membership && impersonation?.organizationId !== document.organization_id) {
    return NextResponse.json({ error: "Sin acceso a este documento" }, { status: 403 });
  }

  const documentsModuleEnabled = await isModuleEnabledForOrganization(document.organization_id, "documents");
  if (!documentsModuleEnabled) {
    return NextResponse.json({ error: "module_disabled_for_tenant" }, { status: 403 });
  }

  if (
    !isSafeTenantStoragePath(document.file_path, document.organization_id, { allowLegacySeedPrefix: true }) ||
    !isAllowedDocumentMime(document.mime_type) ||
    !isAllowedDocumentSize(document.file_size_bytes)
  ) {
    return NextResponse.json({ error: "Documento bloqueado por validaciones de seguridad" }, { status: 403 });
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, department_id, position, branch_id")
    .eq("organization_id", document.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  let employeePositionIds: string[] = [];
  if (employeeRow?.position) {
    const { data: positionRows } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", document.organization_id)
      .eq("is_active", true)
      .eq("name", employeeRow.position)
      .limit(20);
    employeePositionIds = (positionRows ?? []).map((row) => row.id);
  }

  let isDirectlyAssigned = false;
  if (employeeRow?.id) {
    const { data: link } = await supabase
      .from("employee_documents")
      .select("id")
      .eq("organization_id", document.organization_id)
      .eq("employee_id", employeeRow.id)
      .eq("document_id", document.id)
      .maybeSingle();
    isDirectlyAssigned = Boolean(link);
  }

  let effectiveAccessScope = document.access_scope;
  if (document.folder_id) {
    const { data: folder } = await admin
      .from("document_folders")
      .select("id, access_scope")
      .eq("organization_id", document.organization_id)
      .eq("id", document.folder_id)
      .maybeSingle();
    if (folder?.access_scope) {
      effectiveAccessScope = folder.access_scope;
    }
  }

  const isPrivateEmployeeDoc = isEmployeePrivateDocument(effectiveAccessScope, document.title);
  const orgMemberships = (memberships ?? []).filter((row) => row.organization_id === document.organization_id);
  const fallbackMemberships =
    !orgMemberships.length && impersonation?.organizationId === document.organization_id
      ? [{ organization_id: document.organization_id, branch_id: null, role_id: "__impersonation__" }]
      : [];

  let canRead = false;
  for (const candidate of [...orgMemberships, ...fallbackMemberships]) {
    const roleCode =
      candidate.role_id === "__impersonation__"
        ? "company_admin"
        : (roleCodeById.get(candidate.role_id) ?? "");
    if (roleCode === "employee" && isPrivateEmployeeDoc) continue;

    const allowed = canReadDocumentInTenant({
      roleCode,
      userId,
      branchId: candidate.branch_id ?? employeeRow?.branch_id ?? null,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      isDirectlyAssigned,
      accessScope: effectiveAccessScope,
    });

    if (allowed) {
      canRead = true;
      break;
    }
  }

  if (!canRead) {
    return NextResponse.json({ error: "Sin acceso a este documento" }, { status: 403 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(document.file_path, 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "No se pudo generar enlace" }, { status: 500 });
  }

  const storageResponse = await fetch(signed.signedUrl);
  if (!storageResponse.ok || !storageResponse.body) {
    return NextResponse.json({ error: "No se pudo generar vista previa" }, { status: 500 });
  }

  const safeFileName = `${document.title || "documento"}`.replace(/[\r\n"]/g, "").slice(0, 120);
  return new NextResponse(storageResponse.body, {
    status: 200,
    headers: {
      "Content-Type": document.mime_type || storageResponse.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Cache-Control": "private, max-age=30",
    },
  });
}
