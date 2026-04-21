import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { isEmployeeLinkedDocument } from "@/shared/lib/document-domain";

const BUCKET_NAME = "tenant-documents";

async function requireContext() {
  const moduleAccess = await assertEmployeeCapabilityApi("documents", "delete", { allowBillingBypass: true });
  if (!moduleAccess.ok) {
    return {
      error: NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status }),
    };
  }

  const admin = createSupabaseAdminClient();
  return { admin, tenant: moduleAccess.tenant, userId: moduleAccess.userId };
}

export async function PATCH(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { admin, tenant, userId } = context;
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();

  if (!documentId) {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
  }

  const { data: document } = await admin
    .from("documents")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("owner_user_id", userId)
    .eq("id", documentId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Documento no encontrado o no esta en tu papelera" }, { status: 404 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(admin, tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento de legajo de empleado: no permitido" }, { status: 403 });
  }

  const { error } = await admin
    .from("documents")
    .update({ deleted_at: null })
    .eq("organization_id", tenant.organizationId)
    .eq("owner_user_id", userId)
    .eq("id", documentId);

  if (error) {
    await logAuditEvent({
      action: "employee.documents.trash.restore",
      entityType: "document",
      entityId: documentId,
      organizationId: tenant.organizationId,
      actorId: userId,
      eventDomain: "documents",
      outcome: "error",
      severity: "high",
      metadata: { error: error.message },
    });
    return NextResponse.json({ error: `No se pudo restaurar el documento: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.documents.trash.restore",
    entityType: "document",
    entityId: documentId,
    organizationId: tenant.organizationId,
    actorId: userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "low",
  });

  return NextResponse.json({ ok: true, message: "Documento restaurado" });
}

export async function DELETE(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { admin, tenant, userId } = context;
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();

  if (!documentId) {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
  }

  const { data: document } = await admin
    .from("documents")
    .select("id, file_path")
    .eq("organization_id", tenant.organizationId)
    .eq("owner_user_id", userId)
    .eq("id", documentId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Documento no encontrado o no esta en tu papelera" }, { status: 404 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(admin, tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento de legajo de empleado: no permitido" }, { status: 403 });
  }

  const { error } = await admin
    .from("documents")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("owner_user_id", userId)
    .eq("id", documentId);

  if (error) {
    await logAuditEvent({
      action: "employee.documents.trash.purge",
      entityType: "document",
      entityId: documentId,
      organizationId: tenant.organizationId,
      actorId: userId,
      eventDomain: "documents",
      outcome: "error",
      severity: "high",
      metadata: { file_path: document.file_path, error: error.message },
    });
    return NextResponse.json({ error: `No se pudo eliminar definitivamente: ${error.message}` }, { status: 400 });
  }

  if (
    document.file_path &&
    isSafeTenantStoragePath(document.file_path, tenant.organizationId, { allowLegacySeedPrefix: true })
  ) {
    await admin.storage.from(BUCKET_NAME).remove([document.file_path]);
  }

  await logAuditEvent({
    action: "employee.documents.trash.purge",
    entityType: "document",
    entityId: documentId,
    organizationId: tenant.organizationId,
    actorId: userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: { file_path: document.file_path },
  });

  return NextResponse.json({ ok: true });
}
